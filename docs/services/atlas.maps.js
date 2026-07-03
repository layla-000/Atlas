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
    return window.AtlasConfig?.maps?.apiKey || null;
  }

  function loadGoogleMaps() {
    return new Promise((resolve, reject) => {
      if (window.google?.maps) {
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
      if (normalized) resolved.push(normalized);
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
        query,
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
      lower.includes("refund") ||
      lower.includes("reservation applies") ||
      lower.includes("restrictive")
    );
  }

  function hasValidLatLng_(place) {
    return Number.isFinite(Number(place?.lat)) && Number.isFinite(Number(place?.lng));
  }

  function firstValidLatLngPlace_(places) {
    return (places || []).find(hasValidLatLng_);
  }

  function renderMarkers() {
    clearMarkers();

    if (!STATE.map || !window.google?.maps) return;

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

    const canDelete = place.type === "manual_place";

    STATE.infoWindow.setContent(`
      <div class="atlas-map-info">
        ${place.category ? `<div class="atlas-map-info-category">${escapeHtml_(place.category)}</div>` : ""}
        <strong>${escapeHtml_(place.title || place.query || "Atlas place")}</strong>
        ${place.address || place.query ? `<p>${escapeHtml_(place.address || place.query)}</p>` : ""}
        ${place.schedule ? `<small>일정: ${escapeHtml_(place.schedule)}</small>` : ""}
        ${place.source ? `<small>출처: ${escapeHtml_(place.source)}</small>` : ""}
        ${
          canDelete
            ? `<button class="atlas-map-delete-button" type="button" data-atlas-delete-place="${escapeHtml_(place.id)}">Delete</button>`
            : ""
        }
      </div>
    `);

    STATE.infoWindow.open({
      map: STATE.map,
      anchor: marker
    });

    window.google.maps.event.addListenerOnce(STATE.infoWindow, "domready", () => {
      const deleteButton = document.querySelector(`[data-atlas-delete-place="${cssEscape_(place.id)}"]`);
      if (!deleteButton) return;

      deleteButton.addEventListener("click", () => {
        deleteManualPlace_(place.id);
      });
    });
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
    mergeManualPlacesIntoState_();
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
    if (!STATE.map || !window.google?.maps?.places) {
      console.warn("Google Places library is not available.");
      return;
    }

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
      console.log("ATLAS SEARCH SELECTED PLACE", googlePlace);

      if (!googlePlace?.geometry?.location) {
        console.warn("Atlas place search returned no geometry:", googlePlace);
        return;
      }

      const pendingPlace = buildManualPlaceFromGooglePlace_(googlePlace);
      showPendingPlaceInfoWindow_(pendingPlace);
      input.value = "";
    });

    STATE.searchBox = autocomplete;
  }

  function buildManualPlaceFromGooglePlace_(googlePlace) {
    const location = googlePlace.geometry.location;

    return {
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
  }

  function showPendingPlaceInfoWindow_(place) {
    if (!STATE.map || !STATE.infoWindow) return;

    const position = {
      lat: Number(place.lat),
      lng: Number(place.lng)
    };

    STATE.infoWindow.setContent(`
      <div class="atlas-map-info atlas-map-info-pending">
        <div class="atlas-map-info-category">${escapeHtml_(place.category || "장소")}</div>
        <strong>${escapeHtml_(place.title || "검색한 장소")}</strong>
        ${place.address ? `<p>${escapeHtml_(place.address)}</p>` : ""}
        <button class="atlas-map-add-button" type="button" data-atlas-add-place="true">Add to Atlas</button>
      </div>
    `);

    STATE.infoWindow.setPosition(position);
    STATE.infoWindow.open({
      map: STATE.map
    });

    STATE.map.panTo(position);
    STATE.map.setZoom(CONFIG.focusedZoom);

    window.google.maps.event.addListenerOnce(STATE.infoWindow, "domready", () => {
      const addButton = document.querySelector('[data-atlas-add-place="true"]');
      if (!addButton) return;

      addButton.addEventListener("click", () => {
        confirmAddPendingPlace_(place);
      });
    });
  }

  function confirmAddPendingPlace_(place) {
    const exists = STATE.places.some((item) => {
      if (!item) return false;

      if (place.placeId && item.placeId && place.placeId === item.placeId) {
        return true;
      }

      return (
        String(item.title || "").trim().toLowerCase() === String(place.title || "").trim().toLowerCase() &&
        String(item.address || "").trim().toLowerCase() === String(place.address || "").trim().toLowerCase()
      );
    });

    if (!exists) {
      STATE.places.push(place);
      saveManualPlacesToStorage_();
    }

    STATE.infoWindow.close();
    renderMarkers();
    moveTo(place.id);
  }

  function deleteManualPlace_(placeId) {
    if (!placeId) return;

    STATE.places = STATE.places.filter((place) => place.id !== placeId);
    saveManualPlacesToStorage_();

    if (STATE.infoWindow) {
      STATE.infoWindow.close();
    }

    renderMarkers();
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
      const manualPlaces = STATE.places.filter((place) => place?.type === "manual_place");
      window.localStorage.setItem(getAtlasManualPlacesStorageKey_(), JSON.stringify(manualPlaces));
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

    if (types.includes("airport")) return "공항";
    if (types.includes("lodging")) return "호텔";
    if (types.includes("train_station") || types.includes("subway_station")) return "역";
    if (types.includes("bus_station")) return "버스터미널";
    if (types.includes("restaurant") || types.includes("cafe")) return "음식점";

    if (
      types.includes("tourist_attraction") ||
      types.includes("museum") ||
      types.includes("point_of_interest")
    ) {
      return "관광지";
    }

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

  function escapeHtml_(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function cssEscape_(value) {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(String(value || ""));
    }

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