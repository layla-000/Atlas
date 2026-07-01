function handleAtlasUpload(payload) {
  validateUploadPayload(payload);

  const trip = ATLAS_CONFIG.trips[payload.tripId];

if (!trip) {
  throw new Error("Unknown tripId: " + payload.tripId);
}

  const targetFolderId = getTargetFolderId(trip, payload.type);

  const savedFile = saveBase64FileToDrive({
    folderId: targetFolderId,
    fileName: payload.fileName,
    mimeType: payload.mimeType,
    contentBase64: payload.contentBase64
  });

  return {
    fileId: savedFile.getId(),
    fileUrl: savedFile.getUrl(),
    message: buildUploadMessage(payload, savedFile)
  };
}

function validateUploadPayload(payload) {
  if (!payload) {
    throw new Error("Missing payload.");
  }

if (!payload.tripId) {
  throw new Error("Missing tripId.");
}

  if (!payload.type) {
    throw new Error("Missing upload type.");
  }

  if (!payload.fileName) {
    throw new Error("Missing file name.");
  }

  if (!payload.contentBase64) {
    throw new Error("Missing file content.");
  }
}

function getTargetFolderId(trip, type) {
  if (type === "receipt") {
    return trip.receiptFolderId;
  }

  return trip.documentFolderId;
}

function buildUploadMessage(payload, file) {
  if (payload.type === "receipt") {
    return payload.fileName + " 영수증을 Atlas Vault에 저장했어요. Budget 처리 대기열에 추가할 준비가 되었습니다.";
  }

  return payload.fileName + " 문서를 Atlas Vault에 저장했어요. Notion 기록과 Parser 처리로 이어질 준비가 되었습니다.";
}