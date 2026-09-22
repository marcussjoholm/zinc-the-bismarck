include "alldifferent.mzn";

int: pub_count;
set of int: PUBS = 1..pub_count;

int: stop_count;
set of int: STOPS = 1..stop_count;

array[0..pub_count, 0..pub_count] of int: distance_m;
array[PUBS] of bool: serves_meals;

int: beer_type_count;
set of int: BEER_TYPES = 1..beer_type_count;
array[PUBS, BEER_TYPES] of bool: has_beer;
array[BEER_TYPES] of bool: required_beer;

% Future demo constraints can use these generic attribute matrices. The
% TypeScript adapter records which named attribute belongs to each column.
int: bool_attribute_count;
set of int: BOOL_ATTRIBUTES = 1..bool_attribute_count;
array[PUBS, BOOL_ATTRIBUTES] of bool: bool_attribute;

int: number_attribute_count;
set of int: NUMBER_ATTRIBUTES = 1..number_attribute_count;
array[PUBS, NUMBER_ATTRIBUTES] of int: number_attribute;

int: value_count;
set of int: VALUES = 1..value_count;
array[PUBS, VALUES] of bool: has_value;

bool: require_meal;
bool: return_to_hotel;
int: min_distance_m;
int: max_distance_m;

array[STOPS] of var PUBS: route;

constraint all_different(route);

constraint
  forall(beer in BEER_TYPES where required_beer[beer]) (
    exists(stop in STOPS) (has_beer[route[stop], beer])
  );

constraint
  not require_meal \/
  exists(stop in STOPS) (serves_meals[route[stop]]);

var int: route_distance_m =
  distance_m[0, route[1]] +
  sum(stop in 1..stop_count - 1) (
    distance_m[route[stop], route[stop + 1]]
  ) +
  if return_to_hotel then distance_m[route[stop_count], 0] else 0 endif;

constraint route_distance_m >= min_distance_m;
constraint route_distance_m <= max_distance_m;

solve minimize route_distance_m;

output [
  "{\"route\":", show(route),
  ",\"distanceMetres\":", show(route_distance_m), "}"
];
