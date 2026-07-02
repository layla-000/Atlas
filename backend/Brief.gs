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

  const title = buildBriefTitle_(highPriority, mediumPriority);
  const summary = buildBriefSummary_(insights);

  let brief = {
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

  const memory = buildBriefPracticalMemoryFromInsights_(tripId, insights);

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
function enrichBriefForDashboardPracticality_(brief, memory) {
  brief = brief || {};
  memory = memory || {};

  brief.today_plan = getAtlasTodayPlan_(memory);
  brief.time_card = getAtlasTimeCard_(memory);
  brief.next_transport = getAtlasNextTransport_(memory);
  brief.quick_links = getAtlasQuickLinks_();

  // 구버전 프론트 호환용. 나중에 완전히 안정되면 제거 가능.
  brief.drive_links = brief.quick_links;

  return brief;
}
function getAtlasTodayPlan_(memory) {
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  var items = [];

  var objects = getAtlasMemoryObjects_(memory);

  objects.forEach(function (obj) {
    var type = String(obj.objectType || obj.type || "").toLowerCase();

    var checkIn = normalizeAtlasDate_(obj.checkIn || obj.check_in);
    var checkOut = normalizeAtlasDate_(obj.checkOut || obj.check_out);
    var startDate = normalizeAtlasDate_(obj.startDate || obj.start_date || obj.date);
    var departureDate = normalizeAtlasDate_(obj.departureDate || obj.departure_date);

    if (checkIn === today) {
      items.push({
        type: "hotel_checkin",
        label: "오늘 체크인",
        title: obj.hotelName || obj.name || "숙소 체크인",
        time: obj.checkInTime || "",
        location: obj.address || obj.location || ""
      });
    }

    if (checkOut === today) {
      items.push({
        type: "hotel_checkout",
        label: "오늘 체크아웃",
        title: obj.hotelName || obj.name || "숙소 체크아웃",
        time: obj.checkOutTime || "",
        location: obj.address || obj.location || ""
      });
    }

    if (departureDate === today || startDate === today) {
      if (type.indexOf("flight") >= 0 || type.indexOf("train") >= 0 || type.indexOf("bus") >= 0 || type.indexOf("transport") >= 0) {
        items.push({
          type: "transport",
          label: "오늘 이동",
          title: buildAtlasTransportTitle_(obj),
          time: obj.departureTime || obj.time || "",
        location:
  obj.departurePlace ||
  obj.departureAirport ||
  obj.departureStation ||
  obj.station ||
  ""
        });
      } else {
        items.push({
          type: "schedule",
          label: "오늘 일정",
          title: obj.title || obj.name || "오늘 일정",
          time: obj.time || obj.startTime || "",
          location: obj.location || ""
        });
      }
    }
  });

  if (items.length === 0) {
    items.push({
      type: "empty",
      label: "오늘의 계획",
      title: "오늘 표시할 확정 일정이 아직 없어요.",
      time: "",
      location: ""
    });
  }

  return items;
}

function getAtlasTimeCard_(memory) {
  var trip = getAtlasCurrentTrip_(memory);
  var localTimezone = trip.localTimezone || trip.timezone || "Europe/Istanbul";
  var homeTimezone = "Asia/Seoul";

  var now = new Date();

  return {
    local_label: trip.localTimeLabel || "현지 시간",
    local_timezone: localTimezone,
    local_time: Utilities.formatDate(now, localTimezone, "HH:mm"),
    home_label: "한국 시간",
    home_timezone: homeTimezone,
    home_time: Utilities.formatDate(now, homeTimezone, "HH:mm")
  };
}

function getAtlasNextTransport_(memory) {
  var objects = getAtlasMemoryObjects_(memory);
  var now = new Date();
  var candidates = [];

  objects.forEach(function (obj) {
    var type = String(obj.objectType || obj.type || "").toLowerCase();
    var isTransport = type.indexOf("flight") >= 0 || type.indexOf("train") >= 0 || type.indexOf("bus") >= 0 || type.indexOf("transport") >= 0;

    if (!isTransport) return;

    var dateText = obj.departureDate || obj.departure_date || obj.date || obj.startDate || obj.start_date;
    var timeText = obj.departureTime || obj.departure_time || obj.time || obj.startTime || obj.start_time;
    var dt = parseAtlasDateTime_(dateText, timeText);

    if (dt && dt.getTime() >= now.getTime() - 60 * 60 * 1000) {
      candidates.push({
        object: obj,
        datetime: dt
      });
    }
  });

  candidates.sort(function (a, b) {
    return a.datetime.getTime() - b.datetime.getTime();
  });

  if (candidates.length === 0) {
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

  var obj = candidates[0].object;

  return {
    type: obj.transportType || obj.objectType || obj.type || "transport",
    label: "다음 이동",
    title: buildAtlasTransportTitle_(obj),
    departure_place: obj.departurePlace || obj.departureAirport || obj.departureStation || obj.from || "",
    departure_time: obj.departureTime || obj.departure_time || obj.time || "",
    arrival_place: obj.arrivalPlace || obj.arrivalAirport || obj.arrivalStation || obj.to || "",
    arrival_time: obj.arrivalTime || obj.arrival_time || "",
    reference: obj.flightNo || obj.trainNo || obj.busNo || obj.pnr || obj.bookingReference || ""
  };
}

function getAtlasQuickLinks_() {
  var props = PropertiesService.getScriptProperties();

  return {
    boarding_pass: props.getProperty("ATLAS_DRIVE_BOARDING_PASS_URL") || "",
    hotel: props.getProperty("ATLAS_DRIVE_HOTEL_URL") || "",
    documents: props.getProperty("ATLAS_DRIVE_DOCUMENTS_URL") || "",
    packing:
      props.getProperty("ATLAS_PACKING_NOTION_URL") ||
      "https://app.notion.com/p/5e8e3cbee2d64c578ac981e1969a7a81?v=b51c772da87c4309826a8e2d8e90e096"
  };
}

function getAtlasMemoryObjects_(memory) {
  if (!memory) return [];

  if (Array.isArray(memory.objects)) return memory.objects;
  if (Array.isArray(memory.knowledgeObjects)) return memory.knowledgeObjects;
  if (Array.isArray(memory.knowledge_objects)) return memory.knowledge_objects;
  if (Array.isArray(memory.travelObjects)) return memory.travelObjects;
  if (Array.isArray(memory.items)) return memory.items;

  return [];
}

function getAtlasCurrentTrip_(memory) {
  if (!memory) return {};

  if (memory.currentTrip) return memory.currentTrip;
  if (memory.trip) return memory.trip;
  if (memory.travelState && memory.travelState.trip) return memory.travelState.trip;

  return {};
}

function normalizeAtlasDate_(value) {
  if (!value) return "";

  if (Object.prototype.toString.call(value) === "[object Date]") {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }

  var text = String(value).trim();

  var isoMatch = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];

  var slashMatch = text.match(/^(\d{4})[./](\d{1,2})[./](\d{1,2})/);
  if (slashMatch) {
    return slashMatch[1] + "-" + pad2_(slashMatch[2]) + "-" + pad2_(slashMatch[3]);
  }

  return "";
}

function parseAtlasDateTime_(dateText, timeText) {
  var date = normalizeAtlasDate_(dateText);
  if (!date) return null;

  var time = String(timeText || "00:00").trim();
  var hm = time.match(/(\d{1,2}):(\d{2})/);

  var hour = hm ? Number(hm[1]) : 0;
  var minute = hm ? Number(hm[2]) : 0;

  return new Date(date + "T" + pad2_(hour) + ":" + pad2_(minute) + ":00");
}

function buildAtlasTransportTitle_(obj) {
  var type = String(obj.transportType || obj.objectType || obj.type || "transport").toLowerCase();

  var label = "교통편";
  if (type.indexOf("flight") >= 0) label = "항공편";
  if (type.indexOf("train") >= 0) label = "기차";
  if (type.indexOf("bus") >= 0) label = "버스";

  var ref = obj.flightNo || obj.trainNo || obj.busNo || obj.pnr || "";
  var from = obj.departurePlace || obj.departureAirport || obj.departureStation || obj.from || "";
  var to = obj.arrivalPlace || obj.arrivalAirport || obj.arrivalStation || obj.to || "";

  var title = label;
  if (ref) title += " " + ref;
  if (from || to) title += " · " + from + " → " + to;

  return title;
}

function pad2_(value) {
  return String(value).padStart(2, "0");
}
function buildBriefPracticalMemoryFromInsights_(tripId, insights) {
  const memory = {
    currentTrip: {
      id: tripId,
      timezone: "Europe/Istanbul",
      localTimeLabel: "튀르키예 시간"
    },
    knowledgeObjects: []
  };

  (insights || []).forEach(function(insight) {
    if (!insight) return;

    // 1) 호텔 예약
    if (insight.type === "hotel_booking") {
      const message = insight.message || "";

      const hotelMatch = message.match(/^(.+?) 숙박 정보/);
      const dateMatch = message.match(/\((.+?)~(.+?)\)/);

      memory.knowledgeObjects.push({
        objectType: "hotel_booking",
        hotelName: hotelMatch ? hotelMatch[1] : "숙소",
        checkIn: dateMatch ? dateMatch[1].trim() : "",
        checkOut: dateMatch ? dateMatch[2].trim() : "",
        location: ""
      });

      return;
    }

    // 2) 항공 / 기차 / 버스 예약
    if (
      insight.type === "flight_booking" ||
      insight.type === "train_ticket" ||
      insight.type === "bus_ticket"
    ) {
      const objectType =
        insight.type === "flight_booking" ? "flight_booking" :
        insight.type === "train_ticket" ? "train_ticket" :
        "bus_ticket";

      memory.knowledgeObjects.push({
        objectType: objectType,
        title: insight.message || "다음 이동",
        departureDate: insight.departureDate || insight.date || "",
        departureTime: insight.departureTime || insight.time || "",
        departurePlace: insight.departurePlace || "",
        arrivalPlace: insight.arrivalPlace || "",
        flightNo: insight.flightNo || "",
        trainNo: insight.trainNo || "",
        busNo: insight.busNo || ""
      });

      return;
    }
  });

  return memory;
}