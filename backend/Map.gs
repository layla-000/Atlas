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
      source: item.sourceDocument && item.sourceDocument.fileName
    });

    addMapPlaceIfPresent_(places, {
      id: item.id + "_arrival",
      type: item.objectType,
      title: object.arrivalPlace || object.arrivalAirport || object.arrivalStation || "",
      source: item.sourceDocument && item.sourceDocument.fileName
    });

    addMapPlaceIfPresent_(places, {
      id: item.id + "_hotel",
      type: item.objectType,
      title: object.hotelName || object.name || "",
      address: object.address || object.city || object.location || "",
      source: item.sourceDocument && item.sourceDocument.fileName
    });
  });

  return dedupeMapPlaces_(places);
}

function addMapPlaceIfPresent_(places, place) {
  const title = String(place.title || "").trim();
  const address = String(place.address || "").trim();

  if (!title && !address) return;

  const label = address || title;

  if (isBadMapPlaceText_(label)) return;

  places.push({
    id: place.id,
    type: place.type || "place",
    title: title || address,
    query: label,
    source: place.source || ""
  });
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