function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const result = handleAtlasUpload(payload);

    return createJsonResponse({
      success: true,
      message: result.message,
      fileUrl: result.fileUrl,
      fileId: result.fileId
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