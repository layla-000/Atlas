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

function createJsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
function doGet(e) {
  const action = e && e.parameter ? e.parameter.action : null;

  if (action === "inbox") {
    return createJsonResponse({
      success: true,
      records: getAtlasInboxRecords(20)
    });
  }

  if (action === "queue") {
    return createJsonResponse({
      success: true,
      records: getQueuedInboxRecords(20)
    });
  }

  return createJsonResponse({
    success: true,
    message: "Atlas backend is running."
  });
}
function testRunParserOnce() {
  return runAtlasParserOnce();
}
function testRunSemanticOnce() {
  return runAtlasSemanticOnce();
}