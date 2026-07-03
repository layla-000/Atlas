function getAtlasMapPlacesForTrip(tripId) {
  tripId = tripId || getDefaultAtlasTripId_();

  const memory = getAtlasTravelMemoryForDashboard(tripId, 50);
  const items = memory && memory.items ? memory.items : [];
  const places = [];

  items.forEach(function(item) {
    const object = item.object || {};

    addMapPlaceIfPresent_(places, {
      id: item.id + "_departure",
      type: item.objectType,
      title: object.departurePlace || object.departureAirport || object.departureStation || "",
      address: object.departureAddress || "",
      schedule: object.departureDate || object.departureTime
        ? [object.departureDate, object.departureTime].filter(Boolean).join(" ")
        : "",
      source: item.sourceDocument && item.sourceDocument.fileName
    });

    addMapPlaceIfPresent_(places, {
      id: item.id + "_arrival",
      type: item.objectType,
      title: object.arrivalPlace || object.arrivalAirport || object.arrivalStation || "",
      address: object.arrivalAddress || "",
      schedule: object.arrivalDate || object.arrivalTime
        ? [object.arrivalDate, object.arrivalTime].filter(Boolean).join(" ")
        : "",
      source: item.sourceDocument && item.sourceDocument.fileName
    });

    addMapPlaceIfPresent_(places, {
      id: item.id + "_hotel",
      type: item.objectType,
      title: object.hotelName || object.name || "",
      address: object.address || object.city || object.location || "",
      schedule: object.checkIn || object.checkOut
        ? [object.checkIn, object.checkOut].filter(Boolean).join(" ~ ")
        : "",
      source: item.sourceDocument && item.sourceDocument.fileName
    });
  });

  const manualPlaces = getAtlasManualMapPlaces(tripId);

  manualPlaces.forEach(function(place) {
    if (!place) return;

    places.push({
      id: place.id,
      type: place.type || "manual_place",
      category: place.category || "장소",
      title: place.title || "",
      address: place.address || "",
      query: place.query || place.address || place.title || "",
      schedule: place.schedule || "",
      source: place.source || "Google Maps 검색",
      placeId: place.placeId || "",
      lat: place.lat,
      lng: place.lng
    });
  });

  return dedupeMapPlaces_(places);
}

function addMapPlaceIfPresent_(places, place) {
  const title = String(place.title || "").trim();
  const address = String(place.address || "").trim();
  const query = String(place.query || address || title || "").trim();

  if (!title && !address && !query) return;
  if (isBadMapPlaceText_(query)) return;

  places.push({
    id: place.id,
    type: place.type || "place",
    category: getMapPlaceCategory_(place.type || ""),
    title: title || address || query,
    address: address,
    query: query,
    schedule: place.schedule || "",
    source: place.source || ""
  });
}

function getMapPlaceCategory_(type) {
  const value = String(type || "").toLowerCase();

  if (value.indexOf("flight") >= 0 || value.indexOf("airport") >= 0) return "공항";
  if (value.indexOf("hotel") >= 0) return "호텔";
  if (value.indexOf("tour") >= 0 || value.indexOf("activity") >= 0 || value.indexOf("place") >= 0) return "관광지";
  if (value.indexOf("train") >= 0) return "기차역";
  if (value.indexOf("bus") >= 0) return "버스터미널";

  return "장소";
}

function isBadMapPlaceText_(value) {
  const text = String(value || "").toLowerCase();

  return (
    !text ||
    text.length > 100 ||
    text.indexOf("refund") >= 0 ||
    text.indexOf("reservation applies") >= 0 ||
    text.indexOf("restrictive") >= 0
  );
}

function dedupeMapPlaces_(places) {
  const seen = {};
  return (places || []).filter(function(place) {
    const key = [
      normalizeAtlasText_(place.title),
      normalizeAtlasText_(place.address),
      normalizeAtlasText_(place.query),
      place.placeId || "",
      place.lat || "",
      place.lng || ""
    ].join("::");

    if (!key || seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function getAtlasManualMapPlaces(tripId) {
  const key = getAtlasManualMapPlacesKey_(tripId || getDefaultAtlasTripId_());
  return readAtlasMapJson_(key, []);
}

function saveAtlasManualMapPlace(payload) {
  payload = payload || {};

  const tripId = String(payload.tripId || getDefaultAtlasTripId_()).trim();
  const tripName = String(payload.tripName || getDefaultAtlasTripName_()).trim();

  const place = {
    id: payload.id || createAtlasMapId_("manual_place"),
    tripId: tripId,
    tripName: tripName,
    type: String(payload.type || "manual_place"),
    category: String(payload.category || "장소"),
    title: String(payload.title || "").trim(),
    address: String(payload.address || "").trim(),
    query: String(payload.query || "").trim(),
    schedule: String(payload.schedule || "").trim(),
    source: String(payload.source || "Google Maps 검색"),
    placeId: String(payload.placeId || "").trim(),
    lat: Number(payload.lat),
    lng: Number(payload.lng),
    createdAt: new Date().toISOString()
  };

  if (!place.title) {
    throw new Error("saveAtlasManualMapPlace: title is required");
  }

  if (!Number.isFinite(place.lat) || !Number.isFinite(place.lng)) {
    throw new Error("saveAtlasManualMapPlace: valid lat/lng is required");
  }

  const key = getAtlasManualMapPlacesKey_(tripId);
  const existing = readAtlasMapJson_(key, []);

  const deduped = existing.filter(function(item) {
    if (!item) return false;

    if (place.placeId && item.placeId && item.placeId === place.placeId) {
      return false;
    }

    if (
      normalizeAtlasText_(item.title) === normalizeAtlasText_(place.title) &&
      normalizeAtlasText_(item.address) === normalizeAtlasText_(place.address)
    ) {
      return false;
    }

    return true;
  });

  deduped.push(place);
  writeAtlasMapJson_(key, deduped);

  return {
    success: true,
    tripId: tripId,
    place: place,
    count: deduped.length
  };
}

function removeAtlasManualMapPlace(payload) {
  payload = payload || {};

  const tripId = String(payload.tripId || getDefaultAtlasTripId_()).trim();
  const placeId = String(payload.placeId || "").trim();

  if (!placeId) {
    throw new Error("removeAtlasManualMapPlace: placeId is required");
  }

  const key = getAtlasManualMapPlacesKey_(tripId);
  const existing = readAtlasMapJson_(key, []);
  const filtered = existing.filter(function(item) {
    return item && item.id !== placeId;
  });

  writeAtlasMapJson_(key, filtered);

  return {
    success: true,
    tripId: tripId,
    removed: existing.length - filtered.length,
    count: filtered.length
  };
}

function getAtlasManualMapPlacesKey_(tripId) {
  return "ATLAS_MANUAL_MAP_PLACES__" + tripId;
}

function getDefaultAtlasTripId_() {
  return "trip_turkiye_2026";
}

function getDefaultAtlasTripName_() {
  return "Türkiye 2026";
}

function createAtlasMapId_(prefix) {
  return prefix + "_" + Utilities.getUuid();
}

function normalizeAtlasText_(value) {
  return String(value || "").trim().toLowerCase();
}

function readAtlasMapJson_(key, fallback) {
  const raw = PropertiesService.getScriptProperties().getProperty(key);

  if (!raw) return fallback;

  try {
    return JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
}

function writeAtlasMapJson_(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(value));
}