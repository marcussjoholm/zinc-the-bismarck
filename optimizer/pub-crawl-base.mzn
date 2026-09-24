% Imports MiniZinc's global constraint for requiring unique values.
include "alldifferent.mzn";

% Receives the number of candidate pubs from the generated data file.
int: pub_count;
set of int: PUBS = 1..pub_count;

int: stop_count;
set of int: STOPS = 1..stop_count;

% Stores the straight-line distance between every pair of locations in metres; index 0 is the hotel.
array[0..pub_count, 0..pub_count] of int: distance_m;
% Records whether each candidate pub serves a meal.
array[PUBS] of bool: serves_meals;

% Receives the number of distinct beer types represented in the input data.
int: beer_type_count;
% Gives every beer type an integer index from 1 to beer_type_count.
set of int: BEER_TYPES = 1..beer_type_count;
% Records which beer types are available at each pub.
array[PUBS, BEER_TYPES] of bool: has_beer;
% Records which beer types the crawl request requires.
array[BEER_TYPES] of bool: required_beer;

% Receives the number of generic boolean attributes, such as hasDartboard.
int: bool_attribute_count;
% Gives every generic boolean attribute an integer column index.
set of int: BOOL_ATTRIBUTES = 1..bool_attribute_count;
% Stores every pub's value for every generic boolean attribute.
array[PUBS, BOOL_ATTRIBUTES] of bool: bool_attribute;

% Receives the number of generic whole-number attributes, such as coziness.
int: number_attribute_count;
% Gives every generic number attribute an integer column index.
set of int: NUMBER_ATTRIBUTES = 1..number_attribute_count;
% Stores every pub's value for every generic whole-number attribute.
array[PUBS, NUMBER_ATTRIBUTES] of int: number_attribute;

int: value_count;
set of int: VALUES = 1..value_count;
% Records which categorical attribute values apply to each pub.
array[PUBS, VALUES] of bool: has_value;

bool: require_meal;
int: min_distance_m;
int: max_distance_m;

% Declares the decision variables: the solver chooses one pub for every stop.
array[STOPS] of var PUBS: route;

% Prevents the solver from selecting the same pub more than once.
constraint all_different(route);

constraint
  % Iterates only over beer types marked as required in the request.
  forall(beer in BEER_TYPES where required_beer[beer]) (
    % Requires at least one selected stop to offer the current beer type.
    exists(stop in STOPS) (has_beer[route[stop], beer])
  );

% Require at least one selected stop to serve a meal if the request requires it.
constraint
  not require_meal \/
  exists(stop in STOPS) (serves_meals[route[stop]]);

% Declares a derived variable containing the complete round-trip distance.
var int: route_distance_m =
  distance_m[0, route[1]] + % Adds the first leg from the hotel to the first pub.
  % Adds every leg between consecutive pubs in the route.
  sum(stop in 1..stop_count - 1) (
    distance_m[route[stop], route[stop + 1]]
  ) +
  distance_m[route[stop_count], 0]; % Adds the final leg from the last pub back to the hotel.


constraint route_distance_m >= min_distance_m;
constraint route_distance_m <= max_distance_m;
