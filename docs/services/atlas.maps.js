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
  infoWindow: null,
  searchBox: null,
  placesService: null,
  isReady: false
};

  function getApiKey() {
    if (window.AtlasConfig?.maps?.apiKey) return window.AtlasConfig.maps.apiKey;
    return window.AtlasConfig?.googleMapsApiKey || null;
  }

  function isKoreaPlace(place) {
    const text = [
      place?.id, place?.title, place?.name, place?.query,
      place?.address, place?.city, place?.country, place?.airportCode
    ].filter(Boolean).join(" ").toLowerCase();

    const lat = Number(place?.lat);
    const lng = Number(place?.lng);

    return (
      text.includes("korea") ||
      text.includes("south korea") ||
      text.includes("republic of korea") ||
      text.includes("대한민국") ||
      text.includes("한국") ||
      text.includes("서울") ||
      text.includes("seoul") ||
      text.includes("인천") ||
      text.includes("incheon") ||
      text.includes("icn") ||
      text.includes("gimpo") ||
      text.includes("김포") ||
      (Number.isFinite(lat) && Number.isFinite(lng) && lat >= 33 && lat <= 39.8 && lng >= 124 && lng <= 132)
    );
  }

  function filterKoreaPlaces(places) {
    return (places || []).filter((place) => !isKoreaPlace(place));
  }

  function loadGoogleMaps() {
    return new Promise((resolve, reject) => {
      if (window.google?.maps) return resolve(window.google.maps);

      const existingScript = document.getElementById(CONFIG.scriptId);
      if (existingScript) {
        existingScript.addEventListener("load", () => resolve(window.google.maps));
        existingScript.addEventListener("error", reject);
        return;
      }

      const apiKey = getApiKey();
      if (!apiKey) return reject(new Error("Google Maps API key is missing. Check docs/config/config.js."));

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
    if (!mapElement) throw new Error(`Map element not found: ${options.elementId}`);

    STATE.places = filterKoreaPlaces(options.places || []);
    STATE.infoWindow = new maps.InfoWindow();
  

    const initialPlace = STATE.places[0] || { lat: 41.0082, lng: 28.9784, title: "Istanbul" };

    STATE.map = new maps.Map(mapElement, {
      center: { lat: Number(initialPlace.lat), lng: Number(initialPlace.lng) },
      zoom: options.zoom || CONFIG.defaultZoom,
      disableDefaultUI: true,
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    });

      STATE.placesService = new maps.places.PlacesService(STATE.map);

    STATE.routeRenderer = new maps.DirectionsRenderer({
      map: STATE.map,
      suppressMarkers: true,
      polylineOptions: {
        strokeColor: CONFIG.routeColor,
        strokeOpacity: CONFIG.routeStrokeOpacity,
        strokeWeight: CONFIG.routeStrokeWeight
      }
    });

renderMarkers();
fitToPlaces();
initPlaceSearchControl_();
initMapClickToAdd_();

    STATE.isReady = true;
    return STATE.map;
  }

  function initPlaceSearchControl_() {
  if (!STATE.map || !window.google?.maps?.places) return;

  const input = document.createElement("input");
  input.id = "atlas-map-search-input";
  input.className = "atlas-map-search-input";
  input.type = "text";
  input.placeholder = "장소 검색";
  input.setAttribute("aria-label", "Search places");

  STATE.map.controls[window.google.maps.ControlPosition.TOP_LEFT].push(input);

  const autocomplete = new window.google.maps.places.Autocomplete(input, {
    fields: ["place_id", "name", "formatted_address", "geometry", "types"]
  });

  autocomplete.bindTo("bounds", STATE.map);

  autocomplete.addListener("place_changed", () => {
    const googlePlace = autocomplete.getPlace();

    if (!googlePlace?.geometry?.location) return;

    const pendingPlace = buildManualPlaceFromGooglePlace_(googlePlace);

    if (isKoreaPlace(pendingPlace)) {
      input.value = "";
      return;
    }

    showPendingPlaceInfoWindow_(pendingPlace);
    input.value = "";
  });

  STATE.searchBox = autocomplete;
}

function buildManualPlaceFromGooglePlace_(googlePlace) {
  const location = googlePlace.geometry.location;

  return {
    id: "manual_" + Date.now() + "_" + Math.random().toString(16).slice(2),
    type: "manual_place",
    category: inferManualPlaceCategory_(googlePlace),
    title: googlePlace.name || "검색한 장소",
    address: googlePlace.formatted_address || "",
    query: googlePlace.formatted_address || googlePlace.name || "",
    source: "Google Maps 검색",
    lat: location.lat(),
    lng: location.lng(),
    placeId: googlePlace.place_id || ""
  };
}

function inferManualPlaceCategory_(googlePlace) {
  const types = googlePlace.types || [];

  if (types.includes("airport")) return "공항";
  if (types.includes("lodging")) return "호텔";
  if (types.includes("train_station") || types.includes("subway_station")) return "역";
  if (types.includes("bus_station")) return "버스터미널";
  if (types.includes("restaurant") || types.includes("cafe")) return "음식점";
  if (types.includes("tourist_attraction") || types.includes("museum") || types.includes("point_of_interest")) return "관광지";

  return "장소";
}

  function hasValidLatLng(place) {
    return Number.isFinite(Number(place?.lat)) && Number.isFinite(Number(place?.lng));
  }

  function renderMarkers() {
    clearMarkers();
    if (!STATE.map || !window.google?.maps) return;

    STATE.places = filterKoreaPlaces(STATE.places);

    STATE.places.forEach((place) => {
      if (!hasValidLatLng(place)) return;

      const marker = new window.google.maps.Marker({
        map: STATE.map,
        position: { lat: Number(place.lat), lng: Number(place.lng) },
        title: place.title || place.name || "Atlas place"
      });

      marker.addListener("click", () => openPlaceInfoWindow_(marker, place));
      STATE.markers.push(marker);
    });
  }

  function openPlaceInfoWindow_(marker, place) {
  const googleMapsUrl = buildGoogleMapsUrl_(place);

  STATE.infoWindow.setContent(`
    <div class="atlas-map-info">
      <a
        class="atlas-map-info-title-link"
        href="${googleMapsUrl}"
        target="_blank"
        rel="noopener noreferrer"
      >
        ${escapeHtml_(place.title || place.name || "Atlas place")}
      </a>
      ${place.address || place.query ? `<p>${escapeHtml_(place.address || place.query)}</p>` : ""}
      <button class="atlas-map-delete-button" type="button" data-atlas-delete-place="${escapeHtml_(place.id)}">Delete</button>
    </div>
  `);

  STATE.infoWindow.open({ map: STATE.map, anchor: marker });

  window.google.maps.event.addListenerOnce(STATE.infoWindow, "domready", () => {
    const button = document.querySelector(`[data-atlas-delete-place="${cssEscape_(place.id)}"]`);
    if (!button) return;
    button.addEventListener("click", () => deletePlace_(place.id));
  });
}

  function initMapClickToAdd_() {
  if (!STATE.map || !window.google?.maps) return;

  STATE.map.addListener("click", (event) => {
    if (!event?.latLng) return;

    if (event.placeId) {
      event.stop();

      STATE.placesService.getDetails(
        {
          placeId: event.placeId,
          fields: ["place_id", "name", "formatted_address", "geometry", "types"]
        },
        (googlePlace, status) => {
          if (status !== window.google.maps.places.PlacesServiceStatus.OK || !googlePlace) {
            return;
          }

          const pendingPlace = buildManualPlaceFromGooglePlace_(googlePlace);

          if (isKoreaPlace(pendingPlace)) return;

          showPendingPlaceInfoWindow_(pendingPlace);
        }
      );

      return;
    }

    const lat = event.latLng.lat();
    const lng = event.latLng.lng();

    const pendingPlace = {
      id: "manual_" + Date.now() + "_" + Math.random().toString(16).slice(2),
      type: "manual_place",
      category: "직접 추가",
      title: "선택한 장소",
      address: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
      query: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
      source: "지도 클릭",
      lat,
      lng,
      placeId: ""
    };

    if (isKoreaPlace(pendingPlace)) return;

    showPendingPlaceInfoWindow_(pendingPlace);
  });
}

 function showPendingPlaceInfoWindow_(place) {
  const googleMapsUrl = buildGoogleMapsUrl_(place);

  STATE.infoWindow.setContent(`
    <div class="atlas-map-info">
      <a
        class="atlas-map-info-title-link"
        href="${googleMapsUrl}"
        target="_blank"
        rel="noopener noreferrer"
      >
        ${escapeHtml_(place.title)}
      </a>
      <p>${escapeHtml_(place.address)}</p>
      <button class="atlas-map-add-button" type="button" data-atlas-add-place="true">Add to Atlas</button>
    </div>
  `);

  STATE.infoWindow.setPosition({ lat: Number(place.lat), lng: Number(place.lng) });
  STATE.infoWindow.open({ map: STATE.map });

  window.google.maps.event.addListenerOnce(STATE.infoWindow, "domready", () => {
    const button = document.querySelector('[data-atlas-add-place="true"]');
    if (!button) return;
    button.addEventListener("click", () => addPlace_(place));
  });
}

  function addPlace_(place) {
    if (!place || isKoreaPlace(place)) return;

    STATE.places.push(place);
    STATE.infoWindow.close();
    renderMarkers();
    moveTo(place.id);
  }

  function deletePlace_(placeId) {
    STATE.places = STATE.places.filter((place) => place.id !== placeId);
    STATE.infoWindow.close();
    renderMarkers();
  }

  function clearMarkers() {
    STATE.markers.forEach((marker) => marker.setMap(null));
    STATE.markers = [];
  }

  function fitToPlaces() {
    STATE.places = filterKoreaPlaces(STATE.places);
    if (!STATE.map || STATE.places.length === 0) return;

    const validPlaces = STATE.places.filter(hasValidLatLng);
    if (validPlaces.length === 0) return;

    if (validPlaces.length === 1) {
      moveTo(validPlaces[0].id);
      return;
    }

    const bounds = new window.google.maps.LatLngBounds();
    validPlaces.forEach((place) => bounds.extend({ lat: Number(place.lat), lng: Number(place.lng) }));
    STATE.map.fitBounds(bounds, 64);
  }

  function moveTo(placeId) {
    const place = STATE.places.find((item) => item.id === placeId);
    if (!place || !STATE.map || !hasValidLatLng(place) || isKoreaPlace(place)) return;

    STATE.map.panTo({ lat: Number(place.lat), lng: Number(place.lng) });
    STATE.map.setZoom(CONFIG.focusedZoom);
  }

  function setPlaces(places) {
    STATE.places = filterKoreaPlaces(places || []);
    renderMarkers();
    fitToPlaces();
  }

  function showRoute(originId, destinationId) {
    const origin = STATE.places.find((place) => place.id === originId);
    const destination = STATE.places.find((place) => place.id === destinationId);

    if (!origin || !destination || !STATE.routeRenderer || !hasValidLatLng(origin) || !hasValidLatLng(destination) || isKoreaPlace(origin) || isKoreaPlace(destination)) return;

    const directionsService = new window.google.maps.DirectionsService();

    directionsService.route(
      {
        origin: { lat: Number(origin.lat), lng: Number(origin.lng) },
        destination: { lat: Number(destination.lat), lng: Number(destination.lng) },
        travelMode: window.google.maps.TravelMode.DRIVING
      },
      (result, status) => {
        if (status === "OK") STATE.routeRenderer.setDirections(result);
      }
    );
  }

  function clearRoute() {
    if (STATE.routeRenderer) STATE.routeRenderer.setDirections({ routes: [] });
  }

  function isReady() {
    return STATE.isReady;
  }
function buildGoogleMapsUrl_(place) {
  if (place?.placeId) {
    return `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(place.placeId)}`;
  }

  const query = place?.address || place?.query || place?.title || "";
  if (!query) return "https://www.google.com/maps";

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
  function escapeHtml_(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function cssEscape_(value) {
    if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(String(value || ""));
    return String(value || "").replace(/"/g, '\\"');
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