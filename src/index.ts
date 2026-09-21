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

type PixelOffset = {
  x: number;
  y: number;
};

// Venues are kept in the same order as the guide.
const pubCrawlPins: PubPin[] = [
  { name: "Jernbanecafeen", latitude: 55.6721637, longitude: 12.5636709 },
  { name: "Mikkeller Bar Viktoriagade", latitude: 55.6719575, longitude: 12.5575483 },
  { name: "Dialekt Beer Bar", latitude: 55.672482, longitude: 12.557516 },
  { name: "Fermentoren", latitude: 55.6679147, longitude: 12.5563801 },
  { name: "Warpigs Brewpub", latitude: 55.6685278, longitude: 12.5599599 },
  { name: "ÅBEN Kødbyen", latitude: 55.6682632, longitude: 12.5615533 },
  { name: "Bootleggers Vesterbro", latitude: 55.6681772, longitude: 12.5494792 },
  { name: "KIHOSKH", latitude: 55.6664138, longitude: 12.5529649 },
  { name: "Væskebalancen", latitude: 55.6864751, longitude: 12.5584108 },
  { name: "Ølbaren", latitude: 55.6892753, longitude: 12.5578754 },
  { name: "Ølsnedkeren", latitude: 55.6859267, longitude: 12.5523374 },
  { name: "BRUS", latitude: 55.6918656, longitude: 12.5557824 },
  { name: "Kølsters Tolv Haner", latitude: 55.6876336, longitude: 12.5470224 },
  { name: "People Like Us Beer Bar", latitude: 55.698261, longitude: 12.552981 },
  { name: "Nørrebro Bryghus", latitude: 55.6902048, longitude: 12.5638481 },
  { name: "Mikkeller & Friends", latitude: 55.6946446, longitude: 12.5432229 },
  // Koelschip shares the same address; the tiny offset keeps both pins visible.
  { name: "Koelschip", latitude: 55.6946446, longitude: 12.5434729 },
  { name: "Dispensary", latitude: 55.6972572, longitude: 12.544631 },
  { name: "Taphouse", latitude: 55.676199, longitude: 12.571519 },
  { name: "SKAAL", latitude: 55.682326, longitude: 12.573648 },
  { name: "Peders", latitude: 55.679073, longitude: 12.568998 },
  { name: "Godt Øl", latitude: 55.6768192, longitude: 12.5760433 },
  { name: "Amager Bryghus Taproom", latitude: 55.6843528, longitude: 12.5728215 },
  { name: "Ørsted Ølbar", latitude: 55.6812668, longitude: 12.5645148 },
  { name: "Ølhaven", latitude: 55.6821013, longitude: 12.5851463 },
  { name: "Black Swan", latitude: 55.6864894, longitude: 12.5874331 },
  { name: "BrewPub Copenhagen", latitude: 55.677163, longitude: 12.569487 },
  { name: "Alefarm Taproom", latitude: 55.687207, longitude: 12.562081 },
  { name: "Søernes Ølbar", latitude: 55.6962633, longitude: 12.5750656 },
  { name: "Bicycle Brewing", latitude: 55.7055585, longitude: 12.5793537 },
  { name: "Søhesten", latitude: 55.6903189, longitude: 12.5720729 },
  { name: "Retroarkaden", latitude: 55.690397, longitude: 12.573306 },
  { name: "Gamma NV", latitude: 55.7009959, longitude: 12.534039 },
  { name: "Flying Couch Brewery & Taproom", latitude: 55.705701, longitude: 12.534661 },
  { name: "Christiania Bryghus - The Lab", latitude: 55.673824, longitude: 12.600609 },
  { name: "Mikkeller Baghaven", latitude: 55.6934851, longitude: 12.6078635 },
];

const hotel: HotelPin = {
  name: "Imperial Hotel",
  address: "Vester Farimagsgade 9",
  latitude: 55.6757,
  longitude: 12.5617,
};

const pinBounds = L.latLngBounds([
  ...pubCrawlPins.map((pin) => [pin.latitude, pin.longitude]),
  [hotel.latitude, hotel.longitude],
]);

const map = L.map("map", {
  maxBounds: pinBounds.pad(0.2),
  maxBoundsViscosity: 1,
  zoomControl: true,
}).fitBounds(pinBounds, { padding: [52, 52] });

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors",
  maxZoom: 19,
}).addTo(map);

map.setMinZoom(map.getZoom());

const hotelMarker = createHotelMarker(hotel);
const markerPositions = spreadOverlappingMarkers(pubCrawlPins, hotel);

const markers = pubCrawlPins.map((pin, index) => {
  const marker = L.marker(markerPositions[index], {
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
  });

  return marker;
});

void drawAnimatedRoute();

renderStopList();
renderRouteSummary();
renderHotel();

function drawAnimatedRoute(): void {
  if (pubCrawlPins.length < 2) {
    return;
  }

  const routeStyle = {
    color: "#f38ba8",
    interactive: false,
    lineCap: "round",
    opacity: 0.9,
    weight: 4,
  };

  const route = L.polyline(markerPositions, routeStyle).addTo(map);

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
      duration: 8400,
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

function spreadOverlappingMarkers(
  pins: PubPin[],
  hotelPin: HotelPin,
): Array<[number, number]> {
  const minimumDistance = 38;
  const occupiedPoints = [
    map.latLngToLayerPoint([hotelPin.latitude, hotelPin.longitude]),
  ];
  const candidates: PixelOffset[] = [{ x: 0, y: 0 }];

  [38, 54, 72].forEach((radius) => {
    for (let angle = 0; angle < 360; angle += 45) {
      const radians = degreesToRadians(angle);
      candidates.push({
        x: Math.round(Math.cos(radians) * radius),
        y: Math.round(Math.sin(radians) * radius),
      });
    }
  });

  return pins.map((pin) => {
    const basePoint = map.latLngToLayerPoint([pin.latitude, pin.longitude]);
    const offset =
      candidates.find((candidate) =>
        occupiedPoints.every((occupiedPoint: { x: number; y: number }) => {
          const xDistance = basePoint.x + candidate.x - occupiedPoint.x;
          const yDistance = basePoint.y + candidate.y - occupiedPoint.y;
          return Math.hypot(xDistance, yDistance) >= minimumDistance;
        }),
      ) ?? candidates[candidates.length - 1];

    const adjustedPoint = {
      x: basePoint.x + offset.x,
      y: basePoint.y + offset.y,
    };
    const adjustedPosition = map.layerPointToLatLng(adjustedPoint);

    occupiedPoints.push(adjustedPoint);

    return [adjustedPosition.lat, adjustedPosition.lng];
  });
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
  popupType.textContent = "Our hotel";

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
  const totalDistance = pubCrawlPins
    .slice(1)
    .reduce(
      (distance, pin, index) =>
        distance + distanceInKilometres(pubCrawlPins[index], pin),
      0,
    );

  const stopText = `${pubCrawlPins.length} ${pubCrawlPins.length === 1 ? "stopp" : "stopp"}`;
  const distanceText = `${totalDistance.toFixed(1)} km mellan alla stopp`;
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
