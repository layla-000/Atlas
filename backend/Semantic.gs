function runAtlasSemanticOnce() {
  const parserResult = runAtlasParserOnce();

  if (!parserResult || !parserResult.record) {
    return parserResult;
  }

  const record = parserResult.record;
  const parsed = record.result && record.result.parsed
    ? record.result.parsed
    : record.parsed;

  if (!parsed) {
    return {
      success: false,
      message: "Parser 결과가 없어 Semantic Extractor를 실행할 수 없어요.",
      record: record
    };
  }

  const semantic = extractSemanticMemory(parsed, record);

  const updated = updateInboxRecordStatus(record.id, {
    semanticStatus: "completed",
    semantic: semantic,
    memoryStatus: "semantic_ready"
  });

  return {
    success: true,
    message: "Semantic Extractor 처리가 완료되었어요.",
    record: updated
  };
}

function extractSemanticMemory(parsed, record) {
  const entities = generateSemanticEntities(parsed, record);
  const relationships = buildSemanticRelationships(entities, parsed, record);

  return {
    generatedAt: new Date().toISOString(),
    schemaVersion: "atlas_semantic_memory_v0.1",
    entities: entities,
    relationships: relationships
  };
}

function generateSemanticEntities(parsed, record) {
  const now = new Date().toISOString();
  const text = [
    parsed.title || "",
    parsed.summary || "",
    parsed.extractedText || ""
  ].join("\n");

  const entities = [];

  entities.push(createSemanticEntity_("document", parsed.title, {
    tripId: record.tripId,
    tripName: record.tripName,
    fileId: record.fileId,
    fileUrl: record.fileUrl,
    fileName: record.fileName,
    mimeType: record.mimeType,
    source: "parser",
    createdAt: now
  }));

  entities.push(createSemanticEntity_("trip", record.tripName || record.tripId, {
    tripId: record.tripId,
    source: "inbox_record",
    createdAt: now
  }));

  extractSemanticDates_(text, record, entities, now);
  extractSemanticMoney_(text, record, entities, now);
  extractSemanticPlaces_(text, record, entities, now);
  extractSemanticOrganizations_(text, record, entities, now);
  extractSemanticFlights_(text, record, entities, now);
  extractSemanticHotels_(text, record, entities, now);

  return dedupeSemanticEntities_(entities);
}

function buildSemanticRelationships(entities, parsed, record) {
  const now = new Date().toISOString();
  const relationships = [];

  const documentEntity = findFirstEntity_(entities, "document");
  const tripEntity = findFirstEntity_(entities, "trip");

  if (documentEntity && tripEntity) {
    relationships.push(createSemanticRelationship_(
      documentEntity.id,
      "BELONGS_TO_TRIP",
      tripEntity.id,
      { source: "semantic_builder", createdAt: now }
    ));
  }

  entities.forEach(function(entity) {
    if (documentEntity && entity.id !== documentEntity.id) {
      relationships.push(createSemanticRelationship_(
        documentEntity.id,
        "MENTIONS",
        entity.id,
        { source: "semantic_builder", createdAt: now }
      ));
    }

    if (tripEntity && entity.type !== "document" && entity.type !== "trip") {
      relationships.push(createSemanticRelationship_(
        tripEntity.id,
        "HAS_CONTEXT",
        entity.id,
        { source: "semantic_builder", createdAt: now }
      ));
    }
  });

  return relationships;
}

function createSemanticEntity_(type, name, properties) {
  return {
    id: "se_" + Utilities.getUuid(),
    type: type,
    name: name || "Untitled",
    confidence: 0.72,
    properties: properties || {}
  };
}

function createSemanticRelationship_(fromId, relationType, toId, properties) {
  return {
    id: "sr_" + Utilities.getUuid(),
    fromId: fromId,
    type: relationType,
    toId: toId,
    confidence: 0.68,
    properties: properties || {}
  };
}

function extractSemanticDates_(text, record, entities, now) {
  const regex = /\b(20\d{2})[-./년 ]\s?(\d{1,2})[-./월 ]\s?(\d{1,2})/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    entities.push(createSemanticEntity_("date", match[0], {
      tripId: record.tripId,
      tripName: record.tripName,
      value: match[0],
      source: "semantic_regex",
      createdAt: now
    }));
  }
}

function extractSemanticMoney_(text, record, entities, now) {
  const regex = /(?:KRW|₩|USD|\$|EUR|€)?\s?\d{1,3}(?:,\d{3})+(?:원|달러|유로)?/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    entities.push(createSemanticEntity_("money", match[0], {
      tripId: record.tripId,
      tripName: record.tripName,
      value: match[0],
      source: "semantic_regex",
      createdAt: now
    }));
  }
}

function extractSemanticPlaces_(text, record, entities, now) {
  const places = [
    "Paris", "London", "Tokyo", "Seoul", "Osaka", "Kyoto",
    "Rome", "Milan", "Venice", "Barcelona", "Madrid",
    "New York", "Bangkok", "Taipei", "Singapore",
    "Louvre", "Eiffel Tower", "Charles de Gaulle", "Incheon Airport"
  ];

  places.forEach(function(name) {
    if (text.indexOf(name) !== -1) {
      entities.push(createSemanticEntity_("place", name, {
        tripId: record.tripId,
        tripName: record.tripName,
        source: "semantic_dictionary",
        createdAt: now
      }));
    }
  });
}

function extractSemanticOrganizations_(text, record, entities, now) {
  const orgs = [
    "Air France", "Korean Air", "Asiana Airlines", "ANA", "JAL",
    "Hilton", "Marriott", "Hyatt", "Booking.com", "Google"
  ];

  orgs.forEach(function(name) {
    if (text.indexOf(name) !== -1) {
      entities.push(createSemanticEntity_("organization", name, {
        tripId: record.tripId,
        tripName: record.tripName,
        source: "semantic_dictionary",
        createdAt: now
      }));
    }
  });
}

function extractSemanticFlights_(text, record, entities, now) {
  const regex = /\b([A-Z]{2})\s?(\d{2,4})\b/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    entities.push(createSemanticEntity_("flight", match[0], {
      tripId: record.tripId,
      tripName: record.tripName,
      carrierCode: match[1],
      flightNumber: match[2],
      source: "semantic_regex",
      createdAt: now
    }));
  }
}

function extractSemanticHotels_(text, record, entities, now) {
  const regex = /\b([A-Z][A-Za-z]+(?:\s[A-Z][A-Za-z]+){0,3})\s(?:Hotel|Resort|Inn|Suites)\b/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    entities.push(createSemanticEntity_("hotel", match[0], {
      tripId: record.tripId,
      tripName: record.tripName,
      source: "semantic_regex",
      createdAt: now
    }));
  }
}

function dedupeSemanticEntities_(entities) {
  const seen = {};
  const result = [];

  entities.forEach(function(entity) {
    const key = entity.type + "::" + entity.name;
    if (!seen[key]) {
      seen[key] = true;
      result.push(entity);
    }
  });

  return result;
}

function findFirstEntity_(entities, type) {
  for (let i = 0; i < entities.length; i++) {
    if (entities[i].type === type) {
      return entities[i];
    }
  }
  return null;
}