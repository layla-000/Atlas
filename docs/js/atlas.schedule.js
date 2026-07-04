const AtlasSchedule = (() => {
const START_DATE = "2026-09-23";
const END_DATE = "2026-10-02";
const TRIP_ID = "trip_turkiye_2026";

const DATE_KEYS = [
  "2026-09-23",
  "2026-09-24",
  "2026-09-25",
  "2026-09-26",
  "2026-09-27",
  "2026-09-28",
  "2026-09-29",
  "2026-09-30",
  "2026-10-01",
  "2026-10-02"
];

  const STATE = {
    days: [],
    currentIndex: 0,
    touchStartX: 0,
    touchEndX: 0
  };

  async function initialize() {
    STATE.days = buildEmptyDays();
    render();

    try {
      await reloadSchedule();
    } catch (error) {
      console.error("Atlas schedule load failed:", error);
      renderError(error);
    }
  }

  async function reloadSchedule() {
    const events = await fetchScheduleFromAtlasMemory();
    applyEvents(events);
    render();
  }

async function fetchScheduleFromAtlasMemory() {
  if (!window.AtlasAPI || !AtlasAPI.getFullSchedule) {
    throw new Error("AtlasAPI.getFullSchedule가 연결되어 있지 않아요.");
  }

  const result = await AtlasAPI.getFullSchedule({
    tripId: TRIP_ID,
    startDate: START_DATE,
    endDate: END_DATE
  });

  return normalizeEvents(result.schedule || result.events || []);
}

  function normalizeEvents(events) {
    return (Array.isArray(events) ? events : [])
      .map((event) => {
        const start = event.startAt || event.start_at || event.start || event.datetime || event.date;
        const end = event.endAt || event.end_at || event.end || "";
const date = String(event.date || start || "").slice(0, 10);

        return {
          id: event.id || `${date}-${event.title || Math.random()}`,
          date,
          time: event.time || extractTime(start),
          endTime: extractTime(end),
          title: event.title || event.name || "일정",
          location: event.location || event.place || event.address || "",
          type: event.scheduleType || event.schedule_type || event.type || "etc",
          confirmationNumber: getConfirmationNumber(event),
          notes: getEventNotes(event),
          route: event.route || event.summary || "",
          source: event.source || ""
        };
      })
      .filter((event) => event.date >= START_DATE && event.date <= END_DATE)
      .sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return (a.time || "99:99").localeCompare(b.time || "99:99");
      });
  }

  function getConfirmationNumber(event) {
    const details = event.details || {};

    return (
      event.confirmationNumber ||
      event.confirmation_number ||
      event.reservationNumber ||
      event.reservation_number ||
      event.bookingReference ||
      event.booking_reference ||
      event.bookingNo ||
      event.booking_no ||
      event.pnr ||
      event.PNR ||
      details.confirmationNumber ||
      details.confirmation_number ||
      details.reservationNumber ||
      details.reservation_number ||
      details.bookingReference ||
      details.booking_reference ||
      details.bookingNo ||
      details.booking_no ||
      details.pnr ||
      details.PNR ||
      ""
    );
  }

  function getEventNotes(event) {
    const details = event.details || {};
    return event.notes || event.note || event.memo || details.notes || details.note || details.memo || "";
  }

  function applyEvents(events) {
    const byDate = new Map();

    events.forEach((event) => {
      if (!byDate.has(event.date)) byDate.set(event.date, []);
      byDate.get(event.date).push(event);
    });

    STATE.days = STATE.days.map((day) => ({
      ...day,
      events: byDate.get(day.date) || []
    }));
  }

  function render() {
    const carousel = document.getElementById("schedule-carousel");
    const dates = document.getElementById("schedule-dates");

    carousel.innerHTML = `
      <div class="day-track" style="transform: translateX(-${STATE.currentIndex * 100}%);">
        ${STATE.days.map(renderDayCard).join("")}
      </div>
    `;

    dates.innerHTML = STATE.days.map((day, index) => `
      <button class="date-button ${index === STATE.currentIndex ? "is-active" : ""}"
        onclick="AtlasSchedule.goToDay(${index})">
        ${formatShortDate(day.date)}
        <span>${day.weekday}</span>
      </button>
    `).join("");

    bindSwipe();
  }

  function renderDayCard(day, index) {
    return `
      <article class="day-card">
        <header class="day-card-header">
          <div class="calendar-icon">🗓️</div>
          <div>
            <h2 class="day-title">${escapeHtml(formatKoreanDate(day.date))}</h2>
            <div class="day-subtitle">Day ${index + 1}</div>
          </div>
          ${day.events.length ? `<div class="route-pill">${escapeHtml(day.events.length)} 일정</div>` : ""}
        </header>

        ${
          day.events.length
            ? `<div class="timeline">${day.events.map(renderTimelineItem).join("")}</div>`
            : `<div class="empty-day">이 날짜에 등록된 일정이 아직 없어요.</div>`
        }
      </article>
    `;
  }

  function renderTimelineItem(event) {
    return `
      <div class="timeline-item">
        <div>
          <div class="time">${escapeHtml(event.time || "--:--")}</div>
          <div class="duration">${escapeHtml(formatDurationLabel(event))}</div>
        </div>
        <div class="dot"></div>
        <div>
          <div class="event-icon">${iconForType(event.type)}</div>
          <div class="event-title">${escapeHtml(event.title)}</div>
          <div class="event-place">
            <span>${escapeHtml(formatEventPlaceLine(event))}</span>
            ${event.source === "manual_schedule" ? renderNoteEditButton(event) : ""}
          </div>
          <span class="event-tag">${escapeHtml(labelForType(event.type))}</span>
        </div>
      </div>
    `;
  }

  function renderNoteEditButton(event) {
    return `
      <button
        type="button"
        class="event-note-edit"
        style="margin-left: 8px; border: 0; border-radius: 999px; padding: 4px 9px; background: rgba(79, 96, 255, 0.10); color: #4f60ff; font: inherit; font-size: 0.8em; cursor: pointer;"
        onclick="AtlasSchedule.editNote('${escapeJs(event.id)}')"
        aria-label="노트 수정"
      >수정</button>
    `;
  }

  function formatEventPlaceLine(event) {
    const items = [];

    if (event.confirmationNumber) {
      items.push(`예약번호 ${event.confirmationNumber}`);
    }

    if (event.notes) {
      items.push(event.notes);
    }

    if (items.length) {
      return items.join(" · ");
    }

    return event.location || event.route || "-";
  }

  function renderError(error) {
    const carousel = document.getElementById("schedule-carousel");
    carousel.innerHTML = `
      <article class="day-card">
        <div class="empty-day">
          전체 일정을 불러오지 못했어요.<br>
          ${escapeHtml(error.message)}
        </div>
      </article>
    `;
  }

  function goToDay(index) {
    STATE.currentIndex = Math.max(0, Math.min(index, STATE.days.length - 1));
    render();
  }

  async function editNote(eventId) {
    const event = findEventById(eventId);
    if (!event) {
      alert("수정할 일정을 찾지 못했어요.");
      return;
    }

    if (!window.AtlasAPI || !AtlasAPI.updateScheduleNote) {
      alert("노트 수정 API가 아직 연결되어 있지 않아요.");
      return;
    }

    const nextNote = window.prompt("노트를 수정해요.", event.notes || "");
    if (nextNote === null) return;

    try {
      const result = await AtlasAPI.updateScheduleNote({
        id: event.id,
        source: event.source,
        notes: nextNote
      });

      if (!result || result.success === false || result.ok === false) {
        throw new Error((result && (result.error || result.message)) || "노트 수정에 실패했어요.");
      }

      event.notes = nextNote;
      render();
      await reloadSchedule();
    } catch (error) {
      console.error("Atlas note update failed:", error);
      alert(error.message || "노트 수정에 실패했어요.");
    }
  }

  function findEventById(eventId) {
    for (let i = 0; i < STATE.days.length; i += 1) {
      const found = STATE.days[i].events.find((event) => event.id === eventId);
      if (found) return found;
    }

    return null;
  }

  function bindSwipe() {
    const carousel = document.getElementById("schedule-carousel");

    carousel.ontouchstart = (event) => {
      STATE.touchStartX = event.changedTouches[0].screenX;
    };

    carousel.ontouchend = (event) => {
      STATE.touchEndX = event.changedTouches[0].screenX;
      handleSwipe();
    };
  }

  function handleSwipe() {
    const diff = STATE.touchStartX - STATE.touchEndX;

    if (Math.abs(diff) < 50) return;

    if (diff > 0) {
      goToDay(STATE.currentIndex + 1);
    } else {
      goToDay(STATE.currentIndex - 1);
    }
  }

function buildEmptyDays() {
  return DATE_KEYS.map((dateKey) => {
    const parts = dateKey.split("-").map(Number);
    const date = new Date(parts[0], parts[1] - 1, parts[2]);

    return {
      date: dateKey,
      weekday: weekdayKo(date),
      events: []
    };
  });
}

  function extractTime(value) {
    if (!value) return "";
    const text = String(value);
    const match = text.match(/T(\d{2}:\d{2})/) || text.match(/\b(\d{2}:\d{2})\b/);
    return match ? match[1] : "";
  }

  function formatDurationLabel(event) {
    if (!event.endTime) return "-";
    return `${event.time} - ${event.endTime}`;
  }

  function iconForType(type) {
    return {
      flight: "✈️",
      hotel: "🏨",
      train: "🚆",
      bus: "🚌",
      transport: "🚌",
      activity: "📷",
      food: "🍴",
      restaurant: "🍴",
      etc: "✨"
    }[String(type || "").toLowerCase()] || "✨";
  }

  function labelForType(type) {
    return {
      flight: "항공",
      hotel: "숙소",
      train: "기차",
      bus: "버스",
      transport: "교통",
      activity: "관광",
      food: "식사",
      restaurant: "식사",
      etc: "일정"
    }[String(type || "").toLowerCase()] || "일정";
  }

  function formatShortDate(dateKey) {
    const [, month, day] = dateKey.split("-");
    return `${Number(month)}.${Number(day)}`;
  }

function formatKoreanDate(dateKey) {
  const parts = dateKey.split("-").map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2]);

  return `${date.getMonth() + 1}월 ${date.getDate()}일 (${weekdayKo(date)})`;
}

  function weekdayKo(date) {
    return ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
  }

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

  function escapeJs(value) {
    return String(value || "")
      .replaceAll("\\", "\\\\")
      .replaceAll("'", "\\'")
      .replaceAll('"', '\\"')
      .replaceAll("\n", "\\n")
      .replaceAll("\r", "");
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  return {
    initialize,
    goToDay,
    editNote
  };
})();

window.addEventListener("DOMContentLoaded", () => {
  AtlasSchedule.initialize();
});