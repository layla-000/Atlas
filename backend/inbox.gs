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