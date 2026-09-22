# Pub Crawl Optimizer Plan

## Goal

Add a small command-line optimizer that selects and orders a pub crawl from a
list of candidate pubs.

For this demo, **optimal** means:

- visit exactly the requested number of distinct pubs;
- start at the Imperial Hotel;
- include pubs that satisfy the requested beer-style coverage;
- include a meal stop when requested; and
- stay within the requested total-distance range; and
- minimize the total straight-line distance within those constraints.

The generated route will use the map's existing JSON format, so it can be shown
with:

```text
http://127.0.0.1:4173/?data=data/optimized-crawl.json
```

This is intentionally a local CLI, not a service. It keeps the constraint model
visible and easy to explain during a lightning talk. The data adapter should
also make it cheap to add playful pub properties and constraints later, without
trying to predict those constraints now.

## Proposed User Flow

1. Edit the candidate pubs and their attributes in
   `data/pub-candidates.json`.
2. Edit the crawl constraints in `data/crawl-request.json`.
3. Run:

   ```bash
   npm run optimize
   ```

4. The script validates the input, runs MiniZinc with Gecode, and writes
   `data/optimized-crawl.json`.
5. Open the generated route in the existing map.

An optional later convenience script can run both optimizer and Vite, but it is
not necessary for the first milestone.

## Keep-It-Simple Architecture

```text
pub-candidates.json + crawl-request.json
                  |
                  v
        TypeScript CLI adapter
        - validates friendly JSON
        - calculates distance matrix
        - writes MiniZinc data
                  |
                  v
          pub-crawl.mzn + Gecode
                  |
                  v
        ordered pub indexes + distance
                  |
                  v
       optimized-crawl.json -> existing map
```

Use the MiniZinc CLI as a child process. Do not add an HTTP server, database,
framework, map-routing API, or MiniZinc JavaScript/WASM integration.

### Why Gecode

Gecode is an open-source constraint-programming solver and is included in the
official MiniZinc bundle. It is a good fit for a small route-selection model and
keeps setup free. The solver command should be explicit and reproducible:

```bash
minizinc --solver gecode --json-stream optimizer/pub-crawl.mzn <generated-data>
```

Official references:

- [MiniZinc installation and bundled solvers](https://docs.minizinc.org/en/latest/installation.html)
- [MiniZinc command-line tool](https://docs.minizinc.dev/en/latest/command_line.html)
- [Gecode solver overview](https://docs.minizinc.org/en/2.10.1/solvers.html#gecode)

MiniZinc is not currently installed in this development environment, so it is a
documented local prerequisite. Verify it with `minizinc --version` before the
first run.

## Input Data

### Candidate Pubs

Create `data/pub-candidates.json`:

```json
[
  {
    "id": "jernbanecafeen",
    "name": "Jernbanecafeen",
    "latitude": 55.6721637,
    "longitude": 12.5636709,
    "beerTypes": ["lager", "classic"],
    "servesMeals": false,
    "attributes": {
      "hasDartboard": true,
      "coziness": 4,
      "vibe": "classic"
    }
  },
  {
    "id": "warpigs",
    "name": "Warpigs Brewpub",
    "latitude": 55.6685278,
    "longitude": 12.5599599,
    "beerTypes": ["ipa", "stout"],
    "servesMeals": true,
    "attributes": {
      "hasDartboard": false,
      "coziness": 2,
      "vibe": "loud"
    }
  }
]
```

Fields for the first version:

| Field | Type | Purpose |
| --- | --- | --- |
| `id` | string | Stable identifier used by the optimizer |
| `name` | string | Display name used by the map |
| `latitude` | number | Pub latitude |
| `longitude` | number | Pub longitude |
| `beerTypes` | string[] | Beer styles available at the pub |
| `servesMeals` | boolean | Whether the pub can satisfy the meal constraint |
| `attributes` | optional object | Future demo properties used by new constraints |

Keep the beer-style vocabulary small and human-readable, for example `lager`,
`ipa`, `stout`, `sour`, and `alcohol-free`. Validation should reject duplicate
IDs, unknown fields in the constraints, invalid coordinates, and empty beer
type names with useful messages.

### Crawl Request

Create `data/crawl-request.json`:

```json
{
  "stopCount": 5,
  "requiredBeerTypes": ["ipa", "stout"],
  "requireMeal": true,
  "minDistanceKm": 2,
  "maxDistanceKm": 5,
  "returnToHotel": false
}
```

Constraints for the first version:

| Field | Type | Meaning |
| --- | --- | --- |
| `stopCount` | positive integer | Exact number of pubs in the crawl |
| `requiredBeerTypes` | string[] | Every listed style must occur at least once |
| `requireMeal` | boolean | At least one selected pub must serve meals |
| `minDistanceKm` | optional non-negative number | Minimum total route distance |
| `maxDistanceKm` | optional positive number | Maximum total route distance |
| `returnToHotel` | boolean | Include the final pub-to-hotel leg in the objective |

Either distance bound may be omitted. When both are supplied,
`minDistanceKm` must not exceed `maxDistanceKm`. The example asks for a route
that is at least 2 km and at most 5 km long.

The hotel remains fixed in code/config for this demo because the map already
uses the Imperial Hotel. Making arbitrary start locations configurable can wait
until there is a real need.

## Extensibility for Future Constraints

Future constraints are part of the fun of the demo: examples might include
"visit a pub with a dartboard", "average coziness must be at least 3", or
"never visit two loud pubs in a row". Supporting these should require a small
data-and-model change, not a redesign.

Use these deliberately modest extension rules:

- Keep stable routing fields such as coordinates at the top level.
- Put experimental pub facts under `attributes` so the base map contract stays
  stable.
- Allow only JSON booleans, whole numbers, strings, and arrays of strings. Do
  not support nested objects or executable expressions.
- The TypeScript adapter discovers attribute names and converts them to
  MiniZinc-friendly boolean, integer, or membership arrays.
- When a new constraint uses an attribute, require that attribute to have a
  consistent type. Reject missing or mixed values with a clear message instead
  of inventing implicit defaults.
- Keep each actual rule explicit and readable in `pub-crawl.mzn`. The adapter
  exposes data; it does not dynamically generate constraint logic.

MiniZinc cannot directly use arbitrary JSON properties, so TypeScript remains a
thin translation boundary. Conceptually, attributes become indexed data such
as:

```minizinc
array[PUBS, BOOL_ATTRIBUTES] of bool: bool_attribute;
array[PUBS, NUMBER_ATTRIBUTES] of int: number_attribute;
array[PUBS, VALUES] of bool: has_value;
```

The adapter also supplies the indexes needed by a specific rule. For example,
a later `requireDartboard` request option can be translated to the
`hasDartboard` boolean column, while the MiniZinc constraint itself remains a
simple `exists` expression.

This is intentionally not a generic constraint language. Adding a silly rule
should normally mean:

1. Add the relevant `attributes` value to each candidate pub.
2. Add one clearly named option to the crawl request, if the rule is optional.
3. Map that attribute and option in `optimize.ts`.
4. Add a short, explicit constraint to `pub-crawl.mzn`.
5. Add one feasible and one infeasible test case.

This preserves flexibility while keeping every demo rule visible enough to
explain on a slide.

## Optimization Model

### Preprocessing in TypeScript

MiniZinc should receive numbers and booleans, not application strings. The CLI
will:

1. Validate both JSON files.
2. Build a sorted list of all beer styles.
3. Validate and normalize any extended attributes used by the model.
4. Convert beer styles and extended attributes into typed matrices.
5. Calculate a symmetric distance matrix in whole metres using the Haversine
   formula. Index `0` represents the hotel and indexes `1..N` represent pubs.
6. Convert the optional kilometre bounds to whole metres.
7. Write a temporary `.dzn` file or equivalent MiniZinc data input.

Straight-line distance is already consistent with the map's straight route
segments. It also avoids a network-dependent walking-directions API. The UI and
CLI should call it an estimate rather than walking distance.

### MiniZinc Decisions and Constraints

The core decision variable is deliberately small:

```minizinc
array[1..stop_count] of var 1..pub_count: route;
constraint all_different(route);
```

Add these constraints:

- every selected pub is distinct;
- each required beer style is offered by at least one selected pub;
- when `requireMeal` is true, at least one selected pub serves meals;
- when supplied, total distance is at least `minDistanceKm`; and
- when supplied, total distance is at most `maxDistanceKm`.

The objective is:

```text
hotel -> route[1] -> route[2] -> ... -> route[stopCount]
```

plus the final leg back to the hotel only when `returnToHotel` is true. This
same total is used for the minimum-distance constraint, maximum-distance
constraint, displayed result, and optimization objective. Minimize the sum of
those integer distances after applying the bounds. With the example request,
the solver therefore finds the shortest valid route in the 2-5 km range.

This lets MiniZinc choose both **which** pubs to visit and **their order**. It is
small enough to explain on one slide and still demonstrates constraint
programming clearly.

### Solver Output

Use MiniZinc's JSON stream output and give the model a minimal structured output
containing:

- ordered pub indexes;
- total distance in metres.

The TypeScript CLI maps those indexes back to candidate pubs and writes only the
fields the current viewer accepts:

```json
[
  {
    "name": "Jernbanecafeen",
    "latitude": 55.6721637,
    "longitude": 12.5636709
  }
]
```

Also print a short terminal summary with the ordered names and estimated total
distance. If the model is unsatisfiable, print a friendly explanation such as
"No 5-stop crawl covers all requested beer types and includes a meal stop" and
do not overwrite the last valid output file.

## Proposed Files

```text
optimizer/
  pub-crawl.mzn          # constraints and objective
  optimize.ts            # validation, preprocessing, solver invocation, output
  types.ts               # shared optimizer input/output types if needed
data/
  pub-candidates.json    # enriched source data
  crawl-request.json     # demo constraints
  optimized-crawl.json   # generated map input, committed for easy demoing
```

Prefer keeping the TypeScript in one `optimize.ts` file initially. Split out
`types.ts` only if the implementation becomes difficult to scan.

Add these scripts:

```json
{
  "optimize": "tsx optimizer/optimize.ts",
  "optimize:demo": "tsx optimizer/optimize.ts && npm start"
}
```

Add `tsx` as a development dependency so the local CLI can stay in TypeScript
without creating a second build configuration.

## Implementation Milestones

### 1. Data Contract and Demo Data

- Enrich a useful subset of the current Copenhagen pubs with beer styles and
  meal availability.
- Add a request that produces an interesting five-stop route.
- Keep attributes plausible, but label them as demo data rather than guaranteed
  current venue information.

### 2. TypeScript Adapter

- Parse command-line options, defaulting to the two files above.
- Validate inputs and report file/field-specific errors.
- Build the beer, extended-attribute, and distance matrices.
- Validate and convert the optional route-distance bounds.
- Generate MiniZinc input in a temporary directory.
- Check that the `minizinc` executable is available and provide a setup hint
  when it is missing.

Optional CLI arguments should stay limited to:

```text
--pubs <file> --constraints <file> --out <file>
```

### 3. MiniZinc Model

- Implement route selection, uniqueness, beer coverage, and meal constraints.
- Apply optional minimum and maximum total route distances.
- Minimize total distance from the hotel through the ordered pubs.
- Support the optional return-to-hotel leg.
- Emit a parseable route and objective value.

### 4. Viewer Integration

- Write the optimizer result in the viewer's existing pin-array format.
- Confirm `?data=data/optimized-crawl.json` renders the generated order.
- Update the map summary wording from "distance between all stops" to
  "straight-line route estimate" so the metric is honest.
- Leave the hotel as a special marker rather than adding it to the numbered pub
  route.

### 5. Verification and Talk Prep

- Add focused tests for validation and distance-matrix generation.
- Run one feasible request and verify the output has exactly `stopCount` unique
  pubs, required styles, a meal stop, and a total distance within the requested
  range.
- Run one impossible request and verify the CLI exits non-zero without replacing
  the existing output.
- Verify the generated route visually on the current desktop viewport.
- Run `npm run build`.
- Add a short README section containing prerequisites and the three-command demo
  flow: edit constraints, optimize, view.

## Acceptance Criteria

- `npm run optimize` generates an ordered map-compatible JSON file.
- Adding a primitive pub attribute does not require changing the map or output
  format.
- A new constraint can consume an extended attribute through the TypeScript
  adapter without introducing a new service or data store.
- The result contains exactly the requested number of distinct pubs.
- Every requested beer type is represented.
- A meal-serving pub is included when requested.
- The calculated total route distance respects optional minimum and maximum
  bounds.
- Gecode minimizes the straight-line route distance from the Imperial Hotel.
- Impossible constraints produce a clear error and preserve the previous route.
- The existing map loads and displays the generated route without code changes
  or manual JSON reshaping.
- The complete model can be explained in a few minutes during the talk.

## Explicitly Out of Scope

- real walking directions, travel times, or transit;
- opening hours and live venue data;
- a web form for editing constraints;
- multiple users, persistence, authentication, or deployment;
- solver benchmarking or switching solvers at runtime;
- a generic JSON constraint language or dynamic MiniZinc code generation;
- time windows, budgets, ratings, drink counts, and weighted preferences;
- automatically proving why an impossible request is impossible.

Those can become follow-up examples after the first demo works. The best next
constraint to add would be a budget, since it adds a recognizable real-world
trade-off without changing the architecture.
