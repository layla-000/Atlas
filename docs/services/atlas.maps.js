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
    if (!window.AtlasConfig || !window.AtlasConfig.maps) {
        return null;
    }

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

        STATE.places = options.places || [];

        const initialPlace = STATE.places[0] || {
            lat: 37.5665,
            lng: 126.9780,
            title: "Seoul"
        };

        STATE.map = new maps.Map(mapElement, {
            center: {
                lat: initialPlace.lat,
                lng: initialPlace.lng
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

    function renderMarkers() {
        clearMarkers();

        if (!STATE.map || !window.google || !window.google.maps) {
            return;
        }

        STATE.places.forEach((place) => {
            const marker = new window.google.maps.Marker({
                map: STATE.map,
                position: {
                    lat: place.lat,
                    lng: place.lng
                },
                title: place.title
            });

            STATE.markers.push(marker);
        });
    }

    function clearMarkers() {
        STATE.markers.forEach((marker) => {
            marker.setMap(null);
        });

        STATE.markers = [];
    }

    function fitToPlaces() {
        if (!STATE.map || STATE.places.length === 0) {
            return;
        }

        if (STATE.places.length === 1) {
            moveTo(STATE.places[0].id);
            return;
        }

        const bounds = new window.google.maps.LatLngBounds();

        STATE.places.forEach((place) => {
            bounds.extend({
                lat: place.lat,
                lng: place.lng
            });
        });

        STATE.map.fitBounds(bounds, 64);
    }

    function moveTo(placeId) {
        const place = STATE.places.find((item) => item.id === placeId);

        if (!place || !STATE.map) {
            return;
        }

        STATE.map.panTo({
            lat: place.lat,
            lng: place.lng
        });

        STATE.map.setZoom(CONFIG.focusedZoom);
    }

    function setPlaces(places) {
        STATE.places = places || [];

        renderMarkers();
        fitToPlaces();
    }

    function showRoute(originId, destinationId) {
        const origin = STATE.places.find((place) => place.id === originId);
        const destination = STATE.places.find((place) => place.id === destinationId);

        if (!origin || !destination || !STATE.routeRenderer) {
            return;
        }

        const directionsService = new window.google.maps.DirectionsService();

        directionsService.route(
            {
                origin: {
                    lat: origin.lat,
                    lng: origin.lng
                },
                destination: {
                    lat: destination.lat,
                    lng: destination.lng
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
            STATE.routeRenderer.setDirections({
                routes: []
            });
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