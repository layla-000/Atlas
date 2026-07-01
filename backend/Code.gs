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