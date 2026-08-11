const AtlasMaps = (() => {
  const CONFIG = {
    scriptId: "google-maps-js-api",
    defaultZoom: 13,
    focusedZoom: 15
  };

  const STATE = {
    map: null,
    markers: [],
    places: [],
    infoWindow: null,
    geocoder: null,
    isReady: false
  };

  function getApiKey() {
    return window.AtlasConfig?.maps?.apiKey ||
      window.AtlasConfig?.googleMapsApiKey ||
      null;
  }

  function hasValidLatLng(place) {
    return Number.isFinite(Number(place?.lat)) &&
      Number.isFinite(Number(place?.lng));
  }

  function isKoreaPlace(place) {
    if (place?.id === "atlas-current-location" || place?.type === "shared_current") {
      return false;
    }

    const text = [
      place?.title,
      place?.name,
      place?.address,
      place?.query,
      place?.country,
      place?.airportCode
    ].filter(Boolean).join(" ").toLowerCase();

    const lat = Number(place?.lat);
    const lng = Number(place?.lng);

    return (
      text.includes("south korea") ||
      text.includes("republic of korea") ||
      text.includes("대한민국") ||
      text.includes("한국") ||
      text.includes("서울") ||
      text.includes("seoul") ||
      text.includes("인천") ||
      text.includes("incheon") ||
      text.includes("icn") ||
      text.includes("김포") ||
      text.includes("gimpo") ||
      (Number.isFinite(lat) && Number.isFinite(lng) &&
       lat >= 33 && lat <= 39.8 && lng >= 124 && lng <= 132)
    );
  }

  function dedupePlaces(places) {
    const seen = new Set();
    return (places || []).filter((place) => {
      if (!place || !hasValidLatLng(place) || isKoreaPlace(place)) return false;

      const key = [
        String(place.placeId || place.place_id || ""),
        String(place.title || place.name || "").trim().toLowerCase(),
        Number(place.lat).toFixed(6),
        Number(place.lng).toFixed(6)
      ].join("::");

      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function loadGoogleMaps() {
    return new Promise((resolve, reject) => {
      if (window.google?.maps) {
        resolve(window.google.maps);
        return;
      }

      const existing = document.getElementById(CONFIG.scriptId);
      if (existing) {
        existing.addEventListener("load", () => resolve(window.google.maps), { once: true });
        existing.addEventListener("error", () => reject(new Error("Google Maps 로드에 실패했어요.")), { once: true });
        return;
      }

      const apiKey = getApiKey();
      if (!apiKey) {
        reject(new Error("Google Maps API key가 없어요."));
        return;
      }

      const script = document.createElement("script");
      script.id = CONFIG.scriptId;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve(window.google.maps);
      script.onerror = () => reject(new Error("Google Maps JavaScript API 로드에 실패했어요."));
      document.head.appendChild(script);
    });
  }

  async function initMap(options = {}) {
    const maps = await loadGoogleMaps();
    const mapElement = document.getElementById(options.elementId);

    if (!mapElement) {
      throw new Error(`Map element not found: ${options.elementId}`);
    }

    STATE.places = dedupePlaces(options.places || []);
    STATE.infoWindow = new maps.InfoWindow();
    STATE.geocoder = new maps.Geocoder();

    const initialPlace = STATE.places[0] || {
      id: "istanbul",
      title: "Istanbul",
      lat: 41.0082,
      lng: 28.9784
    };

    STATE.map = new maps.Map(mapElement, {
      center: {
        lat: Number(initialPlace.lat),
        lng: Number(initialPlace.lng)
      },
      zoom: options.zoom || CONFIG.defaultZoom,
      disableDefaultUI: true,
      zoomControl: true,
      clickableIcons: true,
      gestureHandling: "greedy"
    });

    renderMarkers();
    fitToPlaces();
    initSearchControl();
    initMapEvents();

    STATE.isReady = true;
    return STATE.map;
  }

  async function initSearchControl() {
    if (!STATE.map || !window.google?.maps) return;

    const wrap = document.createElement("div");
    wrap.className = "atlas-map-search-wrap";
    wrap.style.display = "flex";
    wrap.style.alignItems = "center";
    wrap.style.gap = "6px";
    wrap.style.width = "min(360px, calc(100vw - 28px))";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "atlas-map-search-button";
    button.textContent = "검색";

    let autocomplete = null;

    try {
      const { PlaceAutocompleteElement } =
        await google.maps.importLibrary("places");

      autocomplete = new PlaceAutocompleteElement({
        placeholder: "장소 검색"
      });

      autocomplete.id = "atlas-map-search-autocomplete";
      autocomplete.style.display = "block";
      autocomplete.style.flex = "1 1 auto";
      autocomplete.style.minWidth = "0";
      autocomplete.style.width = "100%";
      autocomplete.setAttribute("aria-label", "장소 검색");

      // 현재 보고 있는 지도 주변 결과를 우선합니다.
      const center = STATE.map.getCenter();
      if (center) {
        autocomplete.locationBias = {
          center: {
            lat: center.lat(),
            lng: center.lng()
          },
          radius: 50000
        };
      }

      STATE.map.addListener("idle", () => {
        const currentCenter = STATE.map.getCenter();
        if (!currentCenter || !autocomplete) return;

        autocomplete.locationBias = {
          center: {
            lat: currentCenter.lat(),
            lng: currentCenter.lng()
          },
          radius: 50000
        };
      });

      autocomplete.addEventListener("gmp-select", async (event) => {
        try {
          const placePrediction = event?.placePrediction;
          if (!placePrediction) return;

          const place = placePrediction.toPlace();

          await place.fetchFields({
            fields: [
              "id",
              "displayName",
              "formattedAddress",
              "location",
              "viewport",
              "types"
            ]
          });

          if (!place.location) {
            throw new Error("선택한 장소의 위치 정보를 가져오지 못했어요.");
          }

          const title =
            typeof place.displayName === "string"
              ? place.displayName
              : place.displayName?.text ||
                place.formattedAddress ||
                "선택한 장소";

          const pending = {
            id: makeTemporaryId(),
            type: "manual_place",
            category: inferCategory(place.types || []),
            title,
            address: place.formattedAddress || title,
            query: place.formattedAddress || title,
            source: "Google Places 자동완성",
            lat: place.location.lat(),
            lng: place.location.lng(),
            placeId: place.id || ""
          };

          showPendingPlaceInfoWindow(pending);

          if (place.viewport) {
            STATE.map.fitBounds(place.viewport);
          } else {
            STATE.map.panTo({
              lat: pending.lat,
              lng: pending.lng
            });
            STATE.map.setZoom(CONFIG.focusedZoom);
          }

          autocomplete.value = "";
        } catch (error) {
          console.error("Atlas autocomplete selection failed:", error);
          alert(error?.message || "선택한 장소를 불러오지 못했어요.");
        }
      });

      autocomplete.addEventListener("gmp-error", (event) => {
        console.error("Atlas Places autocomplete error:", event);
      });

      wrap.append(autocomplete, button);
    } catch (error) {
      // Places (New)가 로드되지 않는 환경에서도 지도 검색 자체는 계속 쓸 수 있어요.
      console.warn("Places autocomplete unavailable; using Geocoder fallback.", error);

      const input = document.createElement("input");
      input.id = "atlas-map-search-input";
      input.className = "atlas-map-search-input";
      input.type = "search";
      input.placeholder = "장소 검색";
      input.autocomplete = "off";
      input.setAttribute("aria-label", "장소 검색");
      input.style.flex = "1 1 auto";
      input.style.minWidth = "0";

      input.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        void runFallbackSearch(input.value);
      });

      wrap.append(input, button);
      autocomplete = input;
    }

    STATE.map.controls[google.maps.ControlPosition.TOP_LEFT].push(wrap);

    async function runFallbackSearch(rawQuery) {
      const query = String(rawQuery || "").trim();
      if (!query || !STATE.geocoder) return;

      button.disabled = true;
      button.textContent = "…";

      try {
        const response = await STATE.geocoder.geocode({ address: query });
        const result = response?.results?.[0];

        if (!result?.geometry?.location) {
          throw new Error("검색 결과를 찾지 못했어요.");
        }

        const pending =
          placeFromGeocoderResult(result, query, "Google Maps 검색");

        showPendingPlaceInfoWindow(pending);
        STATE.map.panTo({
          lat: pending.lat,
          lng: pending.lng
        });
        STATE.map.setZoom(CONFIG.focusedZoom);

        if (autocomplete && "value" in autocomplete) {
          autocomplete.value = "";
        }
      } catch (error) {
        console.error("Atlas map search failed:", error);
        alert(error?.message || "장소 검색에 실패했어요.");
      } finally {
        button.disabled = false;
        button.textContent = "검색";
      }
    }

    button.addEventListener("click", () => {
      const query =
        autocomplete && "value" in autocomplete
          ? autocomplete.value
          : "";
      void runFallbackSearch(query);
    });
  }

  function initMapEvents() {
    if (!STATE.map) return;

    STATE.map.addListener("click", (event) => {
      if (!event?.placeId) return;

      if (typeof event.stop === "function") {
        event.stop();
      }

      void showPlaceIdAsPending(event.placeId);
    });

    STATE.map.addListener("contextmenu", (event) => {
      if (!event?.latLng) return;
      void showLatLngAsPending(event.latLng);
    });
  }

  async function showPlaceIdAsPending(placeId) {
    if (!STATE.geocoder || !placeId) return;

    try {
      const response = await STATE.geocoder.geocode({ placeId });
      const result = response?.results?.[0];
      if (!result?.geometry?.location) return;

      const pending = placeFromGeocoderResult(
        result,
        result.formatted_address || "선택한 장소",
        "Google Maps 장소 클릭"
      );
      showPendingPlaceInfoWindow(pending);
    } catch (error) {
      console.warn("Atlas place-id lookup failed:", error);
    }
  }

  async function showLatLngAsPending(latLng) {
    const lat = latLng.lat();
    const lng = latLng.lng();

    let title = "선택한 장소";
    let address = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    let placeId = "";

    if (STATE.geocoder) {
      try {
        const response = await STATE.geocoder.geocode({
          location: { lat, lng }
        });

        const result = response?.results?.[0];
        if (result) {
          address = result.formatted_address || address;
          title = shortPlaceTitle(result) || title;
          placeId = result.place_id || "";
        }
      } catch (error) {
        console.warn("Atlas reverse geocode failed:", error);
      }
    }

    showPendingPlaceInfoWindow({
      id: makeTemporaryId(),
      type: "manual_place",
      category: "직접 추가",
      title,
      address,
      query: address,
      source: "지도 우클릭",
      lat,
      lng,
      placeId
    });
  }

  function placeFromGeocoderResult(result, fallbackTitle, source) {
    const location = result.geometry.location;

    return {
      id: makeTemporaryId(),
      type: "manual_place",
      category: inferCategory(result.types || []),
      title: shortPlaceTitle(result) || fallbackTitle || "검색한 장소",
      address: result.formatted_address || fallbackTitle || "",
      query: result.formatted_address || fallbackTitle || "",
      source,
      lat: location.lat(),
      lng: location.lng(),
      placeId: result.place_id || ""
    };
  }

  function shortPlaceTitle(result) {
    const firstComponent = result?.address_components?.[0]?.long_name;
    if (firstComponent) return firstComponent;

    const address = result?.formatted_address || "";
    return address.split(",")[0].trim();
  }

  function inferCategory(types) {
    if (types.includes("airport")) return "공항";
    if (types.includes("lodging")) return "호텔";
    if (types.includes("train_station") || types.includes("subway_station")) return "역";
    if (types.includes("bus_station")) return "버스터미널";
    if (types.includes("restaurant") || types.includes("cafe")) return "음식점";
    if (types.includes("museum") || types.includes("tourist_attraction") || types.includes("point_of_interest")) return "관광지";
    return "장소";
  }

  function makeTemporaryId() {
    if (window.crypto?.randomUUID) {
      return `manual_${crypto.randomUUID()}`;
    }

    return `manual_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function renderMarkers() {
    clearMarkers();

    if (!STATE.map || !window.google?.maps) return;

    STATE.places = dedupePlaces(STATE.places);

    STATE.places.forEach((place) => {
      const marker = new google.maps.Marker({
        map: STATE.map,
        position: {
          lat: Number(place.lat),
          lng: Number(place.lng)
        },
        title: place.title || place.name || "Atlas place"
      });

      marker.addListener("click", () => openSavedPlaceInfoWindow(marker, place));
      STATE.markers.push(marker);
    });
  }

  function openSavedPlaceInfoWindow(marker, place) {
    const googleMapsUrl = buildGoogleMapsUrl(place);
    const directionsUrl = buildGoogleMapsDirectionsUrl(place);
    const canDelete = isManualMapPlace(place);

    STATE.infoWindow.setContent(`
      <div class="atlas-map-info">
        <div class="atlas-map-info-header">
          <a class="atlas-map-info-title-link"
             href="${escapeHtml(googleMapsUrl)}"
             target="_blank"
             rel="noopener noreferrer">${escapeHtml(place.title || place.name || "Atlas place")}</a>
          ${canDelete
            ? `<button class="atlas-map-delete-chip" type="button" data-atlas-delete-place="${escapeHtml(place.id)}">Delete</button>`
            : ""}
        </div>
        ${(place.address || place.query)
          ? `<p>${escapeHtml(place.address || place.query)}</p>`
          : ""}
        <div class="atlas-map-action-row">
          <a class="atlas-map-link-button" href="${escapeHtml(googleMapsUrl)}" target="_blank" rel="noopener noreferrer">Open in Maps</a>
          <a class="atlas-map-link-button atlas-map-link-button-primary" href="${escapeHtml(directionsUrl)}" target="_blank" rel="noopener noreferrer">Directions</a>
        </div>
      </div>
    `);

    STATE.infoWindow.open({
      map: STATE.map,
      anchor: marker
    });

    google.maps.event.addListenerOnce(STATE.infoWindow, "domready", () => {
      const selector = `[data-atlas-delete-place="${cssEscape(place.id)}"]`;
      const button = document.querySelector(selector);
      if (button) {
        button.addEventListener("click", () => void deletePlace(place.id));
      }
    });
  }

  function showPendingPlaceInfoWindow(place) {
    const googleMapsUrl = buildGoogleMapsUrl(place);
    const directionsUrl = buildGoogleMapsDirectionsUrl(place);

    STATE.infoWindow.setContent(`
      <div class="atlas-map-info">
        <div class="atlas-map-info-header">
          <a class="atlas-map-info-title-link"
             href="${escapeHtml(googleMapsUrl)}"
             target="_blank"
             rel="noopener noreferrer">${escapeHtml(place.title)}</a>
          <button class="atlas-map-add-chip" type="button" data-atlas-add-place="true">Add</button>
        </div>
        <p>${escapeHtml(place.address)}</p>
        <div class="atlas-map-action-row">
          <a class="atlas-map-link-button" href="${escapeHtml(googleMapsUrl)}" target="_blank" rel="noopener noreferrer">Open in Maps</a>
          <a class="atlas-map-link-button atlas-map-link-button-primary" href="${escapeHtml(directionsUrl)}" target="_blank" rel="noopener noreferrer">Directions</a>
        </div>
      </div>
    `);

    STATE.infoWindow.setPosition({
      lat: Number(place.lat),
      lng: Number(place.lng)
    });

    STATE.infoWindow.open({ map: STATE.map });

    google.maps.event.addListenerOnce(STATE.infoWindow, "domready", () => {
      const button = document.querySelector('[data-atlas-add-place="true"]');
      if (button) {
        button.addEventListener("click", () => void addPlace(place));
      }
    });
  }

  async function addPlace(place) {
    if (!place || isKoreaPlace(place)) {
      alert("한국 지역 마커는 Atlas 여행 지도에 저장하지 않아요.");
      return;
    }

    const button = document.querySelector('[data-atlas-add-place="true"]');

    if (button) {
      button.disabled = true;
      button.textContent = "Saving";
    }

    try {
      if (!window.AtlasAPI?.saveManualMapPlace) {
        throw new Error("Atlas Supabase API가 연결되지 않았어요.");
      }

      const result = await AtlasAPI.saveManualMapPlace(place);
      const savedPlace = result?.place;

      if (!savedPlace) {
        throw new Error("마커 저장 결과가 올바르지 않아요.");
      }

      STATE.places = dedupePlaces([...STATE.places, savedPlace]);
      STATE.infoWindow.close();
      renderMarkers();
      moveTo(savedPlace.id);
    } catch (error) {
      console.error("Atlas map marker save failed:", error);

      if (button) {
        button.disabled = false;
        button.textContent = "Add";
      }

      alert(error?.message || "마커 저장에 실패했어요.");
    }
  }

  async function deletePlace(placeId) {
    if (!placeId) return;

    try {
      if (!window.AtlasAPI?.removeManualMapPlace) {
        throw new Error("Atlas Supabase API가 연결되지 않았어요.");
      }

      await AtlasAPI.removeManualMapPlace(placeId);
      STATE.places = STATE.places.filter((place) => place.id !== placeId);
      STATE.infoWindow.close();
      renderMarkers();
    } catch (error) {
      console.error("Atlas map marker delete failed:", error);
      alert(error?.message || "마커 삭제에 실패했어요.");
    }
  }

  function isManualMapPlace(place) {
    return (
      place?.type === "manual_place" ||
      String(place?.source || "").includes("Supabase") ||
      String(place?.source || "").includes("검색") ||
      String(place?.source || "").includes("지도")
    );
  }

  function clearMarkers() {
    STATE.markers.forEach((marker) => marker.setMap(null));
    STATE.markers = [];
  }

  function fitToPlaces() {
    if (!STATE.map) return;

    const validPlaces = STATE.places.filter(hasValidLatLng);
    if (!validPlaces.length) return;

    if (validPlaces.length === 1) {
      STATE.map.setCenter({
        lat: Number(validPlaces[0].lat),
        lng: Number(validPlaces[0].lng)
      });
      STATE.map.setZoom(CONFIG.focusedZoom);
      return;
    }

    const bounds = new google.maps.LatLngBounds();

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
    if (!place || !STATE.map || !hasValidLatLng(place)) return;

    STATE.map.panTo({
      lat: Number(place.lat),
      lng: Number(place.lng)
    });
    STATE.map.setZoom(CONFIG.focusedZoom);
  }

  function setPlaces(places) {
    STATE.places = dedupePlaces(places || []);
    renderMarkers();
    fitToPlaces();
  }

  function showRoute() {}

  function clearRoute() {}

  function isReady() {
    return STATE.isReady;
  }

  function buildGoogleMapsQuery(place) {
    if (!place) return "";

    if (hasValidLatLng(place)) {
      return `${Number(place.lat).toFixed(6)},${Number(place.lng).toFixed(6)}`;
    }

    return place.address || place.query || place.title || place.name || "";
  }

  function buildGoogleMapsUrl(place) {
    const url = new URL("https://www.google.com/maps/search/");
    url.searchParams.set("api", "1");
    url.searchParams.set("query", buildGoogleMapsQuery(place) || "Istanbul");

    if (place?.placeId) {
      url.searchParams.set("query_place_id", place.placeId);
    }

    return url.toString();
  }

  function buildGoogleMapsDirectionsUrl(place) {
    const url = new URL("https://www.google.com/maps/dir/");
    url.searchParams.set("api", "1");
    url.searchParams.set("destination", buildGoogleMapsQuery(place) || "Istanbul");

    if (place?.placeId) {
      url.searchParams.set("destination_place_id", place.placeId);
    }

    return url.toString();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function cssEscape(value) {
    if (window.CSS?.escape) return CSS.escape(String(value ?? ""));
    return String(value ?? "").replace(/["\\]/g, "\\$&");
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
