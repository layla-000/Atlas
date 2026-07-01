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