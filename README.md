# Copenhagen Pub Crawl

A local TypeScript and MiniZinc demo that selects and visualizes pub crawls
through central Copenhagen.

Both solve modes choose the pubs and their order, start at the Imperial Hotel,
and apply the same constraints. Satisfaction returns the first valid route;
optimization finds and proves the shortest valid route.

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
2. Generate the first valid route:

   ```bash
   npm run satisfy
   ```

3. Start the map:

   ```bash
   npm start
   ```

4. Open the generated crawl:

   ```text
   http://127.0.0.1:4173/?data=data/satisfied-crawl.json
   ```

To generate a crawl and start the map with one command:

```bash
npm run optimize:demo
npm run satisfy:demo
```

Use `npm run optimize` when you need the shortest route. It can take much
longer because MiniZinc must prove that no better route exists.

## Crawl Constraints

The default request is `data/crawl-request.json`:

```json
{
  "stopCount": 20,
  "requiredBeerTypes": ["lager"],
  "requireMeal": false,
  "requireDartboard": true,
  "minDistanceKm": 2,
  "maxDistanceKm": 9,
  "minPubDistanceKm": 0.2
}
```

| Field | Type | Meaning |
| --- | --- | --- |
| `stopCount` | positive integer | Exact number of distinct pubs to visit |
| `requiredBeerTypes` | string array | Each listed type must occur at a selected pub |
| `requireMeal` | boolean | Require at least one pub that serves meals |
| `requireDartboard` | boolean, optional | Require at least one pub whose `attributes.hasDartboard` is true; defaults to false |
| `minDistanceKm` | non-negative number, optional | Minimum total route length |
| `maxDistanceKm` | positive number, optional | Maximum total route length |
| `minPubDistanceKm` | non-negative number, optional | Minimum straight-line distance between consecutive pubs |

Either distance bound can be omitted. When both are present, the minimum must
not exceed the maximum.

Distance uses the Haversine formula: the fastest straight line between each
coordinate, not actual walking distance. The total starts at the Imperial Hotel
and follows the pubs in route order before returning to the hotel. The solver,
terminal result, and map all include this final return leg.

`minPubDistanceKm` applies only to consecutive pub-to-pub legs. The first leg
from the hotel and the final leg back to it are not constrained by this field.

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
| `attributes` | object, optional | Extension point for constraints such as `requireDartboard` |

The supplied beer, meal, and experimental attribute values are illustrative
demo data, not guaranteed current venue information.

## Solve Modes and Output

| Command | MiniZinc goal | Default output |
| --- | --- | --- |
| `npm run satisfy` | First route satisfying every constraint | `data/satisfied-crawl.json` |
| `npm run optimize` | Shortest route, with optimality proven | `data/optimized-crawl.json` |

Both commands read `data/pub-candidates.json` and `data/crawl-request.json`.
Their output contains the selected pubs in visit order using the map's existing
input format:

```json
[
  {
    "name": "BrewPub Copenhagen",
    "latitude": 55.677163,
    "longitude": 12.569487
  }
]
```

Both commands print the ordered pub names, total distance, and Gecode search
statistics. These include solver time, search nodes, failures/backtracks,
constraint propagations, peak search depth, restarts, solutions found, and the
flattened solver model size. The final `MiniZinc solver time` line also includes
MiniZinc startup, model compilation, and local file handling.

If the constraints cannot be satisfied, the command exits with an error and
preserves its last valid output file.

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
| `--out` | `data/optimized-crawl.json` or `data/satisfied-crawl.json`, depending on the command |

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
`optimizer/pub-crawl-base.mzn`. If an attribute is present, every candidate pub
must provide it with the same type.

Keep new rules explicit and easy to demonstrate:

1. Add the attribute to every candidate pub.
2. Add a named option to the crawl request if the rule is configurable.
3. Map the option and attribute column in `optimizer/optimize.ts`.
4. Add the readable constraint to `optimizer/pub-crawl-base.mzn`.
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
