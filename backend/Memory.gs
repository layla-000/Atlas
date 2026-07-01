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