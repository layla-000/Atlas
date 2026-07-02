const ATLAS_BRIEF_LATEST_KEY = "ATLAS_BRIEF_LATEST";

function generateAtlasBrief() {
  const baseInsights = generateAtlasInsights();
  const travelMemoryInsights = generateTravelMemoryBriefInsights_("trip_turkiye_2026");

  const insights = baseInsights.concat(travelMemoryInsights);
  const now = new Date().toISOString();

  const highPriority = insights.filter(function(item) {
    return item.priority === "high";
  });

  const mediumPriority = insights.filter(function(item) {
    return item.priority === "medium";
  });

  const title = buildBriefTitle_(highPriority, mediumPriority);
  const summary = buildBriefSummary_(insights);

  const brief = {
    id: "brief_" + Utilities.getUuid(),
    generatedAt: now,
    title: title,
    summary: summary,
    priority: highPriority.length > 0 ? "high" : mediumPriority.length > 0 ? "medium" : "normal",
    insights: insights,
    actions: insights.map(function(item) {
      return item.action;
    }).filter(function(action) {
      return !!action;
    }).slice(0, 5),
    status: "ready"
  };

  saveAtlasBrief_(brief);
  return brief;
}

function getLatestAtlasBrief() {
  const raw = PropertiesService.getScriptProperties().getProperty(ATLAS_BRIEF_LATEST_KEY);

  if (!raw) {
    return generateAtlasBrief();
  }

  return JSON.parse(raw);
}

function saveAtlasBrief_(brief) {
  PropertiesService.getScriptProperties().setProperty(
    ATLAS_BRIEF_LATEST_KEY,
    JSON.stringify(brief)
  );
}

function buildBriefTitle_(highPriority, mediumPriority) {
  if (highPriority.length > 0) {
    return "확인할 여행 이슈가 있어요.";
  }

  if (mediumPriority.length > 0) {
    return "여행 준비 상태를 점검해 볼게요.";
  }

  return "좋은 아침이에요.";
}

function buildBriefSummary_(insights) {
  if (!insights || insights.length === 0) {
    return "아직 생성된 브리핑이 없어요.";
  }

  const travelInsights = insights.filter(function(item) {
    return item.id && String(item.id).indexOf("insight_travel_memory_") === 0;
  });

  const selected = travelInsights.length > 0
    ? travelInsights.slice(0, 3)
    : insights.slice(0, 3);

  return selected
    .map(function(item) {
      return item.message;
    })
    .join(" ");
}
function generateTravelMemoryBriefInsights_(tripId) {
  const memory = getAtlasTravelMemoryForDashboard(tripId || "trip_turkiye_2026", 10);
  const items = memory && memory.items ? memory.items : [];
  const seen = {};

  return items.map(function(item) {
    const sourceDocument = item.sourceDocument || {};
    const key = [
      sourceDocument.inboxId || "",
      item.objectType || "",
      item.lowQuality ? "low_quality" : "normal"
    ].join("__");

    if (seen[key]) {
      return null;
    }

    seen[key] = true;
    return buildTravelMemoryInsight_(item);
  }).filter(function(insight) {
    return insight !== null;
  }).slice(0, 5);
}

function buildTravelMemoryInsight_(item) {
  if (!item || !item.objectType) {
    return null;
  }

  const object = item.object || {};
  const sourceDocument = item.sourceDocument || {};
  const lowQuality = item.lowQuality === true;

  if (lowQuality) {
    return {
      id: "insight_travel_memory_" + item.id,
      type: "document_quality",
      priority: "medium",
      message: sourceDocument.fileName + " 문서는 읽기 품질이 낮아 OCR 보강이 필요해요.",
      action: "데스크탑 OCR 처리 대상으로 표시해 두세요."
    };
  }

  if (item.objectType === "hotel_booking") {
    return {
      id: "insight_travel_memory_" + item.id,
      type: "hotel_booking",
      priority: "normal",
      message: buildHotelBriefMessage_(object),
      action: ""
    };
  }

  if (item.objectType === "flight_booking") {
    return {
      id: "insight_travel_memory_" + item.id,
      type: "flight_booking",
      priority: "normal",
      message: buildFlightBriefMessage_(object),
      action: ""
    };
  }

  if (item.objectType === "tour_booking") {
    return {
      id: "insight_travel_memory_" + item.id,
      type: "tour_booking",
      priority: "normal",
      message: buildTourBriefMessage_(object),
      action: ""
    };
  }

  if (item.objectType === "train_ticket" || item.objectType === "bus_ticket") {
    return {
      id: "insight_travel_memory_" + item.id,
      type: item.objectType,
      priority: "normal",
      message: buildTransportBriefMessage_(object),
      action: ""
    };
  }

  return null;
}

function buildHotelBriefMessage_(object) {
  const name = object.hotelName || object.name || "숙소 예약";
  const dates = [object.checkIn, object.checkOut].filter(Boolean).join("~");

  if (dates) {
    return name + " 숙박 정보가 Atlas Memory에 반영되었어요. (" + dates + ")";
  }

  return name + " 숙소 문서가 Atlas Memory에 반영되었어요.";
}

function buildFlightBriefMessage_(object) {
  const airline = object.airline || "항공권";
  const route = [object.departurePlace, object.arrivalPlace].filter(Boolean).join(" → ");

  if (route) {
    return airline + " " + route + " 항공 정보가 Atlas Memory에 반영되었어요.";
  }

  return airline + " 항공권 문서가 Atlas Memory에 반영되었어요.";
}

function buildTourBriefMessage_(object) {
  const name = object.tourName || object.name || "투어 예약";

  if (object.date) {
    return name + " 투어 정보가 Atlas Memory에 반영되었어요. (" + object.date + ")";
  }

  return name + " 투어 문서가 Atlas Memory에 반영되었어요.";
}

function buildTransportBriefMessage_(object) {
  const route = [object.departurePlace, object.arrivalPlace].filter(Boolean).join(" → ");
  const name = object.provider || object.routeName || object.name || "교통 티켓";

  if (route) {
    return name + " " + route + " 이동 정보가 Atlas Memory에 반영되었어요.";
  }

  return name + " 교통 문서가 Atlas Memory에 반영되었어요.";
}
function testGenerateAtlasBrief() {
  const brief = generateAtlasBrief();
  console.log(JSON.stringify(brief, null, 2));
  return brief;
}