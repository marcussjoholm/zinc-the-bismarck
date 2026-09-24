declare const L: any;

const HOTEL_ICON_SVG = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M10 22v-6.57"></path>
    <path d="M12 11h.01"></path>
    <path d="M12 7h.01"></path>
    <path d="M14 15.43V22"></path>
    <path d="M15 16a5 5 0 0 0-6 0"></path>
    <path d="M16 11h.01"></path>
    <path d="M16 7h.01"></path>
    <path d="M8 11h.01"></path>
    <path d="M8 7h.01"></path>
    <rect x="4" y="2" width="16" height="20" rx="2"></rect>
  </svg>
`;

type PubPin = {
  name: string;
  latitude: number;
  longitude: number;
};

type HotelPin = PubPin & {
  address: string;
};

const DEFAULT_DATA_FILE = "data/pubs.json";
const OPTIMIZED_DATA_FILE = "data/optimized-crawl.json";
const SATISFIED_DATA_FILE = "data/satisfied-crawl.json";

let pubCrawlPins: PubPin[] = [];
let unusedPubPins: PubPin[] = [];
let map: any;
let hotelMarker: any;
let markers: any[] = [];
let markerPositions: Array<[number, number]> = [];

const hotel: HotelPin = {
  name: "Imperial Hotel",
  address: "Vester Farimagsgade 9",
  latitude: 55.6757,
  longitude: 12.5617,
};

void initialize();

async function initialize(): Promise<void> {
  renderRouteMode();

  try {
    pubCrawlPins = await loadPubPins();
    unusedPubPins = await loadUnusedPubPins(pubCrawlPins);
    initializeMap();
  } catch (error) {
    console.error(error);
    const routeSummary = getElement("route-summary");
    routeSummary.setAttribute("role", "alert");
    routeSummary.textContent =
      error instanceof Error ? error.message : "Could not load pub data.";
  }
}

async function loadUnusedPubPins(selectedPins: PubPin[]): Promise<PubPin[]> {
  if (!isSolutionView()) {
    return [];
  }

  const allPins = await loadPinFile(DEFAULT_DATA_FILE);
  const selectedPinKeys = new Set(selectedPins.map(pinKey));
  return allPins.filter((pin) => !selectedPinKeys.has(pinKey(pin)));
}

function isSolutionView(): boolean {
  const requestedFiles = getRequestedDataFiles();
  return (
    requestedFiles.length === 1 &&
    [OPTIMIZED_DATA_FILE, SATISFIED_DATA_FILE].includes(requestedFiles[0])
  );
}

function pinKey(pin: PubPin): string {
  return `${pin.name}\u0000${pin.latitude}\u0000${pin.longitude}`;
}

async function loadPubPins(): Promise<PubPin[]> {
  const requestedFiles = getRequestedDataFiles();
  const files = requestedFiles.length > 0 ? requestedFiles : [DEFAULT_DATA_FILE];
  const pinGroups = await Promise.all(files.map(loadPinFile));
  const pins = pinGroups.flat();

  if (pins.length === 0) {
    throw new Error("The selected JSON files do not contain any pub pins.");
  }

  return pins;
}

function getRequestedDataFiles(): string[] {
  return new URLSearchParams(window.location.search)
    .getAll("data")
    .map((file) => file.trim())
    .filter(Boolean);
}

function renderRouteMode(): void {
  const requestedFiles = getRequestedDataFiles();
  const activeFile = requestedFiles.length === 1 ? requestedFiles[0] : undefined;
  const routeLinks = [
    { id: "default-route-link", active: requestedFiles.length === 0 },
    { id: "optimized-route-link", active: activeFile === OPTIMIZED_DATA_FILE },
    { id: "satisfied-route-link", active: activeFile === SATISFIED_DATA_FILE },
  ];

  for (const { id, active } of routeLinks) {
    const link = getElement<HTMLAnchorElement>(id);
    if (active) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  }
}

async function loadPinFile(file: string): Promise<PubPin[]> {
  const response = await fetch(file);

  if (!response.ok) {
    throw new Error(`Could not load ${file} (${response.status}).`);
  }

  const value: unknown = await response.json();

  if (!Array.isArray(value)) {
    throw new Error(`${file} must contain a JSON array.`);
  }

  return value.map((pin, index) => parsePubPin(pin, file, index));
}

function parsePubPin(value: unknown, file: string, index: number): PubPin {
  if (
    !isRecord(value) ||
    typeof value.name !== "string" ||
    value.name.trim() === "" ||
    typeof value.latitude !== "number" ||
    !Number.isFinite(value.latitude) ||
    typeof value.longitude !== "number" ||
    !Number.isFinite(value.longitude)
  ) {
    throw new Error(
      `${file}: item ${index + 1} must have a name, latitude and longitude.`,
    );
  }

  return {
    name: value.name.trim(),
    latitude: value.latitude,
    longitude: value.longitude,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function initializeMap(): void {
  const pinBounds = L.latLngBounds([
    ...pubCrawlPins.map((pin) => [pin.latitude, pin.longitude]),
    ...unusedPubPins.map((pin) => [pin.latitude, pin.longitude]),
    [hotel.latitude, hotel.longitude],
  ]);

  map = L.map("map", {
    maxBounds: pinBounds.pad(0.2),
    maxBoundsViscosity: 1,
    zoomControl: true,
  }).fitBounds(pinBounds, { padding: [52, 52] });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19,
  }).addTo(map);

  map.setMinZoom(map.getZoom());
  hotelMarker = createHotelMarker(hotel);
  unusedPubPins.forEach(createUnusedPubMarker);
  markerPositions = pubCrawlPins.map((pin) => [
    pin.latitude,
    pin.longitude,
  ]);
  markers = pubCrawlPins.map(createPubMarker);

  void drawAnimatedRoute();
  renderStopList();
  renderRouteSummary();
  renderHotel();
}

function createPubMarker(pin: PubPin, index: number): any {
  const marker = L.marker(markerPositions[index], {
    icon: L.divIcon({
      className: "pub-marker",
      html: `<span>${index + 1}</span>`,
      iconAnchor: [18, 18],
      iconSize: [36, 36],
    }),
    title: pin.name,
    zIndexOffset: 500,
  }).addTo(map);

  const popup = document.createElement("div");
  popup.className = "pub-popup";

  const popupNumber = document.createElement("span");
  popupNumber.textContent = `Stopp ${index + 1}`;

  const popupName = document.createElement("strong");
  popupName.textContent = pin.name;

  popup.append(popupNumber, popupName);
  marker.bindPopup(popup);

  const label = document.createElement("span");
  label.textContent = pin.name;
  marker.bindTooltip(label, {
    className: "pub-label",
    direction: "right",
    offset: [12, 0],
  });

  return marker;
}

function createUnusedPubMarker(pin: PubPin): any {
  const marker = L.circleMarker([pin.latitude, pin.longitude], {
    color: "#181825",
    fillColor: "#7f849c",
    fillOpacity: 0.9,
    opacity: 0.95,
    radius: 7,
    weight: 2,
  }).addTo(map);

  const popup = document.createElement("div");
  popup.className = "pub-popup";

  const popupType = document.createElement("span");
  popupType.textContent = "Ej med i rutten";

  const popupName = document.createElement("strong");
  popupName.textContent = pin.name;

  popup.append(popupType, popupName);
  marker.bindPopup(popup);

  const label = document.createElement("span");
  label.textContent = pin.name;
  marker.bindTooltip(label, {
    className: "pub-label unused-pub-label",
    direction: "right",
    offset: [8, 0],
  });

  return marker;
}

function drawAnimatedRoute(): void {
  // Avoid animating if showing ALL routes (start page)
  if (pubCrawlPins.length < 1 || getRequestedDataFiles().length === 0) {
    return;
  }

  const routeStyle = {
    color: "#f38ba8",
    interactive: false,
    lineCap: "round",
    opacity: 0.9,
    weight: 4,
  };

  const route = L.polyline(
    [
      [hotel.latitude, hotel.longitude],
      ...markerPositions,
      [hotel.latitude, hotel.longitude],
    ],
    routeStyle,
  ).addTo(map);

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  const path = route.getElement() as SVGPathElement | null;

  if (!path) {
    return;
  }

  const length = path.getTotalLength();
  path.style.strokeDasharray = `${length} ${length}`;
  path.style.strokeDashoffset = String(length);

  const animation = path.animate(
    [
      { strokeDashoffset: String(length) },
      { strokeDashoffset: "0" },
    ],
    {
      duration: length / 2,
      easing: "linear",
      fill: "forwards",
    },
  );
  let finalized = false;

  const finalize = (): void => {
    if (finalized) {
      return;
    }

    finalized = true;
    path.style.strokeDasharray = "none";
    path.style.strokeDashoffset = "0";
    map.off("zoomstart", finishOnZoom);
  };

  const finishOnZoom = (): void => {
    animation.finish();
    finalize();
  };

  map.on("zoomstart", finishOnZoom);
  void animation.finished.then(finalize, finalize);
}

function createHotelMarker(pin: HotelPin): any {
  const marker = L.marker([pin.latitude, pin.longitude], {
    icon: L.divIcon({
      className: "hotel-marker",
      html: HOTEL_ICON_SVG,
      iconAnchor: [20, 46],
      iconSize: [40, 46],
    }),
    title: pin.name,
    zIndexOffset: 1000,
  }).addTo(map);

  const popup = document.createElement("div");
  popup.className = "hotel-popup";

  const popupType = document.createElement("span");
  popupType.textContent = "Vårt hotel";

  const popupName = document.createElement("strong");
  popupName.textContent = pin.name;

  const popupAddress = document.createElement("span");
  popupAddress.textContent = pin.address;

  popup.append(popupType, popupName, popupAddress);
  marker.bindPopup(popup);

  return marker;
}

function renderHotel(): void {
  getElement("hotel-symbol").innerHTML = HOTEL_ICON_SVG;
  getElement("hotel-name").textContent = hotel.name;
  getElement("hotel-address").textContent = hotel.address;

  getElement<HTMLButtonElement>("hotel-button").addEventListener("click", () => {
    map.flyTo([hotel.latitude, hotel.longitude], Math.max(map.getZoom(), 15));
    hotelMarker.openPopup();
  });
}

function renderStopList(): void {
  const stopList = getElement<HTMLOListElement>("stop-list");

  pubCrawlPins.forEach((pin, index) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "stop-button";
    button.setAttribute("aria-label", `Show ${pin.name} on the map`);

    const number = document.createElement("span");
    number.className = "stop-number";
    number.textContent = String(index + 1);

    const details = document.createElement("span");
    details.className = "stop-details";

    const name = document.createElement("strong");
    name.textContent = pin.name;

    const coordinates = document.createElement("span");
    coordinates.textContent = `${pin.latitude.toFixed(4)}, ${pin.longitude.toFixed(4)}`;

    details.append(name, coordinates);
    button.append(number, details);
    button.addEventListener("click", () => {
      map.flyTo(markerPositions[index], Math.max(map.getZoom(), 15));
      markers[index].openPopup();
    });

    item.append(button);
    stopList.append(item);
  });
}

function renderRouteSummary(): void {
  const outboundDistance = pubCrawlPins.reduce((distance, pin, index) => {
    const previousStop = index === 0 ? hotel : pubCrawlPins[index - 1];
    return distance + distanceInKilometres(previousStop, pin);
  }, 0);
  const lastStop = pubCrawlPins[pubCrawlPins.length - 1];
  const totalDistance =
    outboundDistance +
    (lastStop === undefined ? 0 : distanceInKilometres(lastStop, hotel));

  const stopText = `${pubCrawlPins.length} ${pubCrawlPins.length === 1 ? "stopp" : "stopp"}`;
  const distanceText = `${totalDistance.toFixed(1)} km fågelvägen`;
  getElement("route-summary").textContent = `${stopText} / ${distanceText}`;
}

function distanceInKilometres(from: PubPin, to: PubPin): number {
  const earthRadius = 6371;
  const latitudeDelta = degreesToRadians(to.latitude - from.latitude);
  const longitudeDelta = degreesToRadians(to.longitude - from.longitude);
  const fromLatitude = degreesToRadians(from.latitude);
  const toLatitude = degreesToRadians(to.latitude);

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return earthRadius * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function degreesToRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

function getElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);

  if (!element) {
    throw new Error(`Missing element #${id}`);
  }

  return element as T;
}
