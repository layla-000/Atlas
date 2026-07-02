const ATLAS_BRIEF_LATEST_KEY = "ATLAS_BRIEF_LATEST";

function generateAtlasBrief() {
  const tripId = "trip_turkiye_2026";

  const baseInsights = generateAtlasInsights();
  const travelMemoryInsights = generateTravelMemoryBriefInsights_(tripId);
  const insights = baseInsights.concat(travelMemoryInsights);
  const now = new Date().toISOString();

  const highPriority = insights.filter(function(item) {
    return item.priority === "high";
  });

  const mediumPriority = insights.filter(function(item) {
    return item.priority === "medium";
  });

  let brief = {
    id: "brief_" + Utilities.getUuid(),
    generatedAt: now,
    title: buildBriefTitle_(highPriority, mediumPriority),
    summary: buildBriefSummary_(insights),
    priority: highPriority.length > 0 ? "high" : mediumPriority.length > 0 ? "medium" : "normal",
    insights: insights,
    actions: insights.map(function(item) {
      return item.action;
    }).filter(function(action) {
      return !!action;
    }).slice(0, 5),
    status: "ready"
  };

  const memory = getBriefDashboardMemory_(tripId, 20);
  brief = enrichBriefForDashboardPracticality_(brief, memory);

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

function getBriefDashboardMemory_(tripId, limit) {
  try {
    const raw = getAtlasTravelMemoryForDashboard(tripId, limit || 20);

    if (typeof normalizeTravelMemoryForDashboard_ === "function") {
      return normalizeTravelMemoryForDashboard_(raw);
    }

    return raw || { tripId: tripId, entities: [] };
  } catch (error) {
    console.warn("getBriefDashboardMemory_ failed:", error);
    return {
      tripId: tripId,
      generatedAt: new Date().toISOString(),
      entities: []
    };
  }
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

  return selected.map(function(item) {
    return item.message;
  }).join(" ");
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

  if (
    item.objectType === "train_ticket" ||
    item.objectType === "train_booking" ||
    item.objectType === "bus_ticket" ||
    item.objectType === "bus_booking"
  ) {
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
  const route = [object.departurePlace || object.departureAirport, object.arrivalPlace || object.arrivalAirport]
    .filter(Boolean)
    .join(" → ");

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
  const route = [object.departurePlace || object.departureStation, object.arrivalPlace || object.arrivalStation]
    .filter(Boolean)
    .join(" → ");
  const name = object.provider || object.operator || object.routeName || object.name || "교통 티켓";

  if (route) {
    return name + " " + route + " 이동 정보가 Atlas Memory에 반영되었어요.";
  }

  return name + " 교통 문서가 Atlas Memory에 반영되었어요.";
}

function enrichBriefForDashboardPracticality_(brief, memory) {
  brief = brief || {};

  brief.today_plan = buildTodayPlanFromMemory_(memory);
  brief.time_card = buildAtlasTimeCard_(memory);
  brief.next_transport = buildNextTransportFromMemory_(memory);
  brief.quick_links = getAtlasQuickLinks();
  brief.drive_links = brief.quick_links;

  return brief;
}

function buildTodayPlanFromMemory_(memory) {
  if (!memory || !memory.entities || !memory.entities.length) {
    return [emptyTodayPlanItem_()];
  }

  const todayKey = getAtlasTodayKey_("Europe/Istanbul");
  const items = [];

  memory.entities.forEach(function(entity) {
    const normalized = normalizeAtlasEntity_(entity);
    if (!normalized) return;

    if (normalized.type === "hotel_booking") {
      extractTodayHotelPlanItems_(normalized, todayKey).forEach(function(item) {
        items.push(item);
      });
      return;
    }

    if (isTransportEntityType_(normalized.type)) {
      const transportItem = extractTodayTransportPlanItem_(normalized, todayKey);
      if (transportItem) {
        items.push(transportItem);
      }
    }
  });

  if (!items.length) {
    return [emptyTodayPlanItem_()];
  }

  items.sort(comparePlanItems_);
  return items.slice(0, 5);
}

function emptyTodayPlanItem_() {
  return {
    type: "empty",
    label: "오늘의 계획",
    title: "오늘 표시할 확정 일정이 아직 없어요.",
    time: "",
    location: ""
  };
}

function extractTodayHotelPlanItems_(entity, todayKey) {
  const props = entity.properties || {};
  const title = entity.title || props.hotel_name || props.name || "Hotel";
  const city = props.city || props.location || props.destination || props.address || "";

  const checkinDate = toDateKey_(props.check_in || props.checkin_date || props.start_date);
  const checkoutDate = toDateKey_(props.check_out || props.checkout_date || props.end_date);

  const results = [];

  if (checkinDate && checkinDate === todayKey) {
    const time = normalizeTimeText_(props.check_in_time || props.checkin_time || "15:00");

    results.push({
      type: "hotel_checkin",
      label: "오늘 체크인",
      title: title,
      time: time,
      location: city,
      sortKey: buildSortKey_(checkinDate, time)
    });
  }

  if (checkoutDate && checkoutDate === todayKey) {
    const time = normalizeTimeText_(props.check_out_time || props.checkout_time || "11:00");

    results.push({
      type: "hotel_checkout",
      label: "오늘 체크아웃",
      title: title,
      time: time,
      location: city,
      sortKey: buildSortKey_(checkoutDate, time)
    });
  }

  return results;
}

function extractTodayTransportPlanItem_(entity, todayKey) {
  const props = entity.properties || {};

  const departureDate =
    toDateKey_(props.departure_date) ||
    toDateKey_(props.date) ||
    toDateKey_(props.travel_date) ||
    toDateKey_(props.start_date);

  if (!departureDate || departureDate !== todayKey) {
    return null;
  }

  const transportType = mapTransportType_(entity.type);
  const operator = props.operator || props.airline || props.railway || props.company || "";
  const number = props.flight_number || props.train_number || props.bus_number || props.reference || "";
  const departurePlace = props.departure_place || props.from || props.origin || props.departure_station || props.departure_airport || "";
  const arrivalPlace = props.arrival_place || props.to || props.destination || props.arrival_station || props.arrival_airport || "";
  const departureTime = normalizeTimeText_(props.departure_time || props.time || "");
  const title = buildTransportTitle_(transportType, operator, number, departurePlace, arrivalPlace);

  return {
    type: "transport",
    label: "오늘 이동",
    title: title,
    time: departureTime,
    location: departurePlace,
    sortKey: buildSortKey_(departureDate, departureTime)
  };
}

function buildAtlasTimeCard_(memory) {
  const localTimezone = getAtlasLocalTimezone_(memory);
  const localLabel = getAtlasLocalTimeLabel_(memory);

  return {
    local_label: localLabel,
    local_timezone: localTimezone,
    local_time: Utilities.formatDate(new Date(), localTimezone, "HH:mm"),
    home_label: "한국 시간",
    home_timezone: "Asia/Seoul",
    home_time: Utilities.formatDate(new Date(), "Asia/Seoul", "HH:mm")
  };
}

function getAtlasLocalTimezone_(memory) {
  if (memory && memory.currentTrip && memory.currentTrip.timezone) {
    return memory.currentTrip.timezone;
  }

  if (memory && memory.trip && memory.trip.timezone) {
    return memory.trip.timezone;
  }

  if (memory && memory.timezone) {
    return memory.timezone;
  }

  return "Europe/Istanbul";
}

function getAtlasLocalTimeLabel_(memory) {
  if (memory && memory.currentTrip && memory.currentTrip.localTimeLabel) {
    return memory.currentTrip.localTimeLabel;
  }

  if (memory && memory.trip && memory.trip.localTimeLabel) {
    return memory.trip.localTimeLabel;
  }

  return "튀르키예 시간";
}

function buildNextTransportFromMemory_(memory) {
  if (!memory || !memory.entities || !memory.entities.length) {
    return emptyNextTransport_();
  }

  const now = new Date();
  const candidates = [];

  memory.entities.forEach(function(entity) {
    const normalized = normalizeAtlasEntity_(entity);
    if (!normalized || !isTransportEntityType_(normalized.type)) return;

    const candidate = buildTransportCandidate_(normalized, now);
    if (candidate) {
      candidates.push(candidate);
    }
  });

  if (!candidates.length) {
    return emptyNextTransport_();
  }

  candidates.sort(function(a, b) {
    return a.timestamp - b.timestamp;
  });

  const next = candidates[0];

  return {
    type: next.transport_type,
    label: "다음 이동",
    title: next.title,
    departure_place: next.departure_place,
    departure_time: next.departure_time,
    arrival_place: next.arrival_place,
    arrival_time: next.arrival_time,
    reference: next.reference
  };
}

function buildTransportCandidate_(entity, now) {
  const props = entity.properties || {};

  const departureDate =
    props.departure_date ||
    props.date ||
    props.travel_date ||
    props.start_date ||
    "";

  if (!departureDate) return null;

  const departureTime = normalizeTimeText_(props.departure_time || props.time || "");
  const departureDateTime = buildDashboardDateTime_(departureDate, departureTime);

  if (!departureDateTime || departureDateTime.getTime() < now.getTime()) {
    return null;
  }

  const transportType = mapTransportType_(entity.type);
  const operator = props.operator || props.airline || props.railway || props.company || "";
  const number = props.flight_number || props.train_number || props.bus_number || props.reference || "";
  const departurePlace = props.departure_place || props.from || props.origin || props.departure_station || props.departure_airport || "";
  const arrivalPlace = props.arrival_place || props.to || props.destination || props.arrival_station || props.arrival_airport || "";
  const arrivalTime = normalizeTimeText_(props.arrival_time || "");
  const reference = number || props.reference || "";
  const title = buildTransportTitle_(transportType, operator, number, departurePlace, arrivalPlace);

  return {
    timestamp: departureDateTime.getTime(),
    transport_type: normalizeTransportTypeForCard_(entity.type),
    title: title,
    departure_place: departurePlace,
    departure_time: departureTime,
    arrival_place: arrivalPlace,
    arrival_time: arrivalTime,
    reference: reference
  };
}

function emptyNextTransport_() {
  return {
    type: "none",
    label: "다음 이동",
    title: "예정된 교통편이 아직 없어요.",
    departure_place: "",
    departure_time: "",
    arrival_place: "",
    arrival_time: "",
    reference: ""
  };
}

function getAtlasQuickLinks() {
  const props = PropertiesService.getScriptProperties();

  return {
    boarding_pass: props.getProperty("ATLAS_DRIVE_BOARDING_PASS_URL") || "",
    hotel: props.getProperty("ATLAS_DRIVE_HOTEL_URL") || "",
    documents: props.getProperty("ATLAS_DRIVE_DOCUMENTS_URL") || "",
    packing:
      props.getProperty("ATLAS_PACKING_NOTION_URL") ||
      "https://app.notion.com/p/5e8e3cbee2d64c578ac981e1969a7a81?v=b51c772da87c4309826a8e2d8e90e096"
  };
}

function isTransportEntityType_(type) {
  return [
    "flight_booking",
    "train_booking",
    "train_ticket",
    "bus_booking",
    "bus_ticket",
    "transport_booking",
    "flight",
    "train",
    "bus",
    "transport"
  ].indexOf(type) >= 0;
}

function mapTransportType_(type) {
  if (type === "flight_booking" || type === "flight") return "항공";
  if (type === "train_booking" || type === "train_ticket" || type === "train") return "기차";
  if (type === "bus_booking" || type === "bus_ticket" || type === "bus") return "버스";
  return "이동";
}

function normalizeTransportTypeForCard_(type) {
  if (type === "flight_booking" || type === "flight") return "flight";
  if (type === "train_booking" || type === "train_ticket" || type === "train") return "train";
  if (type === "bus_booking" || type === "bus_ticket" || type === "bus") return "bus";
  return "transport";
}

function buildTransportTitle_(transportType, operator, number, departurePlace, arrivalPlace) {
  const left = [transportType, operator, number].filter(Boolean).join(" ").trim();
  const route = [departurePlace, arrivalPlace].filter(Boolean).join(" → ").trim();

  if (left && route) return left + " · " + route;
  if (left) return left;
  if (route) return route;
  return "예정된 이동";
}

function buildDashboardDateTime_(dateText, timeText) {
  const dateKey = toDateKey_(dateText);
  if (!dateKey) return null;

  const safeTime = normalizeTimeText_(timeText || "23:59") || "23:59";
  const parsed = new Date(dateKey + "T" + safeTime + ":00");

  if (isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function comparePlanItems_(a, b) {
  const aKey = a.sortKey || "9999-99-99 99:99";
  const bKey = b.sortKey || "9999-99-99 99:99";

  if (aKey < bKey) return -1;
  if (aKey > bKey) return 1;
  return 0;
}

function buildSortKey_(dateKey, timeText) {
  return (dateKey || "9999-99-99") + " " + (normalizeTimeText_(timeText || "23:59") || "23:59");
}

function normalizeTimeText_(value) {
  if (!value) return "";

  const text = String(value).trim();

  if (/^\d{1,2}:\d{2}$/.test(text)) {
    const parts = text.split(":");
    return pad2_(parts[0]) + ":" + parts[1];
  }

  const parsed = new Date(text);
  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, "Europe/Istanbul", "HH:mm");
  }

  return text;
}

function toDateKey_(value) {
  if (!value) return "";

  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, "Europe/Istanbul", "yyyy-MM-dd");
  }

  const text = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  const isoMatch = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) {
    return isoMatch[1];
  }

  const slashMatch = text.match(/^(\d{4})[./](\d{1,2})[./](\d{1,2})/);
  if (slashMatch) {
    return slashMatch[1] + "-" + pad2_(slashMatch[2]) + "-" + pad2_(slashMatch[3]);
  }

  const parsed = new Date(text);
  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, "Europe/Istanbul", "yyyy-MM-dd");
  }

  return "";
}

function getAtlasTodayKey_(timezone) {
  return Utilities.formatDate(new Date(), timezone || "Europe/Istanbul", "yyyy-MM-dd");
}

function normalizeAtlasEntity_(entity) {
  if (!entity) return null;

  const type = entity.type || entity.entityType || "";
  const properties = entity.properties || entity.data || {};
  const title =
    entity.title ||
    entity.name ||
    properties.title ||
    properties.name ||
    properties.hotel_name ||
    properties.hotelName ||
    "";

  return {
    type: type,
    title: title,
    properties: properties
  };
}

function pad2_(value) {
  return String(value).padStart(2, "0");
}