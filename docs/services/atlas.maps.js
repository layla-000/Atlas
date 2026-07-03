const AtlasMaps = (() => {
  const CONFIG = {
    scriptId: "google-maps-js-api",
    defaultZoom: 13,
    focusedZoom: 15,
    routeStrokeWeight: 5,
    routeStrokeOpacity: 0.82,
    routeColor: "#36c7b7"
  };

  const STATE = {
    map: null,
    markers: [],
    routeRenderer: null,
    places: [],
    geocoder: null,
      infoWindow: null,
        searchBox: null,
    isReady: false
  };

  function getApiKey() {
    if (!window.AtlasConfig || !window.AtlasConfig.maps) return null;
    return window.AtlasConfig.maps.apiKey;
  }

  function loadGoogleMaps() {
    return new Promise((resolve, reject) => {
      if (window.google && window.google.maps) {
        resolve(window.google.maps);
        return;
      }

      const existingScript = document.getElementById(CONFIG.scriptId);
      if (existingScript) {
        existingScript.addEventListener("load", () => resolve(window.google.maps));
        existingScript.addEventListener("error", reject);
        return;
      }

      const apiKey = getApiKey();
      if (!apiKey) {
        reject(new Error("Google Maps API key is missing."));
        return;
      }

      const script = document.createElement("script");
      script.id = CONFIG.scriptId;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve(window.google.maps);
      script.onerror = () => reject(new Error("Failed to load Google Maps JavaScript API."));
      document.head.appendChild(script);
    });
  }

  async function initMap(options) {
    const maps = await loadGoogleMaps();
    const mapElement = document.getElementById(options.elementId);

    if (!mapElement) {
      throw new Error(`Map element not found: ${options.elementId}`);
    }

STATE.places = options.places || [];
mergeManualPlacesIntoState_();
STATE.geocoder = new maps.Geocoder();
STATE.infoWindow = new maps.InfoWindow();

    const initialPlace = firstValidLatLngPlace_(STATE.places) || {
      lat: 37.5665,
      lng: 126.9780,
      title: "Seoul"
    };

    STATE.map = new maps.Map(mapElement, {
      center: {
        lat: Number(initialPlace.lat),
        lng: Number(initialPlace.lng)
      },
      zoom: options.zoom || CONFIG.defaultZoom,
      disableDefaultUI: true,
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false
    });

    STATE.routeRenderer = new maps.DirectionsRenderer({
      map: STATE.map,
      suppressMarkers: true,
      polylineOptions: {
        strokeColor: CONFIG.routeColor,
        strokeOpacity: CONFIG.routeStrokeOpacity,
        strokeWeight: CONFIG.routeStrokeWeight
      }
    });

    await resolvePlaces();
    renderMarkers();
    fitToPlaces();
    initPlaceSearchControl_();

    STATE.isReady = true;
    return STATE.map;
  }

  async function resolvePlaces() {
    const resolved = [];

    for (const place of STATE.places) {
      const normalized = await resolvePlace_(place);
      if (normalized) {
        resolved.push(normalized);
      }
    }

    STATE.places = resolved;
    console.log("ATLAS MAP RESOLVED PLACES", STATE.places);
  }

  async function resolvePlace_(place) {
    if (!place) return null;

    if (hasValidLatLng_(place)) {
      return {
        ...place,
        lat: Number(place.lat),
        lng: Number(place.lng)
      };
    }

    const query = buildPlaceQuery_(place);
    if (!query || !STATE.geocoder) return null;

    try {
      const result = await geocodeQuery_(query);
      if (!result) return null;

      return {
        ...place,
        title: place.title || query,
        query: query,
        lat: result.lat,
        lng: result.lng
      };
    } catch (error) {
      console.warn("AtlasMaps geocode failed:", query, error);
      return null;
    }
  }

  function geocodeQuery_(query) {
    return new Promise((resolve) => {
      STATE.geocoder.geocode({ address: query }, (results, status) => {
        if (status !== "OK" || !results || !results[0]) {
          resolve(null);
          return;
        }

        const location = results[0].geometry.location;
        resolve({
          lat: location.lat(),
          lng: location.lng()
        });
      });
    });
  }

  function buildPlaceQuery_(place) {
    const raw = place.query || place.address || place.title || "";
    const text = String(raw).trim();

    if (!text || isBadPlaceQuery_(text)) return "";

    if (/^[A-Z]{3}$/.test(text)) {
      return text + " airport";
    }

    return text;
  }

  function isBadPlaceQuery_(text) {
    const lower = String(text || "").toLowerCase();

    return (
      lower.length > 100 ||
      lower.indexOf("refund") >= 0 ||
      lower.indexOf("reservation applies") >= 0 ||
      lower.indexOf("restrictive") >= 0
    );
  }

  function hasValidLatLng_(place) {
    return Number.isFinite(Number(place.lat)) && Number.isFinite(Number(place.lng));
  }

  function firstValidLatLngPlace_(places) {
    return (places || []).find(hasValidLatLng_);
  }

  function renderMarkers() {
  clearMarkers();

  if (!STATE.map || !window.google || !window.google.maps) return;

  STATE.places.forEach((place) => {
    if (!hasValidLatLng_(place)) return;

    const marker = new window.google.maps.Marker({
      map: STATE.map,
      position: {
        lat: Number(place.lat),
        lng: Number(place.lng)
      },
      title: place.title || place.query || "Atlas place"
    });

    marker.addListener("click", () => {
      openPlaceInfoWindow_(marker, place);
    });

    STATE.markers.push(marker);
  });
}

function openPlaceInfoWindow_(marker, place) {
  if (!STATE.infoWindow) return;

  const category = escapeHtml_(place.category || "장소");
  const title = escapeHtml_(place.title || place.query || "Atlas place");
  const address = escapeHtml_(place.address || place.query || "");
  const schedule = escapeHtml_(place.schedule || "");
  const source = escapeHtml_(place.source || "");

STATE.infoWindow.setContent(`
  <div class="atlas-map-info">
    ${category ? `<div class="atlas-map-info-category">${category}</div>` : ""}
    <strong>${title}</strong>
    ${address ? `<p>${address}</p>` : ""}
    ${schedule ? `<p>일정: ${schedule}</p>` : ""}
    ${source ? `<small>출처: ${source}</small>` : ""}
  </div>
`);
  STATE.infoWindow.open({
    map: STATE.map,
    anchor: marker
  });
}

function escapeHtml_(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

  function clearMarkers() {
    STATE.markers.forEach((marker) => marker.setMap(null));
    STATE.markers = [];
  }

  function fitToPlaces() {
    if (!STATE.map || STATE.places.length === 0) return;

    const validPlaces = STATE.places.filter(hasValidLatLng_);

    if (validPlaces.length === 0) return;

    if (validPlaces.length === 1) {
      moveTo(validPlaces[0].id);
      return;
    }

    const bounds = new window.google.maps.LatLngBounds();

    validPlaces.forEach((place) => {
      bounds.extend({
        lat: Number(place.lat),
        lng: Number(place.lng)
      });
    });

    STATE.map.fitBounds(bounds, 64);
  }

  function moveTo(placeId) {
    const place = STATE.places.find((item) => item.id === placeId);

    if (!place || !STATE.map || !hasValidLatLng_(place)) return;

    STATE.map.panTo({
      lat: Number(place.lat),
      lng: Number(place.lng)
    });

    STATE.map.setZoom(CONFIG.focusedZoom);
  }

  async function setPlaces(places) {
    STATE.places = places || [];
    await resolvePlaces();
    renderMarkers();
    fitToPlaces();
  }

  function showRoute(originId, destinationId) {
    const origin = STATE.places.find((place) => place.id === originId);
    const destination = STATE.places.find((place) => place.id === destinationId);

    if (
      !origin ||
      !destination ||
      !STATE.routeRenderer ||
      !hasValidLatLng_(origin) ||
      !hasValidLatLng_(destination)
    ) {
      return;
    }

    const directionsService = new window.google.maps.DirectionsService();

    directionsService.route(
      {
        origin: {
          lat: Number(origin.lat),
          lng: Number(origin.lng)
        },
        destination: {
          lat: Number(destination.lat),
          lng: Number(destination.lng)
        },
        travelMode: window.google.maps.TravelMode.DRIVING
      },
      (result, status) => {
        if (status === "OK") {
          STATE.routeRenderer.setDirections(result);
        }
      }
    );
  }
function initPlaceSearchControl_() {
  if (!STATE.map || !window.google || !window.google.maps || !window.google.maps.places) {
    console.warn("Google Places library is not available.");
    return;
  }

  const input = document.createElement("input");
  input.id = "atlas-map-search-input";
  input.className = "atlas-map-search-input";
  input.type = "text";
  input.placeholder = "장소 검색 후 지도에 추가";
  input.setAttribute("aria-label", "Search places");

  STATE.map.controls[window.google.maps.ControlPosition.TOP_LEFT].push(input);

  const autocomplete = new window.google.maps.places.Autocomplete(input, {
    fields: ["place_id", "name", "formatted_address", "geometry", "types"],
    componentRestrictions: { country: ["tr", "kr"] }
  });

  autocomplete.bindTo("bounds", STATE.map);

  autocomplete.addListener("place_changed", () => {
    const place = autocomplete.getPlace();

    if (!place || !place.geometry || !place.geometry.location) {
      console.warn("Atlas place search returned no geometry:", place);
      return;
    }

    addGooglePlaceToAtlasMap_(place);
    input.value = "";
  });

  STATE.searchBox = autocomplete;
}

function addGooglePlaceToAtlasMap_(googlePlace) {
  if (!googlePlace || !googlePlace.geometry || !googlePlace.geometry.location) return;

  const location = googlePlace.geometry.location;

  const place = {
    id: "manual_" + Date.now() + "_" + Math.random().toString(16).slice(2),
    tripId: getCurrentAtlasTripId_(),
    tripName: getCurrentAtlasTripName_(),
    type: "manual_place",
    category: inferManualPlaceCategory_(googlePlace),
    title: googlePlace.name || "검색한 장소",
    address: googlePlace.formatted_address || "",
    query: googlePlace.formatted_address || googlePlace.name || "",
    schedule: "",
    source: "Google Maps 검색",
    lat: location.lat(),
    lng: location.lng(),
    placeId: googlePlace.place_id || ""
  };

  showPendingPlaceInfoWindow_(place);
}
function showPendingPlaceInfoWindow_(place) {
  if (!STATE.map || !STATE.infoWindow) return;

  const marker = new window.google.maps.Marker({
    map: STATE.map,
    position: { lat: Number(place.lat), lng: Number(place.lng) },
    title: place.title || "검색한 장소"
  });

  marker.__atlasPending = true;

  STATE.infoWindow.setContent(`
    <div class="atlas-map-info">
      <div class="atlas-map-info-category">${escapeHtml_(place.category || "장소")}</div>
      <strong>${escapeHtml_(place.title || "검색한 장소")}</strong>
      ${place.address ? `<p>${escapeHtml_(place.address)}</p>` : ""}
      <button class="atlas-map-add-button" id="atlas-map-add-place-button">
        + Add to Atlas
      </button>
    </div>
  `);

  STATE.infoWindow.open({ map: STATE.map, anchor: marker });

  window.setTimeout(() => {
    const button = document.getElementById("atlas-map-add-place-button");
    if (!button) return;

    button.addEventListener("click", () => {
      confirmAddPendingPlace_(place, marker);
    });
  }, 0);

  STATE.map.panTo({ lat: Number(place.lat), lng: Number(place.lng) });
  STATE.map.setZoom(CONFIG.focusedZoom);
}

function confirmAddPendingPlace_(place, marker) {
  const exists = STATE.places.some((item) => {
    if (!item) return false;
    if (place.placeId && item.placeId && place.placeId === item.placeId) return true;

    return (
      String(item.title || "").trim().toLowerCase() === String(place.title || "").trim().toLowerCase() &&
      String(item.address || "").trim().toLowerCase() === String(place.address || "").trim().toLowerCase()
    );
  });

  if (!exists) {
    STATE.places.push(place);
    saveManualPlacesToStorage_();
  }

  if (marker) marker.setMap(null);

  renderMarkers();

  const savedMarker = STATE.markers.find((item) => {
    return item.getTitle && item.getTitle() === place.title;
  });

  if (savedMarker) {
    openPlaceInfoWindow_(savedMarker, place);
  }
}
function getAtlasManualPlacesStorageKey_() {
  return "ATLAS_MANUAL_MAP_PLACES__" + getCurrentAtlasTripId_();
}

function loadManualPlacesFromStorage_() {
  try {
    const raw = window.localStorage.getItem(getAtlasManualPlacesStorageKey_());
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("Failed to load Atlas manual places from localStorage", error);
    return [];
  }
}

function saveManualPlacesToStorage_() {
  try {
    const manualPlaces = STATE.places.filter((place) => {
      return place && place.type === "manual_place";
    });

    window.localStorage.setItem(
      getAtlasManualPlacesStorageKey_(),
      JSON.stringify(manualPlaces)
    );
  } catch (error) {
    console.warn("Failed to save Atlas manual places to localStorage", error);
  }
}

function mergeManualPlacesIntoState_() {
  const manualPlaces = loadManualPlacesFromStorage_();

  manualPlaces.forEach((manualPlace) => {
    if (!manualPlace) return;

    const exists = STATE.places.some((item) => {
      if (!item) return false;

      if (manualPlace.placeId && item.placeId && manualPlace.placeId === item.placeId) {
        return true;
      }

      return (
        String(item.title || "").trim().toLowerCase() === String(manualPlace.title || "").trim().toLowerCase() &&
        String(item.address || "").trim().toLowerCase() === String(manualPlace.address || "").trim().toLowerCase()
      );
    });

    if (!exists) {
      STATE.places.push(manualPlace);
    }
  });
}
function getCurrentAtlasTripId_() {
  return window.AtlasConfig?.atlas?.defaultTripId || "trip_turkiye_2026";
}

function getCurrentAtlasTripName_() {
  return window.AtlasConfig?.atlas?.defaultTripName || "Türkiye 2026";
}

function inferManualPlaceCategory_(googlePlace) {
  const types = googlePlace.types || [];

  if (types.indexOf("airport") >= 0) return "공항";
  if (types.indexOf("lodging") >= 0) return "호텔";
  if (
    types.indexOf("tourist_attraction") >= 0 ||
    types.indexOf("museum") >= 0 ||
    types.indexOf("point_of_interest") >= 0
  ) {
    return "관광지";
  }

  if (types.indexOf("train_station") >= 0 || types.indexOf("subway_station") >= 0) return "역";
  if (types.indexOf("bus_station") >= 0) return "버스터미널";
  if (types.indexOf("restaurant") >= 0 || types.indexOf("cafe") >= 0) return "음식점";

  return "장소";
}
  function clearRoute() {
    if (STATE.routeRenderer) {
      STATE.routeRenderer.setDirections({ routes: [] });
    }
  }

  function isReady() {
    return STATE.isReady;
  }

  return {
    initMap,
    moveTo,
    setPlaces,
    showRoute,
    clearRoute,
    isReady
  };
})();