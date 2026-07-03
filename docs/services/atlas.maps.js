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
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`;
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