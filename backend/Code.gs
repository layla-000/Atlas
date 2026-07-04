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
  const schedule = getFullScheduleFromAtlasMemory_(body.payload || {});

  return createJsonResponse({
    success: true,
    ok: true,
    count: schedule.length,
    schedule: schedule
  });
}
    if (body.action === "create_schedule") {
      return createJsonResponse(handleAtlasScheduleCreate(body.payload));
    }

    if (body.action === "weather") {
  return createJsonResponse(getAtlasCurrentWeather_(body.payload || {}));
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

  const memoryResult = getAtlasTravelMemoryForDashboard(tripId, 500);
  const records = memoryResult.items || [];

  return records
    .map(function(record) {
      const data = record.object || record.data || record.payload || record.details || record;
      const objectType = String(record.objectType || data.type || "").toLowerCase();

      const rawStart =
        data.departureTime ||
        data.checkIn ||
        data.startAt ||
        data.date ||
        "";

      const rawEnd =
        data.arrivalTime ||
        data.checkOut ||
        data.endAt ||
        "";

      const startAt = normalizeAtlasDate_(rawStart);
      const endAt = normalizeAtlasDate_(rawEnd);
      const date = String(startAt || startDate).slice(0, 10);

      return {
        id: record.id || data.id || "",
        tripId: record.tripId || data.tripId || tripId,
        date: date,
        startAt: startAt,
        endAt: endAt,
        title:
          data.flightNumber ||
          data.hotelName ||
          data.name ||
          "일정",
        location:
          data.address ||
          data.departurePlace ||
          data.arrivalPlace ||
          data.hotelName ||
          "",
        scheduleType: normalizeAtlasScheduleType_(objectType),
        notes: data.roomType || data.notes || data.memo || "",
        route: buildAtlasScheduleRoute_(data)
      };
    })
    .filter(function(item) {
      return item.date && item.date >= startDate && item.date <= endDate;
    })
    .sort(function(a, b) {
      return String(a.startAt || a.date).localeCompare(String(b.startAt || b.date));
    });
}

function normalizeAtlasDate_(value) {
  if (!value) return "";

  const text = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    return text;
  }

  const parsed = new Date(text);
  if (isNaN(parsed.getTime())) return "";

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");

  return year + "-" + month + "-" + day;
}

function normalizeAtlasScheduleType_(objectType) {
  if (objectType.indexOf("flight") >= 0) return "flight";
  if (objectType.indexOf("hotel") >= 0) return "hotel";
  if (objectType.indexOf("train") >= 0) return "train";
  if (objectType.indexOf("bus") >= 0) return "bus";
  if (objectType.indexOf("restaurant") >= 0 || objectType.indexOf("food") >= 0) return "food";
  if (objectType.indexOf("activity") >= 0) return "activity";
  return "etc";
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
function resetAtlasMemoryOnly_(tripId) {
  const targetTripId = tripId || "trip_turkiye_2026";
  const props = PropertiesService.getScriptProperties();
  const allProps = props.getProperties();

  const deletedKeys = [];

  Object.keys(allProps).forEach(function(key) {
    if (
      key === ATLAS_MEMORY_INDEX_KEY ||
      key.indexOf(ATLAS_MEMORY_RECORD_PREFIX) === 0 ||
      key === "ATLAS_TRAVEL_MEMORY_PATCHES__" + targetTripId ||
  key.indexOf("ATLAS_BRIEF") === 0 ||
  key.indexOf("ATLAS_DAILY_BRIEF") === 0 ||
  key.indexOf("ATLAS_TRAVEL_STATUS") === 0
    ) {
      props.deleteProperty(key);
      deletedKeys.push(key);
    }
  });

  return {
    success: true,
    ok: true,
    resetType: "memory_only",
    tripId: targetTripId,
    deletedCount: deletedKeys.length,
    deletedKeys: deletedKeys,
    message: "Atlas Memory Snapshot과 Travel Memory Patch만 삭제했어요. Parser, Inbox, 업로드 파일, 파이프라인 구조는 그대로 유지돼요."
  };
}
function testResetAtlasMemoryOnly() {
  const result = resetAtlasMemoryOnly_("trip_turkiye_2026");
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
function getAtlasCurrentWeather_(payload) {
  payload = payload || {};

  const lat = Number(payload.lat);
  const lng = Number(payload.lng);
  const region = payload.region || "현재 지역";
  const apiKey = PropertiesService.getScriptProperties().getProperty("ATLAS_OPENWEATHER_API_KEY") || "";

  if (!isFinite(lat) || !isFinite(lng)) {
    return {
      success: true,
      ok: true,
      weather: {
        label: region + " 날씨",
        value: "확인 대기"
      }
    };
  }

  if (!apiKey) {
    return {
      success: true,
      ok: true,
      weather: {
        label: region + " 날씨",
        value: "날씨 API 키 없음"
      }
    };
  }

  try {
    const url =
      "https://api.openweathermap.org/data/2.5/weather" +
      "?lat=" + encodeURIComponent(lat) +
      "&lon=" + encodeURIComponent(lng) +
      "&appid=" + encodeURIComponent(apiKey) +
      "&units=metric" +
      "&lang=kr";

    const response = UrlFetchApp.fetch(url, {
      method: "get",
      muteHttpExceptions: true,
      followRedirects: true
    });

    const statusCode = response.getResponseCode();
    const text = response.getContentText();

    if (statusCode < 200 || statusCode >= 300) {
      throw new Error("OpenWeather status " + statusCode + ": " + text);
    }

    const data = JSON.parse(text);
    const temperature = data && data.main ? data.main.temp : null;
    const weatherText =
      data &&
      data.weather &&
      data.weather[0] &&
      data.weather[0].description
        ? data.weather[0].description
        : "";

    const cityName = (data && data.name) ? data.name : region;

    if (temperature === null || temperature === undefined) {
      throw new Error("OpenWeather 응답에 temp가 없어요.");
    }

    return {
      success: true,
      ok: true,
      weather: {
        label: cityName + " 날씨",
        value: Math.round(Number(temperature)) + "°C" + (weatherText ? " · " + weatherText : "")
      }
    };
  } catch (error) {
    return {
      success: true,
      ok: true,
      weather: getAtlasFallbackWeather_(region, lat, lng, error)
    };
  }
}

function getAtlasFallbackWeather_(region, lat, lng, error) {
  const name = String(region || "현재 지역");

  return {
    label: name + " 날씨",
    value: "날씨 정보 연결 실패"
  };
}
function getAtlasFallbackWeather_(region, lat, lng, error) {
  const name = String(region || "현재 지역");

  if (
    name.indexOf("Seoul") >= 0 ||
    name.indexOf("서울") >= 0 ||
    Math.abs(Number(lat) - 37.5665) < 0.2
  ) {
    return {
      label: "Seoul 날씨",
      value: "확인 대기 · 서울"
    };
  }

  if (
    name.indexOf("Istanbul") >= 0 ||
    name.indexOf("이스탄불") >= 0 ||
    Math.abs(Number(lat) - 41.0082) < 0.3
  ) {
    return {
      label: "Istanbul 날씨",
      value: "확인 대기 · 이스탄불"
    };
  }

  if (
    name.indexOf("Göreme") >= 0 ||
    name.indexOf("Goreme") >= 0 ||
    name.indexOf("괴레메") >= 0 ||
    Math.abs(Number(lat) - 38.6431) < 0.3
  ) {
    return {
      label: "Göreme 날씨",
      value: "확인 대기 · 괴레메"
    };
  }

  return {
    label: name + " 날씨",
    value: "확인 대기"
  };
}