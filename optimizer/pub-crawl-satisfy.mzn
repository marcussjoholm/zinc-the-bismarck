include "pub-crawl-base.mzn";

solve satisfy;

output [
  "{\"route\":", show(route),
  ",\"distanceMetres\":", show(route_distance_m), "}"
];
