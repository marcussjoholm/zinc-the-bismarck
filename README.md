# Copenhagen Pub Crawl

A local TypeScript and MiniZinc demo that selects an optimal pub crawl and
shows it on a map of central Copenhagen.

The optimizer chooses both the pubs and their order. It starts at the Imperial
Hotel, applies the requested constraints, and minimizes straight-line distance.

## Prerequisites

- Node.js and npm
- [MiniZinc](https://www.minizinc.org/downloads/) with the free Gecode solver

Install the JavaScript dependencies and check MiniZinc:

```bash
npm install
minizinc --version
minizinc --solvers
```

The solver list should contain Gecode.

## Quick Start

1. Edit the constraints in `data/crawl-request.json`.
2. Generate a route:

   ```bash
   npm run optimize
   ```

3. Start the map:

   ```bash
   npm start
   ```

4. Open the generated crawl:

   ```text
   http://127.0.0.1:4173/?data=data/optimized-crawl.json
   ```

To optimize and start the map with one command:

```bash
npm run optimize:demo
```

## Crawl Constraints

The default request is `data/crawl-request.json`:

```json
{
  "stopCount": 5,
  "requiredBeerTypes": ["ipa", "stout", "lager"],
  "requireMeal": true,
  "minDistanceKm": 2,
  "maxDistanceKm": 5,
  "returnToHotel": false
}
```

| Field | Type | Meaning |
| --- | --- | --- |
| `stopCount` | positive integer | Exact number of distinct pubs to visit |
| `requiredBeerTypes` | string array | Each listed type must occur at a selected pub |
| `requireMeal` | boolean | Require at least one pub that serves meals |
| `minDistanceKm` | non-negative number, optional | Minimum total route length |
| `maxDistanceKm` | positive number, optional | Maximum total route length |
| `returnToHotel` | boolean | Count a final leg from the last pub to the hotel |

Either distance bound can be omitted. When both are present, the minimum must
not exceed the maximum.

Distance uses the Haversine formula: the fastest straight line between each
coordinate, not actual walking distance. The total starts at the Imperial Hotel
and follows the pubs in route order. When `returnToHotel` is true, the solver
and terminal result include the return leg, but the map does not draw it.

## Candidate Pub Data

The default candidate list is `data/pub-candidates.json`. Each entry has this
shape:

```json
{
  "id": "warpigs",
  "name": "Warpigs Brewpub",
  "latitude": 55.6685278,
  "longitude": 12.5599599,
  "beerTypes": ["ipa", "stout", "lager"],
  "servesMeals": true,
  "attributes": {
    "hasDartboard": false,
    "coziness": 2,
    "vibe": "loud"
  }
}
```

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Must be unique and stable |
| `name` | string | Displayed on the map |
| `latitude` | number | Between -90 and 90 |
| `longitude` | number | Between -180 and 180 |
| `beerTypes` | string array | Used by `requiredBeerTypes` |
| `servesMeals` | boolean | Used by `requireMeal` |
| `attributes` | object, optional | Extension point for future constraints |

The supplied beer, meal, and experimental attribute values are illustrative
demo data, not guaranteed current venue information.

## Optimizer Output

`npm run optimize` writes `data/optimized-crawl.json`. It contains the selected
pubs in visit order using the map's existing input format:

```json
[
  {
    "name": "BrewPub Copenhagen",
    "latitude": 55.677163,
    "longitude": 12.569487
  }
]
```

The command also prints the ordered pub names and total distance. If the
constraints cannot be satisfied, it exits with an error and preserves the last
valid output file.

## Custom Files

All CLI arguments are optional:

```bash
npm run optimize -- \
  --pubs data/my-pubs.json \
  --constraints data/my-request.json \
  --out data/my-crawl.json
```

| Option | Default |
| --- | --- |
| `--pubs` | `data/pub-candidates.json` |
| `--constraints` | `data/crawl-request.json` |
| `--out` | `data/optimized-crawl.json` |

View a custom output by passing it to the map:

```text
http://127.0.0.1:4173/?data=data/my-crawl.json
```

The map can combine ordered JSON files by repeating the parameter:

```text
http://127.0.0.1:4173/?data=data/first.json&data=data/second.json
```

## Adding Demo Constraints

Experimental pub facts belong in each pub's `attributes` object. Supported
values are booleans, whole numbers, non-empty strings, and non-empty string
arrays.

The TypeScript adapter converts them into the `bool_attribute`,
`number_attribute`, and `has_value` matrices declared in
`optimizer/pub-crawl.mzn`. If an attribute is present, every candidate pub must
provide it with the same type.

Keep new rules explicit and easy to demonstrate:

1. Add the attribute to every candidate pub.
2. Add a named option to the crawl request if the rule is configurable.
3. Map the option and attribute column in `optimizer/optimize.ts`.
4. Add the readable constraint to `optimizer/pub-crawl.mzn`.
5. Add feasible and impossible test cases.

The adapter exposes attribute data but deliberately does not generate MiniZinc
constraint code.

## Development Commands

```bash
npm test
npm run build
```

`npm test` runs the optimizer unit tests. `npm run build` type-checks the map and
optimizer, then creates the Vite production build.

## Troubleshooting

### MiniZinc is not installed

Install MiniZinc and make sure `minizinc --version` works in the same terminal.

### No pub crawl satisfies all requested constraints

Relax one or more constraints. Common causes are too many stops, a distance
range that is too narrow, or a beer/meal combination that no route can cover.

### The generated route is not visible

Make sure the `data` query parameter points to the output file and refresh the
page. Vite provides live reload while `npm start` is running.
