function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const result = handleAtlasUpload(payload);

    return createJsonResponse({
      success: true,
      message: result.message,
      fileUrl: result.fileUrl,
      fileId: result.fileId,
      inboxId: result.inboxId,
      inboxStatus: result.inboxStatus,
      parserStatus: result.parserStatus,
      notionStatus: result.notionStatus,
      memoryStatus: result.memoryStatus
    });
  } catch (error) {
    return createJsonResponse({
      success: false,
      message: error.message
    });
  }
}

function doGet(e) {
  const action = e && e.parameter ? e.parameter.action : null;

  const routes = {
    brief: function() {
      return { success: true, brief: getLatestAtlasBrief() };
    },
    status: function() {
      return { success: true, status: generateTravelStatus() };
    },
    memory: function() {
      return { success: true, records: getAtlasMemorySnapshots(20) };
    },
    inbox: function() {
      return { success: true, records: getAtlasInboxRecords(20) };
    },
    queue: function() {
      return { success: true, records: getQueuedInboxRecords(20) };
    }
  };

  if (action && routes[action]) {
    return createJsonResponse(routes[action]());
  }
if (action === "travel_memory") {
  const tripId = e && e.parameter && e.parameter.tripId
    ? e.parameter.tripId
    : "trip_turkiye_2026";
if (action === "run_batch") {
  const limit = e && e.parameter && e.parameter.limit
    ? Number(e.parameter.limit)
    : 5;

  return jsonResponse_(runAtlasPipelineBatch(limit));
}
  const limit = e && e.parameter && e.parameter.limit
    ? Number(e.parameter.limit)
    : 10;

  return jsonResponse_(getAtlasTravelMemoryForDashboard(tripId, limit));
}
  return createJsonResponse({
    success: true,
    message: "Atlas backend is running."
  });
}

function createJsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonResponse_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data, null, 2))
    .setMimeType(ContentService.MimeType.JSON);
}