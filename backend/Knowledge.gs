function generateKnowledgeObjects(parsed, record) {
  const now = new Date().toISOString();
  const text = [
    parsed.title || "",
    parsed.summary || "",
    parsed.extractedText || ""
  ].join("\n");

  const objects = [];

  objects.push(createKnowledgeObject_("document", parsed.title, {
    tripId: record.tripId,
    tripName: record.tripName,
    fileId: record.fileId,
    fileUrl: record.fileUrl,
    fileName: record.fileName,
    mimeType: record.mimeType,
    summary: parsed.summary,
    source: "parser",
    createdAt: now
  }));

  addTravelDocumentKnowledgeObject_(parsed, record, objects, now);

  extractDateObjects_(text, record, objects, now);
  extractMoneyObjects_(text, record, objects, now);
  extractLocationObjects_(text, record, objects, now);

  return {
    generatedAt: now,
    count: objects.length,
    objects: objects
  };
}
function createKnowledgeObject_(type, name, properties) {
  return {
    id: "ko_" + Utilities.getUuid(),
    type: type,
    name: name || "Untitled",
    confidence: 0.7,
    properties: properties || {}
  };
}

function extractDateObjects_(text, record, objects, now) {
  const regex = /\b(20\d{2})[-./년 ]\s?(\d{1,2})[-./월 ]\s?(\d{1,2})/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    objects.push(createKnowledgeObject_("date", match[0], {
      tripId: record.tripId,
      tripName: record.tripName,
      value: match[0],
      source: "parser_regex",
      createdAt: now
    }));
  }
}

function extractMoneyObjects_(text, record, objects, now) {
  const regex = /(?:KRW|₩|USD|\$|EUR|€)?\s?\d{1,3}(?:,\d{3})+(?:원|달러|유로)?/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    objects.push(createKnowledgeObject_("money", match[0], {
      tripId: record.tripId,
      tripName: record.tripName,
      value: match[0],
      source: "parser_regex",
      createdAt: now
    }));
  }
}

function extractLocationObjects_(text, record, objects, now) {
  const candidates = [
    "Paris", "London", "Tokyo", "Seoul", "Osaka", "Kyoto",
    "Rome", "Milan", "Venice", "Barcelona", "Madrid",
    "New York", "Bangkok", "Taipei", "Singapore"
  ];

  candidates.forEach(function(name) {
    if (text.indexOf(name) !== -1) {
      objects.push(createKnowledgeObject_("location", name, {
        tripId: record.tripId,
        tripName: record.tripName,
        source: "parser_dictionary",
        createdAt: now
      }));
    }
  });
}
function addTravelDocumentKnowledgeObject_(parsed, record, objects, now) {
  const intel = parsed.documentIntel;

  if (!intel || !intel.documentType || !intel.travelData) {
    return;
  }

  if (intel.documentType === "unknown_document") {
    return;
  }

  const travelObject = buildTravelKnowledgeObject_(intel, parsed, record, now);

  if (travelObject) {
    objects.push(travelObject);
  }
}

function buildTravelKnowledgeObject_(intel, parsed, record, now) {
  const data = intel.travelData || {};
  const type = intel.documentType;

  return createKnowledgeObject_(type, buildTravelKnowledgeName_(type, data, parsed), {
    tripId: record.tripId,
    tripName: record.tripName,
    sourceDocumentTitle: parsed.title,
    sourceFileName: parsed.fileName,
    fileId: parsed.fileId,
    fileUrl: parsed.fileUrl,
    source: "document_intel",
    createdAt: now,
    documentType: type,
    confidence: intel.confidence || data.confidence || 0.6,
    travelData: data
  });
}

function buildTravelKnowledgeName_(type, data, parsed) {
  if (type === "hotel_booking") {
    return data.hotelName || parsed.title;
  }

  if (type === "flight_booking") {
    const airline = data.airline || "Flight";
    const route = [data.departurePlace, data.arrivalPlace]
      .filter(Boolean)
      .join(" → ");
    return route ? airline + " " + route : (parsed.title || "Flight Booking");
  }

  if (type === "tour_booking") {
    return data.tourName || parsed.title;
  }

  if (type === "train_ticket") {
    const route = [data.departurePlace, data.arrivalPlace]
      .filter(Boolean)
      .join(" → ");
    return route || parsed.title || "Train Ticket";
  }

  if (type === "bus_ticket") {
    const route = [data.departurePlace, data.arrivalPlace]
      .filter(Boolean)
      .join(" → ");
    return route || parsed.title || "Bus Ticket";
  }

  return parsed.title || type;
}