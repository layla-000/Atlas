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