const AtlasSchedule = (() => {
const DEFAULT_TRIP_ID = () => window.AtlasConfig?.atlas?.defaultTripId || "trip_turkiye_2026";
const TRIP_ID = () => {
  const fromUrl = new URLSearchParams(window.location.search).get("trip");
  return String(fromUrl || DEFAULT_TRIP_ID()).trim() || DEFAULT_TRIP_ID();
};

const ADD_SCHEDULE_TYPES = [
  { value: "flight", label: "Flight", icon: "✈️" },
  { value: "hotel", label: "Hotel", icon: "🏨" },
  { value: "train", label: "Train", icon: "🚆" },
  { value: "bus", label: "Bus", icon: "🚌" },
  { value: "activity", label: "Activity", icon: "🎈" },
  { value: "etc", label: "Etc", icon: "✨" }
];

  const STATE = {
    days: [],
    role: "none",
    trip: null,
    startDate: "",
    endDate: "",
    dateKeys: [],
    currentIndex: 0,
    touchStartX: 0,
    touchEndX: 0,
    currentAddType: "flight"
  };

  async function initialize() {
    await AtlasAuth.requireSession();
    const tripId = TRIP_ID();
    const [role, trip] = await Promise.all([
      AtlasAPI.getRole(tripId),
      AtlasAPI.getCurrentTrip(tripId).catch(() => null)
    ]);
    STATE.role = role;
    STATE.trip = trip;
    setDateRange(trip?.start_date || "", trip?.end_date || "");
    if (!STATE.dateKeys.length) {
      const today = toDateKey(new Date());
      setDateRange(today, today);
    }
    updatePageHeading();
    STATE.days = buildEmptyDays();
    render();
    renderOwnerAddButton();

    try {
      await reloadSchedule();
    } catch (error) {
      console.error("Atlas schedule load failed:", error);
      renderError(error);
    }
  }

  async function reloadSchedule() {
    const events = await fetchScheduleFromAtlasMemory();
    if (!STATE.trip?.start_date || !STATE.trip?.end_date) {
      const eventDates = events.map((event) => event.date).filter(Boolean).sort();
      if (eventDates.length) setDateRange(eventDates[0], eventDates[eventDates.length - 1]);
    }
    STATE.days = buildEmptyDays();
    applyEvents(events);
    updatePageHeading();
    render();
  }

async function fetchScheduleFromAtlasMemory() {
  if (!window.AtlasAPI || !AtlasAPI.getFullSchedule) {
    throw new Error("AtlasAPI.getFullSchedule가 연결되어 있지 않아요.");
  }

  const params = { tripId: TRIP_ID() };
  if (STATE.trip?.start_date) params.startDate = STATE.trip.start_date;
  if (STATE.trip?.end_date) params.endDate = STATE.trip.end_date;
  const result = await AtlasAPI.getFullSchedule(params);

  return normalizeEvents(result.schedule || result.events || []);
}

  function normalizeEvents(events) {
    return (Array.isArray(events) ? events : [])
      .flatMap((event) => expandEventAcrossDates(event))
      .filter((event) => !STATE.trip?.start_date || !STATE.trip?.end_date || (event.date >= STATE.startDate && event.date <= STATE.endDate))
      .sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return (a.time || "99:99").localeCompare(b.time || "99:99");
      });
  }

  function expandEventAcrossDates(event) {
    const start = event.startAt || event.start_at || event.start || event.datetime || event.date;
    const end = event.endAt || event.end_at || event.end || "";
    const startDate = normalizeDateKey(event.date || start);
    const endDate = normalizeDateKey(end) || startDate;

    if (!startDate) return [];

    const dates = listDateKeysBetween(startDate, endDate);
    const originalId = event.id || `${startDate}-${event.title || Math.random()}`;

    return dates.map((date, index) => {
      const isFirstDay = index === 0;
      const isLastDay = date === endDate;
      const startTime = event.time || extractTime(start);
      const endTime = extractTime(end);

      return {
      id: originalId,
      displayId: `${originalId}__${date}`,
      date,
      time: isFirstDay ? startTime : (isLastDay ? endTime : ""),
      endTime: isLastDay ? endTime : "",
      title: event.title || event.name || "일정",
      location: event.location || event.place || event.address || "",
      type: event.scheduleType || event.schedule_type || event.type || "etc",
      confirmationNumber: getConfirmationNumber(event),
      notes: getEventNotes(event),
      route: event.route || event.summary || "",
      source: event.source || "",
      details: event.details || {},
      startAt: start || "",
      endAt: end || "",
      isMultiDay: dates.length > 1,
      multiDayIndex: index,
      multiDayCount: dates.length
      };
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
        <div class="timeline-marker" aria-hidden="true">${iconForType(event.type)}</div>
        <div>
          <div class="event-title">${escapeHtml(event.title)}</div>
          <div class="event-place">
            <span>${escapeHtml(formatEventPlaceLine(event))}</span>
            ${STATE.role === "owner" ? renderOwnerButtons(event) : ""}
          </div>
          <span class="event-tag">${escapeHtml(labelForType(event.type))}</span>
        </div>
      </div>
    `;
  }

  function renderOwnerButtons(event) {
    return `
      <span class="event-actions">
        <button type="button" class="event-action-btn" onclick="AtlasSchedule.openEdit('${escapeJs(event.id)}')">수정</button>
        <button type="button" class="event-action-btn is-delete" onclick="AtlasSchedule.remove('${escapeJs(event.id)}')">삭제</button>
      </span>
    `;
  }

  function formatEventPlaceLine(event) {
    const items = [];
    const type = String(event.type || "").toLowerCase();
    const details = event.details || {};

    const operator = details.airline || details.operator || details.provider || "";
    const number = details.number || "";
    const transportName = [operator, number].filter(Boolean).join(" ");
    const departure = details.departurePlace || "";
    const arrival = details.arrivalPlace || "";
    const route = [departure, arrival].filter(Boolean).join(" → ");

    if (["flight", "train", "bus"].includes(type)) {
      if (transportName) items.push(transportName);
      if (route) items.push(route);
      else if (event.location) items.push(event.location);
    } else if (type === "hotel") {
      if (details.hotelName) items.push(details.hotelName);
      if (event.location && event.location !== details.hotelName) items.push(event.location);
    } else if (type === "activity") {
      if (details.provider) items.push(details.provider);
      if (details.meetingPoint) items.push(`미팅 ${details.meetingPoint}`);
      else if (event.location) items.push(event.location);
    } else if (event.location) {
      items.push(event.location);
    } else if (event.route) {
      items.push(event.route);
    }

    if (event.confirmationNumber) {
      items.push(`예약번호 ${event.confirmationNumber}`);
    }

    if (event.notes) {
      items.push(event.notes);
    }

    if (event.isMultiDay) {
      items.push(`${event.multiDayIndex + 1}/${event.multiDayCount}일차`);
    }

    return items.length ? items.join(" · ") : "-";
  }

  function renderOwnerAddButton() {
    document.getElementById("schedule-owner-add")?.remove();
    if (STATE.role !== "owner") return;

    const button = document.createElement("button");
    button.id = "schedule-owner-add";
    button.type = "button";
    button.className = "schedule-owner-add";
    button.setAttribute("aria-label", "일정 추가");
    button.textContent = "+";
    button.addEventListener("click", openAddTypePicker);
    document.body.appendChild(button);
  }

  function openAddTypePicker() {
    if (STATE.role !== "owner") return;
    closeAddModal();

    const modal = document.createElement("div");
    modal.id = "schedule-add-modal";
    modal.className = "schedule-add-backdrop";
    modal.innerHTML = `
      <section class="schedule-add-modal schedule-add-picker" role="dialog" aria-modal="true" aria-labelledby="schedule-add-title">
        <div class="schedule-add-head">
          <div><div class="schedule-add-kicker">Atlas Intake</div><h2 id="schedule-add-title">Add Schedule</h2></div>
          <button type="button" class="schedule-add-close" onclick="AtlasSchedule.closeAddModal()" aria-label="닫기">×</button>
        </div>
        <div class="schedule-add-type-grid">
          ${ADD_SCHEDULE_TYPES.map((type) => `
            <button type="button" class="schedule-add-type-card" onclick="AtlasSchedule.openAddForm('${type.value}')">
              <span class="schedule-add-type-icon">${type.icon}</span><span>${type.label}</span>
            </button>
          `).join("")}
        </div>
      </section>`;
    modal.addEventListener("click", (event) => { if (event.target === modal) closeAddModal(); });
    document.body.appendChild(modal);
  }

  function openAddForm(scheduleType) {
    if (STATE.role !== "owner") return;
    STATE.currentAddType = ADD_SCHEDULE_TYPES.some((item) => item.value === scheduleType) ? scheduleType : "etc";
    closeAddModal();

    const typeMeta = ADD_SCHEDULE_TYPES.find((item) => item.value === STATE.currentAddType) || ADD_SCHEDULE_TYPES[5];
    const modal = document.createElement("div");
    modal.id = "schedule-add-modal";
    modal.className = "schedule-add-backdrop";
    modal.innerHTML = `
      <section class="schedule-add-modal schedule-add-form" role="dialog" aria-modal="true" aria-labelledby="schedule-add-form-title">
        <div class="schedule-add-head">
          <div><div class="schedule-add-kicker">Manual Schedule</div><h2 id="schedule-add-form-title">${typeMeta.icon} ${typeMeta.label}</h2></div>
          <button type="button" class="schedule-add-close" onclick="AtlasSchedule.closeAddModal()" aria-label="닫기">×</button>
        </div>
        <form id="schedule-add-form" onsubmit="AtlasSchedule.submitAdd(event)">
          ${renderAddFields(STATE.currentAddType)}
          <div class="schedule-add-actions">
            <button type="button" class="schedule-add-secondary" onclick="AtlasSchedule.openAddTypePicker()">Back</button>
            <button type="submit" class="schedule-add-primary">Save Schedule</button>
          </div>
        </form>
      </section>`;
    modal.addEventListener("click", (event) => { if (event.target === modal) closeAddModal(); });
    document.body.appendChild(modal);
    setupScheduleDateTimeRules(modal);
  }

  function setupScheduleDateTimeRules(container) {
    const startInput = container?.querySelector('input[name="startAt"]');
    const endInput = container?.querySelector('input[name="endAt"]');
    if (!startInput) return;

    [startInput, endInput].filter(Boolean).forEach((input) => {
      input.step = "300";
      installFiveMinutePicker(input, () => syncScheduleEndDate(startInput, endInput));
    });

    syncScheduleEndDate(startInput, endInput);
  }

  function installFiveMinutePicker(input, onChange) {
    if (!input || input.dataset.atlasFiveMinutePicker === "1") return;
    input.dataset.atlasFiveMinutePicker = "1";
    input.value = normalizeFiveMinuteValue(input.value);

    const wasRequired = input.required;
    input.required = false;
    input.style.display = "none";

    const wrapper = document.createElement("div");
    wrapper.className = "schedule-five-minute-datetime";
    wrapper.style.cssText = "display:grid;grid-template-columns:minmax(142px,1fr) 54px 54px;gap:4px;width:100%;margin-top:6px;";

    const dateInput = document.createElement("input");
    dateInput.type = "date";
    dateInput.required = wasRequired;
    dateInput.setAttribute("aria-label", "Date");

    const hourSelect = document.createElement("select");
    hourSelect.setAttribute("aria-label", "Hour");
    hourSelect.innerHTML = Array.from({ length: 24 }, (_, hour) => {
      const value = String(hour).padStart(2, "0");
      return `<option value="${value}">${value}</option>`;
    }).join("");

    const minuteSelect = document.createElement("select");
    minuteSelect.setAttribute("aria-label", "Minute");
    minuteSelect.innerHTML = Array.from({ length: 12 }, (_, index) => {
      const value = String(index * 5).padStart(2, "0");
      return `<option value="${value}">${value}</option>`;
    }).join("");

    [dateInput, hourSelect, minuteSelect].forEach((control) => {
      control.style.width = "100%";
      control.style.minWidth = "0";
    });
    [hourSelect, minuteSelect].forEach((control) => {
      control.style.paddingLeft = "6px";
      control.style.paddingRight = "4px";
    });

    wrapper.append(dateInput, hourSelect, minuteSelect);
    input.insertAdjacentElement("afterend", wrapper);
    input._atlasDateInput = dateInput;
    input._atlasHourSelect = hourSelect;
    input._atlasMinuteSelect = minuteSelect;

    const syncVisibleFromValue = () => {
      const value = normalizeFiveMinuteValue(input.value);
      input.value = value;
      if (!value) {
        dateInput.value = "";
        hourSelect.value = "00";
        minuteSelect.value = "00";
        return;
      }
      dateInput.value = value.slice(0, 10);
      hourSelect.value = value.slice(11, 13) || "00";
      minuteSelect.value = value.slice(14, 16) || "00";
    };

    const syncValueFromVisible = () => {
      if (!dateInput.value) {
        input.value = "";
      } else {
        input.value = `${dateInput.value}T${hourSelect.value}:${minuteSelect.value}`;
      }
      if (typeof onChange === "function") onChange();
    };

    input._atlasSyncPicker = syncVisibleFromValue;
    dateInput.addEventListener("change", syncValueFromVisible);
    hourSelect.addEventListener("change", syncValueFromVisible);
    minuteSelect.addEventListener("change", syncValueFromVisible);
    syncVisibleFromValue();
  }

  function normalizeFiveMinuteValue(value) {
    if (!value) return "";
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (!match) return value;
    const [, year, month, day, hour, minute] = match;
    const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), 0, 0);
    date.setMinutes(Math.round(date.getMinutes() / 5) * 5, 0, 0);
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function syncScheduleEndDate(startInput, endInput) {
    if (!startInput || !endInput || !startInput.value) return;
    const startDate = startInput.value.slice(0, 10);
    endInput.min = `${startDate}T00:00`;
    if (endInput._atlasDateInput) endInput._atlasDateInput.min = startDate;
    if (endInput.value && endInput.value.slice(0, 10) < startDate) {
      const endTime = endInput.value.slice(11, 16) || startInput.value.slice(11, 16) || "00:00";
      endInput.value = `${startDate}T${endTime}`;
      endInput._atlasSyncPicker?.();
    }
  }

  function normalizeScheduleFormDateTimes(form) {
    const startInput = form?.querySelector('input[name="startAt"]');
    const endInput = form?.querySelector('input[name="endAt"]');
    if (!startInput) return;
    startInput.value = normalizeFiveMinuteValue(startInput.value);
    if (endInput) endInput.value = normalizeFiveMinuteValue(endInput.value);
    syncScheduleEndDate(startInput, endInput);
  }

  function renderAddFields(type) {
    const selectedDate = STATE.days[STATE.currentIndex]?.date || STATE.startDate || toDateKey(new Date());
    const startValue = `${selectedDate}T09:00`;
    const commonTop = `
      <input type="hidden" name="tripId" value="${TRIP_ID()}">
      <label>Title<input name="title" placeholder="일정 제목" required></label>`;
    const confirmationField = `<label>Confirmation Number<input name="confirmationNumber" placeholder="PNR, 예약번호, 바우처 번호" required></label>`;
    const notesField = `<label>Notes<textarea name="notes" rows="3" placeholder="준비물, 메모 등을 적어 주세요."></textarea></label>`;

    if (type === "flight") return `${commonTop}
      <div class="schedule-add-row"><label>Airline<input name="airline" placeholder="Turkish Airlines"></label><label>Flight No.<input name="number" placeholder="TK21"></label></div>
      <div class="schedule-add-row"><label>Departure<input name="departurePlace" placeholder="ICN"></label><label>Arrival<input name="arrivalPlace" placeholder="IST"></label></div>
      <div class="schedule-add-row"><label>Departure Time<input name="startAt" type="datetime-local" step="300" value="${startValue}" required></label><label>Arrival Time<input name="endAt" type="datetime-local" step="300"></label></div>
      ${confirmationField}${notesField}`;

    if (type === "hotel") return `${commonTop}
      <label>Hotel Name<input name="hotelName" placeholder="Sultan Cave Suites"></label>
      <div class="schedule-add-row"><label>Check-in<input name="startAt" type="datetime-local" step="300" value="${startValue}" required></label><label>Check-out<input name="endAt" type="datetime-local" step="300" required></label></div>
      <label>Reservation No.<input name="reservationNumber" placeholder="optional"></label>
      <label>Location<input name="location" placeholder="주소 또는 지역"></label>${notesField}`;

    if (type === "train" || type === "bus") {
      const isTrain = type === "train";
      return `${commonTop}
        <div class="schedule-add-row"><label>Operator<input name="operator" placeholder="${isTrain ? 'TCDD' : 'Pamukkale'}"></label><label>${isTrain ? 'Train' : 'Bus'} No.<input name="number" placeholder="optional"></label></div>
        <div class="schedule-add-row"><label>Departure ${isTrain ? 'Station' : 'Stop'}<input name="departurePlace"></label><label>Arrival ${isTrain ? 'Station' : 'Stop'}<input name="arrivalPlace"></label></div>
        <div class="schedule-add-row"><label>Departure Time<input name="startAt" type="datetime-local" step="300" value="${startValue}" required></label><label>Arrival Time<input name="endAt" type="datetime-local" step="300"></label></div>
        ${confirmationField}${notesField}`;
    }

    if (type === "activity") return `${commonTop}
      <label>Provider<input name="provider" placeholder="optional"></label>
      <div class="schedule-add-row"><label>Start Time<input name="startAt" type="datetime-local" step="300" value="${startValue}" required></label><label>End Time<input name="endAt" type="datetime-local" step="300"></label></div>
      <label>Meeting Point<input name="meetingPoint" placeholder="optional"></label>
      ${confirmationField}${notesField}`;

    return `${commonTop}
      <div class="schedule-add-row"><label>Start Time<input name="startAt" type="datetime-local" step="300" value="${startValue}" required></label><label>End Time<input name="endAt" type="datetime-local" step="300"></label></div>
      <label>Location<input name="location" placeholder="장소"></label>${notesField}`;
  }

  function collectAddPayload(form) {
    const raw = Object.fromEntries(new FormData(form).entries());
    return {
      type: "schedule",
      scheduleType: STATE.currentAddType,
      tripId: raw.tripId || TRIP_ID(),
      title: raw.title,
      startAt: raw.startAt,
      endAt: raw.endAt,
      location: raw.location || "",
      confirmationNumber: raw.confirmationNumber || raw.reservationNumber || "",
      notes: raw.notes || "",
      details: {
        confirmationNumber: raw.confirmationNumber || raw.reservationNumber || "",
        airline: raw.airline || "",
        operator: raw.operator || "",
        provider: raw.provider || "",
        hotelName: raw.hotelName || "",
        number: raw.number || "",
        reservationNumber: raw.reservationNumber || "",
        departurePlace: raw.departurePlace || "",
        arrivalPlace: raw.arrivalPlace || "",
        meetingPoint: raw.meetingPoint || ""
      }
    };
  }

  async function submitAdd(event) {
    event.preventDefault();
    if (STATE.role !== "owner") return;
    const form = event.currentTarget;
    normalizeScheduleFormDateTimes(form);
    const button = form.querySelector(".schedule-add-primary");
    const payload = collectAddPayload(form);

    try {
      if (!window.AtlasAPI?.createSchedule) throw new Error("Atlas Supabase API가 준비되지 않았어요.");
      if (button) { button.disabled = true; button.textContent = "Saving..."; }
      const result = await AtlasAPI.createSchedule(payload);
      if (!result || result.success === false || result.ok === false) {
        throw new Error((result && (result.error || result.message)) || "일정 저장에 실패했어요.");
      }
      closeAddModal();
      const addedDate = normalizeDateKey(payload.startAt);
      const nextIndex = STATE.days.findIndex((day) => day.date === addedDate);
      if (nextIndex >= 0) STATE.currentIndex = nextIndex;
      await reloadSchedule();
    } catch (error) {
      console.error("Atlas schedule create failed:", error);
      alert(error.message || "일정 저장에 실패했어요.");
      if (button) { button.disabled = false; button.textContent = "Save Schedule"; }
    }
  }

  function closeAddModal() {
    document.getElementById("schedule-add-modal")?.remove();
  }

  function exportViewerPdf() {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("PDF 화면을 열지 못했어요. 이 사이트의 팝업을 허용한 뒤 다시 눌러주세요.");
      return;
    }

    const publicDays = STATE.days.map((day, index) => ({
      ...day,
      dayNumber: index + 1,
      events: day.events.map(toViewerPublicEvent)
    }));

    printWindow.document.open();
    printWindow.document.write(buildViewerPrintDocument(publicDays));
    printWindow.document.close();
    printWindow.focus();
    printWindow.setTimeout(() => printWindow.print(), 250);
  }

  function toViewerPublicEvent(event) {
    const details = event.details || {};
    return {
      date: event.date,
      time: event.time || "",
      endTime: event.endTime || "",
      title: event.title || "일정",
      location: event.location || "",
      type: event.type || "etc",
      details: {
        airline: details.airline || "",
        operator: details.operator || "",
        provider: details.provider || "",
        number: details.number || "",
        departurePlace: details.departurePlace || "",
        arrivalPlace: details.arrivalPlace || "",
        hotelName: details.hotelName || "",
        meetingPoint: details.meetingPoint || ""
      },
      isMultiDay: Boolean(event.isMultiDay),
      multiDayIndex: Number(event.multiDayIndex || 0),
      multiDayCount: Number(event.multiDayCount || 0)
    };
  }

  function buildViewerPrintDocument(days) {
    const dayCards = days.map((day) => `
      <section class="pdf-day">
        <header class="pdf-day-head">
          <div>
            <strong>DAY ${day.dayNumber}</strong>
            <h2>${escapeHtml(formatKoreanDate(day.date))}</h2>
          </div>
          <span>${day.events.length} 일정</span>
        </header>
        <div class="pdf-events">
          ${day.events.length ? day.events.map(renderViewerPdfEvent).join("") : '<div class="pdf-empty">등록된 일정 없음</div>'}
        </div>
      </section>
    `).join("");

    return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ATLAS · Viewer Schedule</title>
  <style>
    @page { size: A4 landscape; margin: 7mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #111827; }
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .pdf-page { width: 100%; min-height: 190mm; display: flex; flex-direction: column; }
    .pdf-head { display: flex; align-items: flex-end; justify-content: space-between; border-bottom: 2px solid #111827; padding: 0 1mm 3mm; margin-bottom: 3mm; }
    .pdf-brand { font-size: 18pt; font-weight: 900; letter-spacing: .12em; }
    .pdf-sub { margin-top: 1mm; font-size: 8pt; color: #64748b; }
    .pdf-range { text-align: right; font-size: 9pt; font-weight: 750; color: #334155; }
    .pdf-grid { flex: 1 1 0; min-height: 0; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); grid-template-rows: repeat(2, minmax(0, 1fr)); gap: 2.4mm; overflow: hidden; }
    .pdf-day { min-width: 0; min-height: 0; border: 1px solid #d8dee9; border-radius: 3mm; overflow: hidden; display: flex; flex-direction: column; break-inside: avoid; }
    .pdf-day-head { display: flex; align-items: center; justify-content: space-between; gap: 2mm; background: #f3f6fb; padding: 2.2mm 2.5mm; border-bottom: 1px solid #d8dee9; }
    .pdf-day-head strong { display: block; font-size: 6.5pt; color: #5365d8; letter-spacing: .04em; }
    .pdf-day-head h2 { margin: .5mm 0 0; font-size: 9pt; line-height: 1.1; }
    .pdf-day-head span { font-size: 6.5pt; color: #64748b; white-space: nowrap; }
    .pdf-events { flex: 1 1 0; min-height: 0; padding: 1.35mm 2mm; overflow: hidden; }
    .pdf-event { display: grid; grid-template-columns: 11.5mm minmax(0, 1fr); gap: 1.15mm; padding: 1.15mm 0; border-bottom: 1px solid #e8ecf2; }
    .pdf-event:last-child { border-bottom: 0; }
    .pdf-time { font-size: 7pt; font-weight: 900; color: #111827; white-space: nowrap; }
    .pdf-time small { display: block; margin-top: .3mm; font-size: 5.2pt; color: #64748b; font-weight: 650; }
    .pdf-title { font-size: 6.9pt; line-height: 1.18; font-weight: 850; overflow-wrap: anywhere; }
    .pdf-meta { margin-top: .35mm; font-size: 5.5pt; line-height: 1.2; color: #536174; overflow-wrap: anywhere; }
    .pdf-type { display: inline-block; margin-top: .5mm; padding: .2mm .9mm; border-radius: 99px; background: #edf1ff; color: #5061d4; font-size: 5pt; font-weight: 850; }
    .pdf-empty { padding: 5mm 1mm; text-align: center; color: #94a3b8; font-size: 7pt; }
    .pdf-foot { display: flex; justify-content: space-between; margin-top: 2mm; padding: 0 1mm; color: #94a3b8; font-size: 5.5pt; }
    @media screen {
      body { background: #d9dee8; padding: 12px; }
      .pdf-page { width: 297mm; height: 210mm; min-height: 0; margin: 0 auto; padding: 7mm; overflow: hidden; background: #fff; box-shadow: 0 8px 30px rgba(0,0,0,.18); }
    }
    @media print {
      html, body { width: 100%; height: 100%; overflow: hidden; }
      .pdf-page { width: 100%; height: 196mm; min-height: 0; max-height: 196mm; overflow: hidden; }
      .pdf-grid { min-height: 0; }
      .pdf-day, .pdf-events { min-height: 0; }
    }
  </style>
</head>
<body>
  <main class="pdf-page">
    <header class="pdf-head">
      <div><div class="pdf-brand">ATLAS</div><div class="pdf-sub">Viewer Schedule · 공개 일정 요약</div></div>
      <div class="pdf-range">${escapeHtml(formatPdfDateRange())}<br>Türkiye 2026</div>
    </header>
    <div class="pdf-grid">${dayCards}</div>
    <footer class="pdf-foot"><span>Viewer 공개 정보만 포함되어 있어요.</span><span>예약번호 · 개인 메모 · 가계부 제외</span></footer>
  </main>
</body>
</html>`;
  }

  function renderViewerPdfEvent(event) {
    const meta = formatViewerPublicMeta(event);
    return `
      <div class="pdf-event">
        <div class="pdf-time">${escapeHtml(event.time || "--:--")}${event.endTime ? `<small>~ ${escapeHtml(event.endTime)}</small>` : ""}</div>
        <div>
          <div class="pdf-title">${escapeHtml(iconForType(event.type))} ${escapeHtml(event.title)}</div>
          ${meta ? `<div class="pdf-meta">${escapeHtml(meta)}</div>` : ""}
          <span class="pdf-type">${escapeHtml(labelForType(event.type))}</span>
        </div>
      </div>`;
  }

  function formatViewerPublicMeta(event) {
    const items = [];
    const type = String(event.type || "").toLowerCase();
    const details = event.details || {};
    const operator = details.airline || details.operator || details.provider || "";
    const transportName = [operator, details.number].filter(Boolean).join(" ");
    const route = [details.departurePlace, details.arrivalPlace].filter(Boolean).join(" → ");

    if (["flight", "train", "bus"].includes(type)) {
      if (transportName) items.push(transportName);
      if (route) items.push(route);
      else if (event.location) items.push(event.location);
    } else if (type === "hotel") {
      if (details.hotelName) items.push(details.hotelName);
      if (event.location && event.location !== details.hotelName) items.push(event.location);
    } else if (type === "activity") {
      if (details.provider) items.push(details.provider);
      if (details.meetingPoint) items.push(`미팅 ${details.meetingPoint}`);
      else if (event.location) items.push(event.location);
    } else if (event.location) {
      items.push(event.location);
    }

    if (event.isMultiDay && event.multiDayCount > 1) {
      items.push(`${event.multiDayIndex + 1}/${event.multiDayCount}일차`);
    }

    return items.join(" · ");
  }

  function formatPdfDateRange() {
    if (!STATE.startDate || !STATE.endDate) return "일정 날짜 미정";
    return STATE.startDate === STATE.endDate
      ? STATE.startDate.replaceAll("-", ".")
      : `${STATE.startDate.replaceAll("-", ".")} - ${STATE.endDate.replaceAll("-", ".")}`;
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

  function openEdit(eventId) {
    const event = findEventById(eventId);
    if (!event || STATE.role !== "owner") return;
    closeEdit();

    const modal = document.createElement("div");
    modal.id = "schedule-edit-modal";
    modal.className = "schedule-modal-backdrop";
    modal.innerHTML = `
      <section class="schedule-modal" role="dialog" aria-modal="true" aria-labelledby="schedule-edit-title">
        <div class="schedule-modal-head">
          <div><div class="brand">ATLAS</div><h2 id="schedule-edit-title">일정 수정</h2></div>
          <button type="button" class="schedule-modal-close" onclick="AtlasSchedule.closeEdit()" aria-label="닫기">×</button>
        </div>
        <form id="schedule-edit-form" onsubmit="AtlasSchedule.saveEdit(event)">
          <input type="hidden" name="id" value="${escapeHtml(event.id)}">
          <label>종류
            <select name="scheduleType">
              ${["flight","hotel","train","bus","activity","food","etc"].map(type => `<option value="${type}" ${type === String(event.type).toLowerCase() ? "selected" : ""}>${labelForType(type)}</option>`).join("")}
            </select>
          </label>
          <label>제목<input name="title" required value="${escapeHtml(event.title)}"></label>
          <div class="schedule-modal-grid">
            <label>시작<input name="startAt" type="datetime-local" step="300" required value="${escapeHtml(toDateTimeLocal(event.startAt))}"></label>
            <label>종료<input name="endAt" type="datetime-local" step="300" value="${escapeHtml(toDateTimeLocal(event.endAt))}"></label>
          </div>
          <label>장소<input name="location" value="${escapeHtml(event.location || "")}"></label>
          <label>예약번호<input name="confirmationNumber" value="${escapeHtml(event.confirmationNumber || "")}"></label>
          <label>메모<textarea name="notes" rows="4">${escapeHtml(event.notes || "")}</textarea></label>
          <div class="schedule-modal-actions">
            <button type="button" class="schedule-secondary-btn" onclick="AtlasSchedule.closeEdit()">취소</button>
            <button type="submit" class="schedule-primary-btn">저장</button>
          </div>
        </form>
      </section>`;
    modal.addEventListener("click", (e) => { if (e.target === modal) closeEdit(); });
    document.body.appendChild(modal);
    setupScheduleDateTimeRules(modal);
  }

  function closeEdit() {
    document.getElementById("schedule-edit-modal")?.remove();
  }

  async function saveEdit(domEvent) {
    domEvent.preventDefault();
    if (STATE.role !== "owner") return;
    const form = domEvent.currentTarget;
    normalizeScheduleFormDateTimes(form);
    const data = Object.fromEntries(new FormData(form).entries());
    const original = findEventById(data.id);
    if (!original) return alert("수정할 일정을 찾지 못했어요.");

    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    submit.textContent = "저장 중…";
    try {
      await AtlasAPI.updateSchedule({
        id: data.id,
        tripId: TRIP_ID(),
        scheduleType: data.scheduleType,
        title: data.title.trim(),
        startAt: data.startAt,
        endAt: data.endAt,
        location: data.location.trim(),
        confirmationNumber: data.confirmationNumber.trim(),
        notes: data.notes.trim(),
        details: original.details || {}
      });
      closeEdit();
      await reloadSchedule();
    } catch (error) {
      console.error("Atlas schedule update failed:", error);
      alert(error.message || "일정 수정에 실패했어요.");
      submit.disabled = false;
      submit.textContent = "저장";
    }
  }

  async function remove(eventId) {
    const event = findEventById(eventId);
    if (!event || STATE.role !== "owner") return;
    if (!confirm(`“${event.title}” 일정을 삭제할까요?`)) return;
    try {
      await AtlasAPI.deleteSchedule({ id: event.id, tripId: TRIP_ID() });
      closeEdit();
      await reloadSchedule();
    } catch (error) {
      console.error("Atlas schedule delete failed:", error);
      alert(error.message || "일정 삭제에 실패했어요.");
    }
  }

  function toDateTimeLocal(value) {
    if (!value) return "";
    return String(value).replace(" ", "T").slice(0, 16);
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

  async function editTime(eventId) {
    const event = findEventById(eventId);
    if (!event) {
      alert("수정할 일정을 찾지 못했어요.");
      return;
    }

    if (!window.AtlasAPI || !AtlasAPI.updateScheduleTime) {
      alert("시간 수정 API가 아직 연결되어 있지 않아요.");
      return;
    }

    const nextStartAt = window.prompt("시작 시간을 수정해요. 예: 2026-09-24T09:00", event.startAt || `${event.date}T${event.time || "09:00"}`);
    if (nextStartAt === null) return;

    const nextEndAt = window.prompt("종료 시간을 수정해요. 비워두어도 괜찮아요. 예: 2026-09-24T11:00", event.endAt || "");
    if (nextEndAt === null) return;

    const normalizedStartAt = normalizeFiveMinuteValue(nextStartAt.trim());
    let normalizedEndAt = normalizeFiveMinuteValue(nextEndAt.trim());
    if (normalizedEndAt && normalizedStartAt && normalizedEndAt.slice(0, 10) < normalizedStartAt.slice(0, 10)) {
      normalizedEndAt = `${normalizedStartAt.slice(0, 10)}T${normalizedEndAt.slice(11, 16) || normalizedStartAt.slice(11, 16)}`;
    }

    try {
      const result = await AtlasAPI.updateScheduleTime({
        id: event.id,
        source: event.source,
        startAt: normalizedStartAt,
        endAt: normalizedEndAt
      });

      if (!result || result.success === false || result.ok === false) {
        throw new Error((result && (result.error || result.message)) || "시간 수정에 실패했어요.");
      }

      await reloadSchedule();
    } catch (error) {
      console.error("Atlas time update failed:", error);
      alert(error.message || "시간 수정에 실패했어요.");
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

function setDateRange(startDate, endDate) {
  const start = normalizeDateKey(startDate);
  const end = normalizeDateKey(endDate) || start;
  if (!start || !end) {
    STATE.startDate = "";
    STATE.endDate = "";
    STATE.dateKeys = [];
    return;
  }
  STATE.startDate = start;
  STATE.endDate = end < start ? start : end;
  STATE.dateKeys = listDateKeysBetween(STATE.startDate, STATE.endDate);
  STATE.currentIndex = Math.min(STATE.currentIndex, Math.max(0, STATE.dateKeys.length - 1));
}

function updatePageHeading() {
  const name = STATE.trip?.name || TRIP_ID();
  const subtitle = document.getElementById("schedule-trip-name");
  const range = document.getElementById("schedule-trip-range");
  const back = document.querySelector(".schedule-topbar .back-link");
  if (subtitle) subtitle.textContent = name;
  if (range) range.textContent = formatPdfDateRange();
  if (back) back.href = `./index.html`;
}

function buildEmptyDays() {
  return STATE.dateKeys.map((dateKey) => {
    const parts = dateKey.split("-").map(Number);
    const date = new Date(parts[0], parts[1] - 1, parts[2]);

    return {
      date: dateKey,
      weekday: weekdayKo(date),
      events: []
    };
  });
}

  function normalizeDateKey(value) {
    if (!value) return "";
    const text = String(value).trim();
    const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];

    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return "";

    return toDateKey(parsed);
  }

  function listDateKeysBetween(startDate, endDate) {
    const start = parseDateKey(startDate);
    const end = parseDateKey(endDate);
    if (!start || !end || end < start) return [startDate];

    const dates = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      dates.push(toDateKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }

    return dates;
  }

  function parseDateKey(dateKey) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ""))) return null;
    const [year, month, day] = dateKey.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function extractTime(value) {
    if (!value) return "";
    const text = String(value);
    const match = text.match(/T(\d{2}:\d{2})/) || text.match(/\b(\d{2}:\d{2})\b/);
    return match ? match[1] : "";
  }

  function formatDurationLabel(event) {
    if (!event.endTime) return "-";

    if (event.isMultiDay) {
      if (event.multiDayIndex === 0) return `${event.time || "시작"} - 계속`;
      if (event.multiDayIndex === event.multiDayCount - 1) return "종료";
      return "계속";
    }

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
    editNote,
    editTime,
    openEdit,
    closeEdit,
    saveEdit,
    remove,
    openAddTypePicker,
    openAddForm,
    submitAdd,
    closeAddModal,
    exportViewerPdf
  };
})();

window.addEventListener("DOMContentLoaded", () => {
  AtlasSchedule.initialize();
});