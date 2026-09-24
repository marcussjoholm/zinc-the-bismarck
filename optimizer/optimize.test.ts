import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAttributeMatrices,
  calculateDistanceMetres,
  parseCandidatePubs,
  parseCrawlRequest,
  type CandidatePub,
} from "./optimize.js";

const pubs: CandidatePub[] = [
  {
    id: "one",
    name: "One",
    latitude: 55.67,
    longitude: 12.56,
    beerTypes: ["ipa"],
    servesMeals: false,
    attributes: { hasDartboard: true, coziness: 3, vibe: "quiet" },
  },
  {
    id: "two",
    name: "Two",
    latitude: 55.68,
    longitude: 12.57,
    beerTypes: ["stout"],
    servesMeals: true,
    attributes: { hasDartboard: false, coziness: 5, vibe: ["loud", "late"] },
  },
];

test("calculates the same Haversine distance convention as the map", () => {
  assert.equal(calculateDistanceMetres(pubs[0], pubs[0]), 0);
  assert.ok(calculateDistanceMetres(pubs[0], pubs[1]) > 1_200);
  assert.ok(calculateDistanceMetres(pubs[0], pubs[1]) < 1_400);
});

test("normalizes extensible attributes into typed matrices", () => {
  const matrices = buildAttributeMatrices(pubs);

  assert.deepEqual(matrices.booleanNames, ["hasDartboard"]);
  assert.deepEqual(matrices.booleans, [[true], [false]]);
  assert.deepEqual(matrices.numberNames, ["coziness"]);
  assert.deepEqual(matrices.numbers, [[3], [5]]);
  assert.deepEqual(matrices.valueNames, ["vibe=late", "vibe=loud", "vibe=quiet"]);
  assert.deepEqual(matrices.values, [
    [false, false, true],
    [true, true, false],
  ]);
});

test("rejects a missing extensible attribute", () => {
  const incomplete = structuredClone(pubs);
  delete incomplete[1].attributes?.coziness;
  assert.throws(() => buildAttributeMatrices(incomplete), /missing attribute coziness/);
});

test("validates the crawl request and distance bounds", () => {
  const request = parseCrawlRequest(
    {
      stopCount: 2,
      requiredBeerTypes: ["ipa", "stout"],
      requireMeal: true,
      requireDartboard: true,
      minDistanceKm: 2,
      maxDistanceKm: 5,
      minPubDistanceKm: 0.2,
    },
    pubs,
  );

  assert.equal(request.stopCount, 2);
  assert.equal(request.requireDartboard, true);
  assert.equal(request.minDistanceKm, 2);
  assert.equal(request.maxDistanceKm, 5);
  assert.equal(request.minPubDistanceKm, 0.2);
});

test("rejects impossible input-level requirements", () => {
  assert.throws(
    () =>
      parseCrawlRequest(
        {
          stopCount: 3,
          requiredBeerTypes: ["sour"],
          requireMeal: false,
        },
        pubs,
      ),
    /stopCount cannot exceed/,
  );
});

test("rejects a required dartboard when no candidate has one", () => {
  const noDartboards = structuredClone(pubs);
  noDartboards.forEach((pub) => {
    if (pub.attributes) {
      pub.attributes.hasDartboard = false;
    }
  });

  assert.throws(
    () =>
      parseCrawlRequest(
        {
          stopCount: 2,
          requiredBeerTypes: [],
          requireMeal: false,
          requireDartboard: true,
        },
        noDartboards,
      ),
    /No candidate pub has a dartboard/,
  );
});

test("parses candidate JSON and rejects duplicate ids", () => {
  assert.equal(parseCandidatePubs(pubs).length, 2);
  assert.throws(() => parseCandidatePubs([pubs[0], pubs[0]]), /Duplicate pub id/);
});
