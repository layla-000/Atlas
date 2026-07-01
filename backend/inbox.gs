const ATLAS_INBOX_INDEX_KEY = "ATLAS_INBOX_INDEX";
const ATLAS_INBOX_RECORD_PREFIX = "ATLAS_INBOX_RECORD__";

function enqueueUploadedFile(payload, savedFile, trip) {
  const record = buildInboxRecord(payload, savedFile, trip);
  saveInboxRecord(record);
  return record;
}

function buildInboxRecord(payload, savedFile, trip) {
  const now = new Date().toISOString();
  const isReceipt = payload.type === "receipt";

  return {
    id: createAtlasInboxId(),
    createdAt: now,
    updatedAt: now,
    source: "web_upload",
    status: "queued",
    tripId: payload.tripId,
    tripName: trip.name || payload.tripId,
    uploadType: payload.type,
    fileName: payload.fileName,
    mimeType: payload.mimeType || "application/octet-stream",
    fileId: savedFile.getId(),
    fileUrl: savedFile.getUrl(),
    parserStatus: isReceipt ? "skipped" : "queued",
    budgetStatus: isReceipt ? "queued" : "not_applicable",
    notionStatus: "pending",
    memoryStatus: "pending",
    error: null
  };
}

function saveInboxRecord(record) {
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);

  try {
    const props = PropertiesService.getScriptProperties();
    props.setProperty(ATLAS_INBOX_RECORD_PREFIX + record.id, JSON.stringify(record));

    const index = getInboxIndex_();
    index.unshift(record.id);
    props.setProperty(ATLAS_INBOX_INDEX_KEY, JSON.stringify(index));

    return record;
  } finally {
    lock.releaseLock();
  }
}

function getAtlasInboxRecords(limit) {
  const props = PropertiesService.getScriptProperties();
  const index = getInboxIndex_();
  const ids = limit ? index.slice(0, limit) : index;

  return ids
    .map(function(id) {
      const raw = props.getProperty(ATLAS_INBOX_RECORD_PREFIX + id);
      return raw ? JSON.parse(raw) : null;
    })
    .filter(function(record) {
      return record !== null;
    });
}

function getQueuedInboxRecords(limit) {
  return getAtlasInboxRecords(limit)
    .filter(function(record) {
      return record.status === "queued";
    });
}

function lockNextInboxRecord() {
  const queued = getQueuedInboxRecords(1);

  if (queued.length === 0) {
    return null;
  }

  return updateInboxRecordStatus(queued[0].id, {
    status: "processing",
    parserStatus: queued[0].parserStatus === "queued" ? "processing" : queued[0].parserStatus,
    error: null,
    lockedAt: new Date().toISOString()
  });
}

function completeInboxRecord(recordId, result) {
  return updateInboxRecordStatus(recordId, {
    status: "completed",
    parserStatus: "completed",
    notionStatus: result && result.notionStatus ? result.notionStatus : "pending",
    memoryStatus: result && result.memoryStatus ? result.memoryStatus : "pending",
    result: result || null,
    error: null,
    completedAt: new Date().toISOString()
  });
}

function failInboxRecord(recordId, errorMessage) {
  return updateInboxRecordStatus(recordId, {
    status: "failed",
    parserStatus: "failed",
    error: errorMessage || "Unknown inbox processing error",
    failedAt: new Date().toISOString()
  });
}

function resetInboxRecord(recordId) {
  return updateInboxRecordStatus(recordId, {
    status: "queued",
    parserStatus: "queued",
    error: null,
    lockedAt: null,
    failedAt: null,
    completedAt: null
  });
}

function updateInboxRecordStatus(recordId, patch) {
  const props = PropertiesService.getScriptProperties();
  const key = ATLAS_INBOX_RECORD_PREFIX + recordId;
  const raw = props.getProperty(key);

  if (!raw) {
    throw new Error("Inbox record not found: " + recordId);
  }

  const record = JSON.parse(raw);
  const updated = Object.assign({}, record, patch, {
    updatedAt: new Date().toISOString()
  });

  props.setProperty(key, JSON.stringify(updated));
  return updated;
}

function getInboxIndex_() {
  const raw = PropertiesService.getScriptProperties().getProperty(ATLAS_INBOX_INDEX_KEY);
  return raw ? JSON.parse(raw) : [];
}

function createAtlasInboxId() {
  return "inbox_" + Utilities.getUuid();
}
function getLatestParsedInboxRecord() {
  const records = getAtlasInboxRecords(50);

  for (let i = 0; i < records.length; i++) {
    if (
      records[i].status === "completed" &&
      records[i].parserStatus === "completed" &&
      records[i].result &&
      records[i].result.parsed
    ) {
      return records[i];
    }
  }

  return null;
}