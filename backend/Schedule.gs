const ATLAS_SCHEDULE_INDEX_KEY = "ATLAS_SCHEDULE_INDEX";
const ATLAS_SCHEDULE_RECORD_PREFIX = "ATLAS_SCHEDULE_RECORD__";

const ATLAS_TIMELINE_INDEX_KEY = "ATLAS_TIMELINE_INDEX";
const ATLAS_TIMELINE_RECORD_PREFIX = "ATLAS_TIMELINE_RECORD__";

function handleAtlasScheduleCreate(payload) {
  validateAtlasSchedulePayload(payload);

  const trip = ATLAS_CONFIG.trips[payload.tripId];
  if (!trip) {
    throw new Error("Unknown tripId: " + payload.tripId);
  }

  const scheduleRecord = buildAtlasScheduleRecord(payload, trip);
  saveAtlasScheduleRecord(scheduleRecord);

  const timelineEvent = buildAtlasTimelineEventFromSchedule(scheduleRecord);
  saveAtlasTimelineEvent(timelineEvent);

  return {
    ok: true,
    scheduleId: scheduleRecord.id,
    timelineEventId: timelineEvent.id,
    scheduleRecord: scheduleRecord,
    timelineEvent: timelineEvent,
    message: buildAtlasScheduleCreateMessage(scheduleRecord)
  };
}

function validateAtlasSchedulePayload(payload) {
  if (!payload) throw new Error("Missing schedule payload.");
  if (payload.type !== "schedule") throw new Error("Invalid payload type.");
  if (!payload.tripId) throw new Error("Missing tripId.");
  if (!payload.scheduleType) throw new Error("Missing scheduleType.");
  if (!payload.title) throw new Error("Missing title.");
  if (!payload.startAt) throw new Error("Missing startAt.");

  const allowed = ["flight", "hotel", "train", "bus", "activity", "etc"];
  if (allowed.indexOf(payload.scheduleType) === -1) {
    throw new Error("Unsupported scheduleType: " + payload.scheduleType);
  }

  if (requiresAtlasConfirmationNumber_(payload.scheduleType)) {
    const details = payload.details || {};
    const confirmationNumber = payload.confirmationNumber || details.confirmationNumber || "";
    if (!confirmationNumber) {
      throw new Error("Missing confirmationNumber.");
    }
  }
}

function buildAtlasScheduleRecord(payload, trip) {
  const now = new Date().toISOString();
  const details = payload.details || {};
  details.confirmationNumber = payload.confirmationNumber || details.confirmationNumber || details.reservationNumber || "";

  return {
    id: createAtlasScheduleId(),
    source: "manual_schedule",
    status: "confirmed_by_user",
    createdAt: now,
    updatedAt: now,

    tripId: payload.tripId,
    tripName: trip.name || payload.tripId,

    scheduleType: payload.scheduleType,
    title: payload.title,
    startAt: payload.startAt,
    endAt: payload.endAt || "",
    location: payload.location || "",
    confirmationNumber: details.confirmationNumber,
    notes: payload.notes || "",

    details: details
  };
}

function saveAtlasScheduleRecord(record) {
  const props = PropertiesService.getScriptProperties();

  props.setProperty(
    ATLAS_SCHEDULE_RECORD_PREFIX + record.id,
    JSON.stringify(record)
  );

  const index = getAtlasJsonProperty_(ATLAS_SCHEDULE_INDEX_KEY, []);
  if (index.indexOf(record.id) === -1) {
    index.push(record.id);
  }

  props.setProperty(ATLAS_SCHEDULE_INDEX_KEY, JSON.stringify(index));
}

function buildAtlasTimelineEventFromSchedule(schedule) {
  const now = new Date().toISOString();

  return {
    id: createAtlasTimelineEventId(),
    source: "manual_schedule",
    sourceId: schedule.id,
    confidence: "confirmed_by_user",

    createdAt: now,
    updatedAt: now,

    tripId: schedule.tripId,
    tripName: schedule.tripName,

    timelineType: getAtlasTimelineTypeFromScheduleType(schedule.scheduleType),
    scheduleType: schedule.scheduleType,

    title: buildAtlasTimelineTitleFromSchedule(schedule),
    startAt: schedule.startAt,
    endAt: schedule.endAt,
    location: schedule.location,
    confirmationNumber: schedule.confirmationNumber || (schedule.details || {}).confirmationNumber || "",

    departurePlace: schedule.details.departurePlace || "",
    arrivalPlace: schedule.details.arrivalPlace || "",

    notes: schedule.notes,
    details: schedule.details
  };
}

function getAtlasTimelineTypeFromScheduleType(scheduleType) {
  if (["flight", "train", "bus"].indexOf(scheduleType) !== -1) {
    return "transport";
  }
  if (scheduleType === "hotel") return "stay";
  if (scheduleType === "activity") return "activity";
  return "manual";
}

function buildAtlasTimelineTitleFromSchedule(schedule) {
  const typeLabel = capitalizeAtlas_(schedule.scheduleType);
  const details = schedule.details || {};

  if (["flight", "train", "bus"].indexOf(schedule.scheduleType) !== -1) {
    const operator = details.airline || details.operator || "";
    const number = details.number || "";
    const route = [details.departurePlace, details.arrivalPlace].filter(Boolean).join(" → ");
    return [typeLabel, operator, number, route].filter(Boolean).join(" · ");
  }

  if (schedule.scheduleType === "hotel") {
    return ["Hotel", details.hotelName || schedule.title].filter(Boolean).join(" · ");
  }

  if (schedule.scheduleType === "activity") {
    return ["Activity", schedule.title].filter(Boolean).join(" · ");
  }

  return ["Etc", schedule.title].filter(Boolean).join(" · ");
}

function saveAtlasTimelineEvent(event) {
  const props = PropertiesService.getScriptProperties();

  props.setProperty(
    ATLAS_TIMELINE_RECORD_PREFIX + event.id,
    JSON.stringify(event)
  );

  const index = getAtlasJsonProperty_(ATLAS_TIMELINE_INDEX_KEY, []);
  if (index.indexOf(event.id) === -1) {
    index.push(event.id);
  }

  props.setProperty(ATLAS_TIMELINE_INDEX_KEY, JSON.stringify(index));
}

function buildAtlasScheduleCreateMessage(schedule) {
  return "Atlas Schedule에 " + capitalizeAtlas_(schedule.scheduleType) + " 일정이 저장되었어요.";
}

function requiresAtlasConfirmationNumber_(scheduleType) {
  return ["flight", "train", "bus", "activity"].indexOf(scheduleType) !== -1;
}

function createAtlasScheduleId() {
  return "sched_" + Utilities.getUuid();
}

function createAtlasTimelineEventId() {
  return "timeline_" + Utilities.getUuid();
}

function getAtlasJsonProperty_(key, fallback) {
  const raw = PropertiesService.getScriptProperties().getProperty(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

function capitalizeAtlas_(value) {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}