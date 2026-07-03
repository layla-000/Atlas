function getAtlasMapPlacesForTrip(tripId) {
  const memory = getAtlasTravelMemoryForDashboard(tripId || "trip_turkiye_2026", 50);
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

  if (value.indexOf("flight") >= 0 || value.indexOf("airport") >= 0) {
    return "공항";
  }

  if (value.indexOf("hotel") >= 0) {
    return "호텔";
  }

  if (value.indexOf("tour") >= 0 || value.indexOf("activity") >= 0 || value.indexOf("place") >= 0) {
    return "관광지";
  }

  if (value.indexOf("train") >= 0) {
    return "기차역";
  }

  if (value.indexOf("bus") >= 0) {
    return "버스터미널";
  }

  return "장소";
}

function isBadMapPlaceText_(value) {
  const text = String(value || "").toLowerCase();

  return (
    !text ||
    text.length > 80 ||
    text.indexOf("refund") >= 0 ||
    text.indexOf("reservation applies") >= 0 ||
    text.indexOf("restrictive") >= 0
  );
}

function dedupeMapPlaces_(places) {
  const seen = {};
  return places.filter(function(place) {
    const key = String(place.query || place.title || "").toLowerCase();
    if (!key || seen[key]) return false;
    seen[key] = true;
    return true;
  });
}