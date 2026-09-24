import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export type AttributeValue = boolean | number | string | string[];

export type CandidatePub = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  beerTypes: string[];
  servesMeals: boolean;
  attributes?: Record<string, AttributeValue>;
};

export type CrawlRequest = {
  stopCount: number;
  requiredBeerTypes: string[];
  requireMeal: boolean;
  minDistanceKm?: number;
  maxDistanceKm?: number;
  minPubDistanceKm?: number;
};

type MapPin = Pick<CandidatePub, "name" | "latitude" | "longitude">;

type AttributeKind = "boolean" | "number" | "categorical";

type AttributeMatrices = {
  booleanNames: string[];
  booleans: boolean[][];
  numberNames: string[];
  numbers: number[][];
  valueNames: string[];
  values: boolean[][];
};

type SolverResult = {
  route: number[];
  distanceMetres: number;
};

type SolveMode = "optimize" | "satisfy";

type CliOptions = {
  mode: SolveMode;
  pubsFile: string;
  constraintsFile: string;
  outputFile: string;
};

const HOTEL = {
  latitude: 55.6757,
  longitude: 12.5617,
};

const DEFAULT_OPTIONS: CliOptions = {
  mode: "optimize",
  pubsFile: "data/pub-candidates.json",
  constraintsFile: "data/crawl-request.json",
  outputFile: "data/optimized-crawl.json",
};

const MAX_DISTANCE_METRES = 1_000_000_000;

export function parseCandidatePubs(value: unknown): CandidatePub[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("Candidate pubs must be a non-empty JSON array.");
  }

  const pubs = value.map((candidate, index) => parseCandidatePub(candidate, index));
  const ids = new Set<string>();

  for (const pub of pubs) {
    if (ids.has(pub.id)) {
      throw new Error(`Duplicate pub id: ${pub.id}.`);
    }
    ids.add(pub.id);
  }

  return pubs;
}

export function parseCrawlRequest(value: unknown, pubs: CandidatePub[]): CrawlRequest {
  if (!isRecord(value)) {
    throw new Error("Crawl constraints must be a JSON object.");
  }

  const allowedFields = new Set([
    "stopCount",
    "requiredBeerTypes",
    "requireMeal",
    "minDistanceKm",
    "maxDistanceKm",
    "minPubDistanceKm",
  ]);

  for (const field of Object.keys(value)) {
    if (!allowedFields.has(field)) {
      throw new Error(`Unknown crawl constraint: ${field}.`);
    }
  }

  const stopCount = requireWholeNumber(value.stopCount, "stopCount", 1);
  if (stopCount > pubs.length) {
    throw new Error(`stopCount cannot exceed the ${pubs.length} candidate pubs.`);
  }

  const requiredBeerTypes = unique(
    requireStringArray(value.requiredBeerTypes, "requiredBeerTypes"),
  );
  const availableBeerTypes = new Set(pubs.flatMap((pub) => pub.beerTypes));
  for (const beerType of requiredBeerTypes) {
    if (!availableBeerTypes.has(beerType)) {
      throw new Error(`No candidate pub offers required beer type: ${beerType}.`);
    }
  }

  const minDistanceKm = optionalNonNegativeNumber(
    value.minDistanceKm,
    "minDistanceKm",
  );
  const maxDistanceKm = optionalNonNegativeNumber(
    value.maxDistanceKm,
    "maxDistanceKm",
  );
  const minPubDistanceKm = optionalNonNegativeNumber(
    value.minPubDistanceKm,
    "minPubDistanceKm",
  );

  if (maxDistanceKm === 0) {
    throw new Error("maxDistanceKm must be greater than zero.");
  }
  if (
    minDistanceKm !== undefined &&
    maxDistanceKm !== undefined &&
    minDistanceKm > maxDistanceKm
  ) {
    throw new Error("minDistanceKm must not exceed maxDistanceKm.");
  }

  return {
    stopCount,
    requiredBeerTypes,
    requireMeal: requireBoolean(value.requireMeal, "requireMeal"),
    ...(minDistanceKm === undefined ? {} : { minDistanceKm }),
    ...(maxDistanceKm === undefined ? {} : { maxDistanceKm }),
    ...(minPubDistanceKm === undefined ? {} : { minPubDistanceKm }),
  };
}

export function calculateDistanceMetres(
  from: Pick<CandidatePub, "latitude" | "longitude">,
  to: Pick<CandidatePub, "latitude" | "longitude">,
): number {
  const earthRadiusMetres = 6_371_000;
  const latitudeDelta = degreesToRadians(to.latitude - from.latitude);
  const longitudeDelta = degreesToRadians(to.longitude - from.longitude);
  const fromLatitude = degreesToRadians(from.latitude);
  const toLatitude = degreesToRadians(to.latitude);

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return Math.round(
    earthRadiusMetres *
      2 *
      Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)),
  );
}

export function buildAttributeMatrices(pubs: CandidatePub[]): AttributeMatrices {
  const attributeKinds = new Map<string, AttributeKind>();

  for (const pub of pubs) {
    for (const [name, value] of Object.entries(pub.attributes ?? {})) {
      const kind = attributeKind(value, pub.id, name);
      const existingKind = attributeKinds.get(name);
      if (existingKind !== undefined && existingKind !== kind) {
        throw new Error(`Attribute ${name} has mixed types across candidate pubs.`);
      }
      attributeKinds.set(name, kind);
    }
  }

  for (const [name] of attributeKinds) {
    for (const pub of pubs) {
      if (!(name in (pub.attributes ?? {}))) {
        throw new Error(`Pub ${pub.id} is missing attribute ${name}.`);
      }
    }
  }

  const booleanNames = sortedNames(attributeKinds, "boolean");
  const numberNames = sortedNames(attributeKinds, "number");
  const categoricalNames = sortedNames(attributeKinds, "categorical");
  const valueNames = categoricalNames.flatMap((name) => {
    const values = pubs.flatMap((pub) =>
      categoricalValues(pub.attributes?.[name] as string | string[]),
    );
    return unique(values)
      .sort()
      .map((value) => `${name}=${value}`);
  });

  return {
    booleanNames,
    booleans: pubs.map((pub) =>
      booleanNames.map((name) => pub.attributes?.[name] as boolean),
    ),
    numberNames,
    numbers: pubs.map((pub) =>
      numberNames.map((name) => pub.attributes?.[name] as number),
    ),
    valueNames,
    values: pubs.map((pub) =>
      valueNames.map((entry) => {
        const separator = entry.indexOf("=");
        const name = entry.slice(0, separator);
        const value = entry.slice(separator + 1);
        return categoricalValues(
          pub.attributes?.[name] as string | string[],
        ).includes(value);
      }),
    ),
  };
}

function parseCandidatePub(value: unknown, index: number): CandidatePub {
  const prefix = `Candidate pub ${index + 1}`;
  if (!isRecord(value)) {
    throw new Error(`${prefix} must be a JSON object.`);
  }

  const id = requireNonEmptyString(value.id, `${prefix}.id`);
  const attributes = parseAttributes(value.attributes, id, prefix);

  return {
    id,
    name: requireNonEmptyString(value.name, `${prefix}.name`),
    latitude: requireCoordinate(value.latitude, `${prefix}.latitude`, -90, 90),
    longitude: requireCoordinate(
      value.longitude,
      `${prefix}.longitude`,
      -180,
      180,
    ),
    beerTypes: unique(requireStringArray(value.beerTypes, `${prefix}.beerTypes`)),
    servesMeals: requireBoolean(value.servesMeals, `${prefix}.servesMeals`),
    ...(attributes === undefined ? {} : { attributes }),
  };
}

function parseAttributes(
  value: unknown,
  pubId: string,
  prefix: string,
): Record<string, AttributeValue> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new Error(`${prefix}.attributes must be a JSON object.`);
  }

  const attributes: Record<string, AttributeValue> = {};
  for (const [name, attributeValue] of Object.entries(value)) {
    if (name.trim() === "") {
      throw new Error(`${prefix} contains an empty attribute name.`);
    }
    attributeKind(attributeValue, pubId, name);
    attributes[name] = attributeValue as AttributeValue;
  }
  return attributes;
}

function attributeKind(value: unknown, pubId: string, name: string): AttributeKind {
  if (typeof value === "boolean") {
    return "boolean";
  }
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return "number";
  }
  if (typeof value === "string" && value.trim() !== "") {
    return "categorical";
  }
  if (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => typeof item === "string" && item.trim() !== "")
  ) {
    return "categorical";
  }
  throw new Error(
    `Pub ${pubId} attribute ${name} must be a boolean, whole number, non-empty string, or non-empty string array.`,
  );
}

function sortedNames(
  kinds: Map<string, AttributeKind>,
  wantedKind: AttributeKind,
): string[] {
  return [...kinds]
    .filter(([, kind]) => kind === wantedKind)
    .map(([name]) => name)
    .sort();
}

function categoricalValues(value: string | string[]): string[] {
  return typeof value === "string" ? [value] : value;
}

function createMiniZincData(pubs: CandidatePub[], request: CrawlRequest): string {
  const beerTypes = unique(pubs.flatMap((pub) => pub.beerTypes)).sort();
  const requiredBeerTypes = new Set(request.requiredBeerTypes);
  const points = [HOTEL, ...pubs];
  const distances = points.map((from) =>
    points.map((to) => calculateDistanceMetres(from, to)),
  );
  const attributes = buildAttributeMatrices(pubs);

  return [
    "% Generated by optimizer/optimize.ts",
    `% Boolean attributes: ${indexComment(attributes.booleanNames)}`,
    `% Number attributes: ${indexComment(attributes.numberNames)}`,
    `% Categorical values: ${indexComment(attributes.valueNames)}`,
    `pub_count = ${pubs.length};`,
    `stop_count = ${request.stopCount};`,
    `distance_m = ${matrixLiteral(distances, 0, 0)};`,
    `serves_meals = ${arrayLiteral(pubs.map((pub) => pub.servesMeals))};`,
    `beer_type_count = ${beerTypes.length};`,
    `has_beer = ${matrixLiteral(
      pubs.map((pub) => beerTypes.map((beerType) => pub.beerTypes.includes(beerType))),
    )};`,
    `required_beer = ${arrayLiteral(
      beerTypes.map((beerType) => requiredBeerTypes.has(beerType)),
    )};`,
    `bool_attribute_count = ${attributes.booleanNames.length};`,
    `bool_attribute = ${matrixLiteral(attributes.booleans)};`,
    `number_attribute_count = ${attributes.numberNames.length};`,
    `number_attribute = ${matrixLiteral(attributes.numbers)};`,
    `value_count = ${attributes.valueNames.length};`,
    `has_value = ${matrixLiteral(attributes.values)};`,
    `require_meal = ${request.requireMeal};`,
    `min_pub_distance_m = ${Math.round(
      (request.minPubDistanceKm ?? 0) * 1000,
    )};`,
    `min_distance_m = ${Math.round((request.minDistanceKm ?? 0) * 1000)};`,
    `max_distance_m = ${Math.round(
      (request.maxDistanceKm ?? MAX_DISTANCE_METRES / 1000) * 1000,
    )};`,
    "",
  ].join("\n");
}

function matrixLiteral(
  rows: Array<Array<boolean | number>>,
  rowStart = 1,
  columnStart = 1,
): string {
  const rowEnd = rowStart + rows.length - 1;
  const columnEnd = columnStart + (rows[0]?.length ?? 0) - 1;
  const values = rows.flat().map(String).join(", ");
  return `array2d(${rowStart}..${rowEnd}, ${columnStart}..${columnEnd}, [${values}])`;
}

function arrayLiteral(values: Array<boolean | number>): string {
  return `[${values.map(String).join(", ")}]`;
}

function indexComment(names: string[]): string {
  return names.length === 0
    ? "none"
    : names.map((name, index) => `${index + 1}=${name}`).join(", ");
}

function parseSolverOutput(stdout: string): SolverResult {
  let solutionText: string | undefined;
  let status: string | undefined;

  for (const line of stdout.split("\n").map((item) => item.trim()).filter(Boolean)) {
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }

    if (!isRecord(event)) {
      continue;
    }
    if (event.type === "solution" && isRecord(event.output)) {
      const output = event.output.default;
      if (typeof output === "string") {
        solutionText = output;
      }
    }
    if (event.type === "status" && typeof event.status === "string") {
      status = event.status;
    }
  }

  if (solutionText === undefined) {
    if (status === "UNSATISFIABLE") {
      throw new Error("No pub crawl satisfies all requested constraints.");
    }
    throw new Error(`MiniZinc did not return a solution${status ? ` (${status})` : ""}.`);
  }

  const value: unknown = JSON.parse(solutionText);
  if (
    !isRecord(value) ||
    !Array.isArray(value.route) ||
    !value.route.every((index) => Number.isSafeInteger(index)) ||
    typeof value.distanceMetres !== "number"
  ) {
    throw new Error("MiniZinc returned an unexpected solution format.");
  }

  return {
    route: value.route as number[],
    distanceMetres: value.distanceMetres,
  };
}

function runMiniZinc(modelFile: string, dataFile: string): SolverResult {
  const result = spawnSync(
    "minizinc",
    ["--solver", "gecode", "--json-stream", modelFile, dataFile],
    { encoding: "utf8" },
  );

  if (result.error && "code" in result.error && result.error.code === "ENOENT") {
    throw new Error(
      "MiniZinc is not installed. Install the MiniZinc bundle and verify it with `minizinc --version`.",
    );
  }
  if (result.status !== 0 && result.stdout.trim() === "") {
    throw new Error(result.stderr.trim() || `MiniZinc exited with code ${result.status}.`);
  }

  try {
    return parseSolverOutput(result.stdout);
  } catch (error) {
    const details = result.stderr.trim();
    if (details !== "" && error instanceof Error) {
      throw new Error(`${error.message}\n${details}`);
    }
    throw error;
  }
}

function parseCliOptions(args: string[]): CliOptions {
  const options = { ...DEFAULT_OPTIONS };
  const fields: Record<string, "pubsFile" | "constraintsFile" | "outputFile"> = {
    "--pubs": "pubsFile",
    "--constraints": "constraintsFile",
    "--out": "outputFile",
  };
  let outputWasProvided = false;

  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];

    if (flag === "--mode" && (value === "optimize" || value === "satisfy")) {
      options.mode = value;
      continue;
    }

    const field = fields[flag];
    if (field === undefined || value === undefined || value.startsWith("--")) {
      throw new Error(
        "Usage: npm run <optimize|satisfy> -- [--pubs <file>] [--constraints <file>] [--out <file>]",
      );
    }
    options[field] = value;
    outputWasProvided ||= field === "outputFile";
  }

  if (!outputWasProvided) {
    options.outputFile =
      options.mode === "optimize"
        ? "data/optimized-crawl.json"
        : "data/satisfied-crawl.json";
  }

  return options;
}

async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not read ${file}: ${message}`);
  }
}

async function writeJsonAtomically(file: string, value: unknown): Promise<void> {
  const temporaryFile = path.join(
    path.dirname(file),
    `.${path.basename(file)}.tmp`,
  );
  await writeFile(temporaryFile, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryFile, file);
}

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2));
  const pubs = parseCandidatePubs(await readJson(options.pubsFile));
  const request = parseCrawlRequest(await readJson(options.constraintsFile), pubs);
  const workingDirectory = await mkdtemp(path.join(tmpdir(), "pub-crawl-"));

  try {
    const dataFile = path.join(workingDirectory, "crawl.dzn");
    await writeFile(dataFile, createMiniZincData(pubs, request), "utf8");

    const modelName =
      options.mode === "optimize"
        ? "pub-crawl.mzn"
        : "pub-crawl-satisfy.mzn";
    const modelFile = fileURLToPath(new URL(modelName, import.meta.url));
    console.time('MiniZinc solver time');
    const result = runMiniZinc(modelFile, dataFile);
    const route = result.route.map((pubIndex) => pubs[pubIndex - 1]);
    if (route.some((pub) => pub === undefined)) {
      throw new Error("MiniZinc returned a pub index outside the candidate list.");
    }

    const mapPins: MapPin[] = route.map(({ name, latitude, longitude }) => ({
      name,
      latitude,
      longitude,
    }));
    await writeJsonAtomically(options.outputFile, mapPins);

    const resultLabel = options.mode === "optimize" ? "Optimal crawl" : "Valid crawl";
    console.log(`${resultLabel}: ${route.map((pub) => pub.name).join(" -> ")}`);
    console.log(
      `Straight-line route estimate: ${(result.distanceMetres / 1000).toFixed(2)} km`,
    );
    console.log(`Wrote ${options.outputFile}`);
    console.timeEnd('MiniZinc solver time');
  } finally {
    await rm(workingDirectory, { recursive: true, force: true });
  }
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} must be a non-empty string.`);
  }
  return value.trim();
}

function requireStringArray(value: unknown, field: string): string[] {
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === "string" && item.trim() !== "")
  ) {
    throw new Error(`${field} must be an array of non-empty strings.`);
  }
  return value.map((item) => item.trim());
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${field} must be a boolean.`);
  }
  return value;
}

function requireWholeNumber(value: unknown, field: string, minimum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new Error(`${field} must be a whole number of at least ${minimum}.`);
  }
  return value as number;
}

function optionalNonNegativeNumber(value: unknown, field: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a non-negative number.`);
  }
  return value;
}

function requireCoordinate(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(`${field} must be between ${minimum} and ${maximum}.`);
  }
  return value;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function degreesToRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const entryPoint = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : undefined;

if (entryPoint === import.meta.url) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
