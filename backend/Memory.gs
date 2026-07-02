const ATLAS_MEMORY_INDEX_KEY = "ATLAS_MEMORY_INDEX";
const ATLAS_MEMORY_RECORD_PREFIX = "ATLAS_MEMORY_RECORD__";

function buildAtlasMemorySnapshot(record) {
  if (!record.semantic) {
    return {
      memoryStatus: "skipped",
      message: "Semantic 결과가 없어 Memory Snapshot을 만들 수 없어요."
    };
  }

  const snapshot = {
    id: "mem_" + Utilities.getUuid(),
    createdAt: new Date().toISOString(),
    sourceInboxId: record.id,
    tripId: record.tripId,
    tripName: record.tripName,
    document: {
      fileName: record.fileName,
      fileId: record.fileId,
      fileUrl: record.fileUrl
    },
    entities: record.semantic.entities || [],
    relationships: record.semantic.relationships || [],
    notion: record.notion || null,
    status: "ready"
  };

  saveAtlasMemorySnapshot_(snapshot);

  return {
    memoryStatus: "completed",
    memoryId: snapshot.id,
    snapshot: snapshot
  };
}

function saveAtlasMemorySnapshot_(snapshot) {
  const props = PropertiesService.getScriptProperties();
  props.setProperty(ATLAS_MEMORY_RECORD_PREFIX + snapshot.id, JSON.stringify(snapshot));

  const index = getAtlasMemoryIndex_();
  index.unshift(snapshot.id);
  props.setProperty(ATLAS_MEMORY_INDEX_KEY, JSON.stringify(index));

  return snapshot;
}

function getAtlasMemorySnapshots(limit) {
  const props = PropertiesService.getScriptProperties();
  const index = getAtlasMemoryIndex_();
  const ids = limit ? index.slice(0, limit) : index;

  return ids
    .map(function(id) {
      const raw = props.getProperty(ATLAS_MEMORY_RECORD_PREFIX + id);
      return raw ? JSON.parse(raw) : null;
    })
    .filter(function(snapshot) {
      return snapshot !== null;
    });
}

function getAtlasMemoryIndex_() {
  const raw = PropertiesService.getScriptProperties().getProperty(ATLAS_MEMORY_INDEX_KEY);
  return raw ? JSON.parse(raw) : [];
}
function normalizeTravelMemoryForDashboard_(travelMemory) {
  const items = travelMemory && travelMemory.items ? travelMemory.items : [];
  const entities = [];

  items.forEach(function(item) {
    const entity = normalizeTravelMemoryItemToEntity_(item);

    if (entity) {
      entities.push(entity);
    }
  });

  return {
    tripId: travelMemory.tripId || "trip_turkiye_2026",
    generatedAt: new Date().toISOString(),
    entities: entities
  };
}

function normalizeTravelMemoryItemToEntity_(item) {
  if (!item) return null;

  const type = item.objectType || item.type || "";
  const object = item.object || item.properties || item.data || {};

  if (type === "hotel_booking") {
    return normalizeHotelBookingEntity_(item, object);
  }

  if (type === "flight_booking") {
    return normalizeFlightBookingEntity_(item, object);
  }

  if (type === "train_ticket" || type === "train_booking") {
    return normalizeTrainBookingEntity_(item, object);
  }

  if (type === "bus_ticket" || type === "bus_booking") {
    return normalizeBusBookingEntity_(item, object);
  }

  return null;
}

function normalizeHotelBookingEntity_(item, object) {
  return {
    id: item.id || "hotel_" + Utilities.getUuid(),
    type: "hotel_booking",
    title: object.hotelName || object.name || object.propertyName || "숙소",
    properties: {
      hotel_name: object.hotelName || object.name || object.propertyName || "숙소",
      city: object.city || object.location || object.address || "",
      check_in: normalizeDashboardDate_(object.checkIn || object.check_in || object.startDate),
      check_out: normalizeDashboardDate_(object.checkOut || object.check_out || object.endDate),
      check_in_time: object.checkInTime || object.check_in_time || "15:00",
      check_out_time: object.checkOutTime || object.check_out_time || "11:00",
      confirmation_number: object.confirmationNumber || object.bookingReference || object.reservationNumber || ""
    },
    sourceDocument: item.sourceDocument || {}
  };
}

function normalizeFlightBookingEntity_(item, object) {
  return {
    id: item.id || "flight_" + Utilities.getUuid(),
    type: "flight_booking",
    title: object.flightNo || object.flightNumber || object.airline || "항공편",
    properties: {
      airline: object.airline || "",
      flight_number: object.flightNo || object.flightNumber || object.flight_number || "",
      departure_date: normalizeDashboardDate_(object.departureDate || object.departure_date || object.date),
      departure_time: object.departureTime || object.departure_time || object.time || "",
      arrival_time: object.arrivalTime || object.arrival_time || "",
      departure_place: object.departurePlace || object.departureAirport || object.origin || object.from || "",
      arrival_place: object.arrivalPlace || object.arrivalAirport || object.destination || object.to || "",
      reference: object.pnr || object.bookingReference || object.confirmationNumber || ""
    },
    sourceDocument: item.sourceDocument || {}
  };
}

function normalizeTrainBookingEntity_(item, object) {
  return {
    id: item.id || "train_" + Utilities.getUuid(),
    type: "train_booking",
    title: object.trainNo || object.trainNumber || object.provider || "기차",
    properties: {
      operator: object.provider || object.operator || "Train",
      train_number: object.trainNo || object.trainNumber || object.train_number || "",
      departure_date: normalizeDashboardDate_(object.departureDate || object.departure_date || object.date),
      departure_time: object.departureTime || object.departure_time || object.time || "",
      arrival_time: object.arrivalTime || object.arrival_time || "",
      departure_place: object.departurePlace || object.departureStation || object.from || "",
      arrival_place: object.arrivalPlace || object.arrivalStation || object.to || "",
      reference: object.bookingReference || object.confirmationNumber || ""
    },
    sourceDocument: item.sourceDocument || {}
  };
}

function normalizeBusBookingEntity_(item, object) {
  return {
    id: item.id || "bus_" + Utilities.getUuid(),
    type: "bus_booking",
    title: object.busNo || object.busNumber || object.provider || "버스",
    properties: {
      operator: object.provider || object.operator || "Bus",
      bus_number: object.busNo || object.busNumber || object.bus_number || "",
      departure_date: normalizeDashboardDate_(object.departureDate || object.departure_date || object.date),
      departure_time: object.departureTime || object.departure_time || object.time || "",
      arrival_time: object.arrivalTime || object.arrival_time || "",
      departure_place: object.departurePlace || object.departureStation || object.from || "",
      arrival_place: object.arrivalPlace || object.arrivalStation || object.to || "",
      reference: object.bookingReference || object.confirmationNumber || ""
    },
    sourceDocument: item.sourceDocument || {}
  };
}

function normalizeDashboardDate_(value) {
  if (!value) return "";

  if (Object.prototype.toString.call(value) === "[object Date]") {
    return Utilities.formatDate(value, "Europe/Istanbul", "yyyy-MM-dd");
  }

  const text = String(value).trim();

  const isoMatch = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];

  const slashMatch = text.match(/^(\d{4})[./](\d{1,2})[./](\d{1,2})/);
  if (slashMatch) {
    return slashMatch[1] + "-" + String(slashMatch[2]).padStart(2, "0") + "-" + String(slashMatch[3]).padStart(2, "0");
  }

  const parsed = new Date(text);
  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, "Europe/Istanbul", "yyyy-MM-dd");
  }

  return "";
}