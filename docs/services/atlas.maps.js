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
    isReady: false
  };

  function getApiKey() {
    if (window.AtlasConfig?.maps?.apiKey) return window.AtlasConfig.maps.apiKey;
    return window.AtlasConfig?.googleMapsApiKey || null;
  }

  function isKoreaPlace(place) {
    const text = [
      place?.id,
      place?.title,
      place?.name,
      place?.query,
      place?.address,
      place?.city,
      place?.country,
      place?.airportCode
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (
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
      text.includes("김포")
    ) {
      return true;
    }

    const lat = Number(place?.lat);
    const lng = Number(place?.lng);

    // Rough bounding box for South Korea, including Seoul/Incheon/ICN/Gimpo/Busan/Jeju.
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return lat >= 33 && lat <= 39.8 && lng >= 124 && lng <= 132;
    }

    return false;
  }

  function filterKoreaPlaces(places) {
    return (places || []).filter((place) => !isKoreaPlace(place));
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
        reject(new Error("Google Maps API key is missing. Check docs/config/config.js."));
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

    STATE.places = filterKoreaPlaces(options.places || []);

    const initialPlace = STATE.places[0] || {
      lat: 41.0082,
      lng: 28.9784,
      title: "Istanbul"
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

    renderMarkers();
    fitToPlaces();

    STATE.isReady = true;
    return STATE.map;
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
        position: {
          lat: Number(place.lat),
          lng: Number(place.lng)
        },
        title: place.title || place.name || "Atlas place"
      });

      STATE.markers.push(marker);
    });
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

    if (!place || !STATE.map || !hasValidLatLng(place) || isKoreaPlace(place)) return;

    STATE.map.panTo({
      lat: Number(place.lat),
      lng: Number(place.lng)
    });

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

    if (
      !origin ||
      !destination ||
      !STATE.routeRenderer ||
      !hasValidLatLng(origin) ||
      !hasValidLatLng(destination) ||
      isKoreaPlace(origin) ||
      isKoreaPlace(destination)
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