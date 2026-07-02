function syncSemanticMemoryToNotion(record) {
  const config = getNotionConfig_();

  if (!config.enabled) {
    return {
      notionStatus: "skipped",
      message: "Notion 설정이 없어 저장을 건너뛰었어요."
    };
  }

  if (!record.semantic) {
    return {
      notionStatus: "skipped",
      message: "Semantic 결과가 없어 Notion 저장을 건너뛰었어요."
    };
  }

  const entityResults = record.semantic.entities.map(function(entity) {
    return createNotionKnowledgeEntity_(config, record, entity);
  });

  const relationshipResults = record.semantic.relationships.map(function(relationship) {
    return createNotionRelationship_(config, record, relationship);
  });

  return {
    notionStatus: "completed",
    syncedAt: new Date().toISOString(),
    entityCount: entityResults.length,
    relationshipCount: relationshipResults.length,
    entities: entityResults,
    relationships: relationshipResults
  };
}

function getNotionConfig_() {
  const props = PropertiesService.getScriptProperties();

  return {
    enabled: props.getProperty("NOTION_TOKEN") ? true : false,
    token: props.getProperty("NOTION_TOKEN"),
    documentDatabaseId: props.getProperty("NOTION_DOCUMENT_DB_ID"),
    entityDatabaseId: props.getProperty("NOTION_KNOWLEDGE_ENTITY_DB_ID"),
    relationshipDatabaseId: props.getProperty("NOTION_RELATIONSHIP_DB_ID")
  };
}
function createNotionKnowledgeEntity_(config, record, entity) {
  const payload = {
    parent: { database_id: config.entityDatabaseId },
    properties: {
      Name: { title: [{ text: { content: entity.name || "Untitled" } }] },
      Type: { select: { name: entity.type } },
      Trip: { rich_text: [{ text: { content: record.tripName || record.tripId || "" } }] },
      Confidence: { number: entity.confidence || 0 },
      Source: { rich_text: [{ text: { content: "Atlas Semantic Extractor" } }] },
      AtlasId: { rich_text: [{ text: { content: entity.id } }] }
    }
  };

  return callNotionCreatePage_(config.token, payload);
}

function createNotionRelationship_(config, record, relationship) {
  const payload = {
    parent: { database_id: config.relationshipDatabaseId },
    properties: {
      Name: { title: [{ text: { content: relationship.type } }] },
      From: { rich_text: [{ text: { content: relationship.fromId } }] },
      To: { rich_text: [{ text: { content: relationship.toId } }] },
      Type: { select: { name: relationship.type } },
      Trip: { rich_text: [{ text: { content: record.tripName || record.tripId || "" } }] },
      Confidence: { number: relationship.confidence || 0 },
      AtlasId: { rich_text: [{ text: { content: relationship.id } }] }
    }
  };

  return callNotionCreatePage_(config.token, payload);
}

function callNotionCreatePage_(token, payload) {
  const response = UrlFetchApp.fetch("https://api.notion.com/v1/pages", {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: "Bearer " + token,
      "Notion-Version": "2022-06-28"
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const code = response.getResponseCode();
  const body = JSON.parse(response.getContentText());

  if (code < 200 || code >= 300) {
    throw new Error("Notion API error: " + code + " " + response.getContentText());
  }

  return {
    notionPageId: body.id,
    url: body.url
  };
}
function syncParsedDocumentToNotion(record, parsed, documentIntel, knowledge) {
  const config = getNotionConfig_();

  if (!config.enabled || !config.documentDatabaseId) {
    return {
      notionStatus: "skipped",
      message: "Notion Documents DB 설정이 없어 저장을 건너뛰었어요."
    };
  }

  const extractionMeta = parsed.extractionMeta || {};
  const documentType = documentIntel && documentIntel.documentType
    ? documentIntel.documentType
    : "unknown_document";

  const payload = {
    parent: { database_id: config.documentDatabaseId },
    properties: {
      "name": {
        title: [{ text: { content: parsed.title || record.fileName || "Untitled Document" } }]
      },
      "confidence": {
        number: documentIntel && documentIntel.confidence ? documentIntel.confidence : 0.7
      },
      "document ID": {
        rich_text: [{ text: { content: record.id } }]
      },
      "document type": {
        select: { name: documentType }
      },
      "extraction status": {
        select: { name: extractionMeta.lowQuality ? "low_quality" : "parsed" }
      },
      "file": {
        url: parsed.fileUrl || record.fileUrl || null
      },
      "file format": {
        rich_text: [{ text: { content: record.mimeType || parsed.mimeType || "unknown" } }]
      },
      "file name": {
        rich_text: [{ text: { content: record.fileName || "" } }]
      },
      "language": {
        rich_text: [{ text: { content: detectDocumentLanguage_(parsed) } }]
      },
      "status": {
        select: { name: "parsed" }
      },
      "trip": {
        rich_text: [{ text: { content: record.tripName || record.tripId || "" } }]
      },
      "uploaded at": {
        date: { start: record.createdAt || new Date().toISOString() }
      },
      "extracted objects": {
        rich_text: [{ text: { content: safeJsonForNotion_(knowledge) } }]
      },
      "evidence lines": {
        rich_text: [{ text: { content: buildEvidenceLinesForNotion_(parsed, documentIntel) } }]
      },
      "tags": {
        multi_select: buildDocumentTags_(documentType, extractionMeta)
      }
    }
  };

  const result = callNotionCreatePage_(config.token, payload);

  return {
    notionStatus: "completed",
    syncedAt: new Date().toISOString(),
    documentType: documentType,
    notionPageId: result.notionPageId,
    url: result.url
  };
}

function safeJsonForNotion_(value) {
  const text = JSON.stringify(value || {}, null, 2);
  return text.length > 1900 ? text.slice(0, 1900) + "\n...truncated" : text;
}

function buildEvidenceLinesForNotion_(parsed, documentIntel) {
  const lines = [];
  const intel = documentIntel && documentIntel.travelData ? documentIntel.travelData : {};

  if (parsed && parsed.summary) {
    lines.push("Summary: " + parsed.summary);
  }

  if (documentIntel && documentIntel.documentType) {
    lines.push("Document Type: " + documentIntel.documentType);
  }

  if (intel.hotelName) lines.push("Hotel: " + intel.hotelName);
  if (intel.checkIn) lines.push("Check-in: " + intel.checkIn);
  if (intel.checkOut) lines.push("Check-out: " + intel.checkOut);

  if (intel.airline) lines.push("Airline: " + intel.airline);
  if (intel.flightNumber) lines.push("Flight: " + intel.flightNumber);
  if (intel.departurePlace) lines.push("From: " + intel.departurePlace);
  if (intel.arrivalPlace) lines.push("To: " + intel.arrivalPlace);

  if (intel.tourName) lines.push("Tour: " + intel.tourName);
  if (intel.date) lines.push("Date: " + intel.date);

  if (intel.bookingReference) lines.push("Booking Ref: " + intel.bookingReference);

  return lines.join("\n").slice(0, 1900);
}

function buildDocumentTags_(documentType, extractionMeta) {
  const tags = [{ name: "atlas" }];

  if (documentType && documentType !== "unknown_document") {
    tags.push({ name: documentType });
  }

  if (extractionMeta && extractionMeta.lowQuality) {
    tags.push({ name: "low_quality" });
  }

  return tags;
}

function detectDocumentLanguage_(parsed) {
  const text = ((parsed && parsed.extractedText) || "").slice(0, 2000);

  if (/[가-힣]/.test(text)) return "ko";
  if (/[ğüşöçıİĞÜŞÖÇ]/i.test(text)) return "tr";
  return "en";
}