declare const L: any;

type PubPin = {
  name: string;
  latitude: number;
  longitude: number;
};

// Replace these examples with the real stops. The array order is the crawl order.
const pubCrawlPins: PubPin[] = [
  { name: "Mikkeller Bar", latitude: 55.6708, longitude: 12.5535 },
  { name: "Lidkoeb", latitude: 55.6737, longitude: 12.5506 },
  { name: "Taphouse", latitude: 55.6768, longitude: 12.5719 },
  { name: "BRUS", latitude: 55.6961, longitude: 12.5505 },
];

const centralCopenhagenBounds = L.latLngBounds(
  [55.655, 12.535],
  [55.705, 12.625],
);
const initialZoom = window.matchMedia("(max-width: 700px)").matches ? 13 : 14;

const map = L.map("map", {
  maxBounds: centralCopenhagenBounds,
  maxBoundsViscosity: 1,
  zoomControl: true,
}).setView([55.682, 12.568], initialZoom);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors",
  maxZoom: 19,
}).addTo(map);

map.setMinZoom(initialZoom);

const markers = pubCrawlPins.map((pin, index) => {
  const marker = L.marker([pin.latitude, pin.longitude], {
    icon: L.divIcon({
      className: "pub-marker",
      html: `<span>${index + 1}</span>`,
      iconAnchor: [18, 18],
      iconSize: [36, 36],
    }),
    title: pin.name,
  }).addTo(map);

  const popup = document.createElement("div");
  popup.className = "pub-popup";

  const popupNumber = document.createElement("span");
  popupNumber.textContent = `Stop ${index + 1}`;

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
    permanent: true,
  });

  return marker;
});

if (pubCrawlPins.length > 1) {
  L.polyline(
    pubCrawlPins.map((pin) => [pin.latitude, pin.longitude]),
    {
      color: "#d84436",
      opacity: 0.9,
      weight: 4,
    },
  ).addTo(map);
}

renderStopList();
renderRouteSummary();

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
      map.flyTo([pin.latitude, pin.longitude], Math.max(map.getZoom(), 15));
      markers[index].openPopup();
    });

    item.append(button);
    stopList.append(item);
  });
}

function renderRouteSummary(): void {
  const totalDistance = pubCrawlPins
    .slice(1)
    .reduce(
      (distance, pin, index) =>
        distance + distanceInKilometres(pubCrawlPins[index], pin),
      0,
    );

  const stopText = `${pubCrawlPins.length} ${pubCrawlPins.length === 1 ? "stop" : "stops"}`;
  const distanceText = `${totalDistance.toFixed(1)} km between stops`;
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
