function doPost(e) {
  try {
    const action = e && e.parameter ? e.parameter.action : "";
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");

    if (action === "save_manual_map_place") {
      return createJsonResponse(saveAtlasManualMapPlace(body));
    }

    if (action === "remove_manual_map_place") {
      return createJsonResponse(removeAtlasManualMapPlace(body));
    }
if (body.action === "get_full_schedule") {
  return createJsonResponse({
    success: true,
    ok: true,
    schedule: getFullScheduleFromAtlasMemory_(body.payload || {})
  });
}
    if (body.action === "create_schedule") {
      return createJsonResponse(handleAtlasScheduleCreate(body.payload));
    }

    const uploadResult = handleAtlasUpload(body);
    const pipelineResult = runAtlasUploadPipelineAfterUpload_(uploadResult);

    return createJsonResponse({
      success: true,
      ok: true,
      message: uploadResult.message,
      fileUrl: uploadResult.fileUrl,
      fileId: uploadResult.fileId,
      inboxId: uploadResult.inboxId,
      pipeline: pipelineResult
    });

  } catch (error) {
    return createJsonResponse({
      success: false,
      ok: false,
      error: error && error.message ? error.message : String(error),
      stack: error && error.stack ? error.stack : ""
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
    },
    map_places: function() {
  const tripId = e && e.parameter && e.parameter.tripId
    ? e.parameter.tripId
    : "trip_turkiye_2026";
if (action === "map_places") {
  return jsonOutput_(getAtlasMapPlacesForTrip(getTripIdFromRequest_(e)));
}

if (action === "manual_map_places") {
  return jsonOutput_(getAtlasManualMapPlaces(getTripIdFromRequest_(e)));
}
  return {
    success: true,
    places: getAtlasMapPlacesForTrip(tripId)
  };
},
    travel_memory: function() {
      const tripId = e && e.parameter && e.parameter.tripId
        ? e.parameter.tripId
        : "trip_turkiye_2026";

      const limit = e && e.parameter && e.parameter.limit
        ? Number(e.parameter.limit)
        : 10;

      return getAtlasTravelMemoryForDashboard(tripId, limit);
    },
    run_batch: function() {
      const limit = e && e.parameter && e.parameter.limit
        ? Number(e.parameter.limit)
        : 5;

      return runAtlasPipelineBatch(limit);
    },
    pipeline: function() {
  return {
    success: true,
    pipeline: runAtlasUploadPipelineAfterUpload_({
      manual: true,
      source: "doGet.pipeline"
    })
  };
}
  };

  if (action && routes[action]) {
    return createJsonResponse(routes[action]());
  }

  return createJsonResponse({
    success: true,
    message: "Atlas backend is running."
  });
}
function createAtlasJsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
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
function runAtlasUploadPipelineAfterUpload_(uploadResult) {
  const result = {
    success: true,
    upload: uploadResult || null,
    parserStatus: "skipped",
    semanticStatus: "skipped",
    memoryStatus: "skipped",
    notionStatus: "skipped",
    briefStatus: "skipped",
    steps: []
  };

  try {
    const parserResult = runAtlasParserOnce();
    result.steps.push({
      step: "parser",
      result: parserResult
    });

    result.parserStatus = parserResult && parserResult.success ? "completed" : "failed";
  } catch (error) {
    result.success = false;
    result.parserStatus = "failed";
    result.steps.push({
      step: "parser",
      error: error.message
    });
  }

  try {
    const semanticResult = runAtlasSemanticOnce();
    result.steps.push({
      step: "semantic",
      result: semanticResult
    });

    result.semanticStatus = semanticResult && semanticResult.success ? "completed" : "failed";

    if (semanticResult && semanticResult.record) {
      result.memoryStatus = semanticResult.record.memoryStatus || result.memoryStatus;
      result.notionStatus = semanticResult.record.notionStatus || result.notionStatus;
    }
  } catch (error) {
    result.success = false;
    result.semanticStatus = "failed";
    result.steps.push({
      step: "semantic",
      error: error.message
    });
  }

  try {
    const brief = generateAtlasBrief();
    result.steps.push({
      step: "brief",
      result: {
        id: brief.id,
        generatedAt: brief.generatedAt,
        status: brief.status,
        priority: brief.priority
      }
    });

    result.briefStatus = "completed";
  } catch (error) {
    result.success = false;
    result.briefStatus = "failed";
    result.steps.push({
      step: "brief",
      error: error.message
    });
  }
  try {
    const folderCopyResult = copyUploadedFileToQuickFolder_(uploadResult, result);

    result.steps.push({
      step: "folder_copy",
      result: folderCopyResult
    });

    result.folderCopyStatus = folderCopyResult.success ? "completed" : "skipped";
  } catch (error) {
    result.success = false;
    result.folderCopyStatus = "failed";
    result.steps.push({
      step: "folder_copy",
      error: error.message
    });
  }
  return result;
}
function copyUploadedFileToQuickFolder_(uploadResult, pipelineResult) {
  if (!uploadResult || !uploadResult.fileId) {
    return {
      success: false,
      message: "fileId가 없어 폴더 복사를 건너뛰었어요."
    };
  }

  const record = findAtlasInboxRecordById_(uploadResult.inboxId);
  const documentType = classifyUploadedDocumentForFolder_(uploadResult, record, pipelineResult);
  const folderUrl = getQuickFolderUrlByDocumentType_(documentType);

  if (!folderUrl) {
    return {
      success: false,
      documentType: documentType,
      message: "대상 폴더 URL이 없어 복사를 건너뛰었어요."
    };
  }

  const folderId = extractDriveFolderId_(folderUrl);
  if (!folderId) {
    return {
      success: false,
      documentType: documentType,
      folderUrl: folderUrl,
      message: "Drive 폴더 ID를 찾지 못했어요."
    };
  }

  const sourceFile = DriveApp.getFileById(uploadResult.fileId);
  const targetFolder = DriveApp.getFolderById(folderId);

  const copiedFile = sourceFile.makeCopy(sourceFile.getName(), targetFolder);

  return {
    success: true,
    documentType: documentType,
    targetFolderId: folderId,
    copiedFileId: copiedFile.getId(),
    copiedFileUrl: copiedFile.getUrl()
  };
}

function classifyUploadedDocumentForFolder_(uploadResult, record, pipelineResult) {
  const fileName = String(
    uploadResult.fileName ||
    (record && record.fileName) ||
    ""
  ).toLowerCase();

  const parsedType =
    getNestedValue_(record, ["result", "parsed", "documentType"]) ||
    getNestedValue_(record, ["result", "documentType"]) ||
    getNestedValue_(record, ["parsed", "documentType"]) ||
    getNestedValue_(pipelineResult, ["documentType"]) ||
    "";

  const type = String(parsedType || "").toLowerCase();

  if (
    type.indexOf("flight") >= 0 ||
    fileName.indexOf("항공") >= 0 ||
    fileName.indexOf("flight") >= 0 ||
    fileName.indexOf("airline") >= 0 ||
    fileName.indexOf("boarding") >= 0 ||
    fileName.indexOf("ticket") >= 0
  ) {
    return "flight";
  }

  if (
    type.indexOf("hotel") >= 0 ||
    type.indexOf("accommodation") >= 0 ||
    fileName.indexOf("hotel") >= 0 ||
    fileName.indexOf("숙소") >= 0 ||
    fileName.indexOf("호텔") >= 0 ||
    fileName.indexOf("booking") >= 0
  ) {
    return "hotel";
  }

  return "documents";
}

function getQuickFolderUrlByDocumentType_(documentType) {
  const props = PropertiesService.getScriptProperties();

  if (documentType === "flight") {
    return props.getProperty("ATLAS_DRIVE_BOARDING_PASS_URL") || "";
  }

  if (documentType === "hotel") {
    return props.getProperty("ATLAS_DRIVE_HOTEL_URL") || "";
  }

  return props.getProperty("ATLAS_DRIVE_DOCUMENTS_URL") || "";
}

function extractDriveFolderId_(url) {
  const text = String(url || "");

  const match = text.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (match) {
    return match[1];
  }

  return "";
}

function findAtlasInboxRecordById_(inboxId) {
  if (!inboxId) {
    return null;
  }

  const records = getAtlasInboxRecords(50) || [];

  for (var i = 0; i < records.length; i++) {
    if (records[i] && records[i].id === inboxId) {
      return records[i];
    }
  }

  return null;
}

function getNestedValue_(object, path) {
  let current = object;

  for (var i = 0; i < path.length; i++) {
    if (!current || typeof current !== "object") {
      return "";
    }

    current = current[path[i]];
  }

  return current || "";
}
function getFullScheduleFromAtlasMemory_(payload) {
  payload = payload || {};

  const tripId = payload.tripId || "trip_turkiye_2026";
  const startDate = payload.startDate || "2026-09-23";
  const endDate = payload.endDate || "2026-10-02";

  const memoryResult = getAtlasTravelMemoryForDashboard(tripId, 200);

  const records =
    memoryResult.records ||
    memoryResult.memory ||
    memoryResult.items ||
    memoryResult.data ||
    [];

  return records
    .map(function(record) {
      const startAt =
        record.startAt ||
        record.start_at ||
        record.departureTime ||
        record.departure_time ||
        record.checkIn ||
        record.check_in ||
        record.date ||
        "";

      const endAt =
        record.endAt ||
        record.end_at ||
        record.arrivalTime ||
        record.arrival_time ||
        record.checkOut ||
        record.check_out ||
        "";

      const date =
        record.date ||
        String(startAt).slice(0, 10);

      return {
        id: record.id || record.memoryId || record.objectId || "",
        tripId: record.tripId || record.trip_id || tripId,
        date: date,
        startAt: startAt,
        endAt: endAt,
        title: record.title || record.name || record.label || "일정",
        location:
          record.location ||
          record.place ||
          record.address ||
          record.departurePlace ||
          record.departure_place ||
          record.arrivalPlace ||
          record.arrival_place ||
          "",
        scheduleType:
          record.scheduleType ||
          record.schedule_type ||
          record.type ||
          record.category ||
          "etc",
        notes: record.notes || record.memo || record.description || "",
        route:
          record.route ||
          buildAtlasScheduleRoute_(record) ||
          ""
      };
    })
    .filter(function(item) {
      return item.date >= startDate && item.date <= endDate;
    })
    .sort(function(a, b) {
      const aKey = String(a.startAt || a.date || "");
      const bKey = String(b.startAt || b.date || "");
      return aKey.localeCompare(bKey);
    });
}

function buildAtlasScheduleRoute_(record) {
  const departure =
    record.departurePlace ||
    record.departure_place ||
    record.departure ||
    "";

  const arrival =
    record.arrivalPlace ||
    record.arrival_place ||
    record.arrival ||
    "";

  if (departure && arrival) {
    return departure + " → " + arrival;
  }

  return "";
}