const Atlas = (() => {
  const STATE = {
    trip: null,
    places: [],
    brief: null,
    travelStatus: null,
    dashboardNoteSaveTimer: null,
    dashboardNoteLoadedFromBackend: false,
    initialized: false
  };

  async function initialize() {
    console.log("Atlas initializing...");

    render();
    bindEvents();
    await refreshDashboardNote();
    await initializeMap();
    await refreshAtlasBrief();
    await refreshTravelStatus();

    if (window.AtlasCapture) {
      AtlasCapture.initialize();
    }

    STATE.initialized = true;
    console.log("Atlas ready.");
  }

  function render() {
    renderHeader();
    renderMap();
    renderTimeline([]);
    renderBriefPlaceholder();
    void renderStatus({});
    renderActions({});
    renderNotes();
  }

  function renderHeader() {
    document.getElementById("atlas-header").innerHTML = `
      <h1 class="atlas-title">ATLAS</h1>
      <p class="atlas-subtitle">Travel Operating System</p>
    `;
  }
  function renderBriefPlaceholder() {
    renderBriefTitleOnly({ title: "오늘의 브리핑을 준비하고 있어요." });
  }

  function renderBriefTitleOnly(brief) {
    const title = brief && (brief.title || brief.summary || brief.message)
      ? (brief.title || brief.summary || brief.message)
      : "확인할 브리핑이 아직 없어요.";

    document.getElementById("atlas-brief").innerHTML = `
      <div class="atlas-card">
        <div class="atlas-card-inner">
          <div class="atlas-card-label">Atlas Brief</div>
          <div class="atlas-brief-title-only">${escapeHtml(title)}</div>
        </div>
      </div>
    `;
  }

  async function refreshAtlasBrief() {
    if (!window.AtlasAPI) return;

    const brief = await AtlasAPI.getBrief();
    console.log("ATLAS BRIEF RAW", brief);
    STATE.brief = brief || {};

    renderBriefTitleOnly(brief);

    await refreshTodayPlan(brief.today_plan || []);
    await renderStatus({
      time_card: brief.time_card || {},
      next_transport: brief.next_transport || {}
    });
    renderActions(brief.quick_links || brief.drive_links || {});
  }


  async function refreshTodayPlan(fallbackItems) {
    const scheduleItems = await getTodayPlanFromSchedule();
    renderTimeline(scheduleItems.length ? scheduleItems : fallbackItems);
  }

  async function getTodayPlanFromSchedule() {
    if (!window.AtlasAPI || !AtlasAPI.getFullSchedule) return [];

    try {
      const result = await AtlasAPI.getFullSchedule({
        tripId: "trip_turkiye_2026",
        startDate: "2026-09-23",
        endDate: "2026-10-02"
      });

      const events = normalizeDashboardScheduleEvents(result.schedule || result.events || []);
      if (!events.length) return [];

      const now = new Date();
      const upcomingEvents = events
        .filter((event) => event.startTime && event.startTime.getTime() >= now.getTime())
        .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

      if (upcomingEvents.length) {
        return upcomingEvents.slice(0, 3);
      }

      return events
        .slice()
        .sort((a, b) => Math.abs(a.startTime.getTime() - now.getTime()) - Math.abs(b.startTime.getTime() - now.getTime()))
        .slice(0, 3);
    } catch (error) {
      console.warn("Atlas Today's Plan schedule load failed:", error);
      return [];
    }
  }

  function normalizeDashboardScheduleEvents(events) {
    return (Array.isArray(events) ? events : [])
      .map((event) => {
        const start = event.startAt || event.start_at || event.start || event.datetime || event.date || "";
        const end = event.endAt || event.end_at || event.end || "";
        const date = String(event.date || start || "").slice(0, 10);
        const time = event.time || extractTime(start);
        const startTime = buildDashboardEventDate(date, time, start);

        return {
          id: event.id || `${date}-${event.title || event.name || Math.random()}`,
          date,
          time,
          endTime: extractTime(end),
          startTime,
          title: event.title || event.name || "일정",
          location: event.location || event.place || event.address || event.route || event.summary || ""
        };
      })
      .filter((event) => event.date && event.startTime && !Number.isNaN(event.startTime.getTime()))
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  }

  function buildDashboardEventDate(date, time, rawStart) {
    if (rawStart && String(rawStart).includes("T")) {
      const parsed = new Date(rawStart);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }

    if (date && time) {
      const parsed = new Date(`${date}T${time}:00`);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }

    if (date) {
      const parsed = new Date(`${date}T00:00:00`);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }

    return null;
  }

  function extractTime(value) {
    if (!value) return "";
    const text = String(value);
    const match = text.match(/T(\d{2}:\d{2})/) || text.match(/\b(\d{2}:\d{2})\b/);
    return match ? match[1] : "";
  }

  function toDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function dateDistance(dateA, dateB) {
    return new Date(`${dateA}T00:00:00`).getTime() - new Date(`${dateB}T00:00:00`).getTime();
  }

  async function refreshTravelStatus() {
    if (!window.AtlasAPI) return;

    const travelStatus = await AtlasAPI.getTravelStatus();
    STATE.travelStatus = travelStatus || {};
  }

  function renderNotes(noteValue) {
    const savedNote = noteValue == null ? getAtlasDashboardNoteFromLocal() : String(noteValue || "");
    document.getElementById("atlas-notes").innerHTML = `
      <div class="atlas-card">
        <div class="atlas-card-inner">
          <div class="atlas-card-label">Travel Notes</div>
          <textarea
            id="atlas-notes-input"
            class="atlas-notes-input"
            placeholder="주소, 예약번호, 탑승 게이트, 급히 적어둘 메모를 여기에 남겨두세요."
          >${escapeHtml(savedNote)}</textarea>
          <div id="atlas-notes-meta" class="atlas-notes-meta">자동 저장 준비 중이에요.</div>
        </div>
      </div>
    `;
  }

  async function refreshDashboardNote() {
    const localNote = getAtlasDashboardNoteFromLocal();
    setAtlasNotesMeta("브라우저 메모를 먼저 불러왔어요.");

    if (!window.AtlasAPI || !AtlasAPI.getDashboardNote) {
      setAtlasNotesMeta("이 메모는 이 브라우저에 자동 저장돼요.");
      return;
    }

    try {
      const result = await AtlasAPI.getDashboardNote({ tripId: "trip_turkiye_2026" });
      const backendNote = result && result.note != null ? String(result.note) : "";
      STATE.dashboardNoteLoadedFromBackend = true;

      if (backendNote && backendNote !== localNote) {
        saveAtlasDashboardNoteToLocal(backendNote);
        const input = document.getElementById("atlas-notes-input");
        if (input && !input.matches(":focus")) input.value = backendNote;
      } else if (localNote && !backendNote) {
        await saveAtlasDashboardNoteToBackend(localNote, { silent: true });
      }

      setAtlasNotesMeta("이 메모는 브라우저와 Atlas 백엔드에 자동 저장돼요.");
    } catch (error) {
      console.warn("Atlas dashboard note load failed:", error);
      setAtlasNotesMeta("백엔드 연결 실패: 브라우저에 먼저 자동 저장돼요.");
    }
  }

  function getAtlasDashboardNoteFromLocal() {
    try {
      return window.localStorage.getItem("atlas.dashboard.note") || "";
    } catch (error) {
      return "";
    }
  }

  function saveAtlasDashboardNote(value) {
    const note = String(value || "");
    saveAtlasDashboardNoteToLocal(note);
    setAtlasNotesMeta("저장 중이에요...");

    window.clearTimeout(STATE.dashboardNoteSaveTimer);
    STATE.dashboardNoteSaveTimer = window.setTimeout(() => {
      void saveAtlasDashboardNoteToBackend(note);
    }, 500);
  }

  function saveAtlasDashboardNoteToLocal(value) {
    try {
      window.localStorage.setItem("atlas.dashboard.note", String(value || ""));
    } catch (error) {
      console.warn("Atlas dashboard note local save failed:", error);
    }
  }

  async function saveAtlasDashboardNoteToBackend(value, options) {
    if (!window.AtlasAPI || !AtlasAPI.saveDashboardNote) {
      setAtlasNotesMeta("이 메모는 이 브라우저에 자동 저장돼요.");
      return null;
    }

    try {
      const result = await AtlasAPI.saveDashboardNote({
        tripId: "trip_turkiye_2026",
        note: String(value || "")
      });

      if (result && result.success !== false && result.ok !== false) {
        if (!options || !options.silent) {
          setAtlasNotesMeta("저장됐어요. 브라우저와 Atlas 백엔드에 모두 보관돼요.");
        }
        return result;
      }

      throw new Error((result && (result.error || result.message)) || "Dashboard note save failed.");
    } catch (error) {
      console.warn("Atlas dashboard note backend save failed:", error);
      setAtlasNotesMeta("백엔드 저장 실패: 브라우저에는 저장됐어요.");
      return null;
    }
  }

  function setAtlasNotesMeta(message) {
    const meta = document.getElementById("atlas-notes-meta");
    if (meta) meta.textContent = message;
  }

  function renderMap() {
    document.getElementById("atlas-map").innerHTML = `
      <div class="atlas-card">
        <div class="atlas-card-inner">
          <div class="atlas-card-label">Live Map</div>
          <div id="google-map" class="atlas-map-canvas"></div>
        </div>
      </div>
    `;
  }

   function renderTimeline(items) {
    const safeItems = Array.isArray(items) ? items.slice(0, 3) : [];

    while (safeItems.length < 3) {
      safeItems.push({
        time: "--:--",
        title: "표시할 확정 일정이 아직 없어요.",
        location: "Atlas가 문서를 더 읽으면 여기에 표시해요."
      });
    }

    const planItems = safeItems.map((item) => `
      <div class="atlas-plan-item">
        <div class="atlas-plan-time">${escapeHtml(item.time || "--:--")}</div>
        <div>
          <span class="atlas-plan-name">${escapeHtml(item.title || item.label || "오늘 일정")}</span>
          <span class="atlas-plan-location">${escapeHtml(item.location || "")}</span>
        </div>
      </div>
    `).join("");

    document.getElementById("atlas-plan").innerHTML = `
      <div class="atlas-card">
        <div class="atlas-card-inner">
          <div class="atlas-card-label">Today's Plan</div>
          <div class="atlas-plan-list">
            ${planItems}
          </div>
        </div>
      </div>
    `;
  }
 function renderStatus(data) {
  data = data || {};

  const timeCard = data.time_card || {};
  const transport = data.next_transport || {};

  document.getElementById("atlas-status").innerHTML = `
    <div class="atlas-card">
      <div class="atlas-card-inner">
        <div class="atlas-card-label">Travel Status</div>

        <div class="atlas-status-grid">
          <div class="atlas-status-item">
            ${escapeHtml(timeCard.local_label || "현지 시간")}
            <span class="atlas-status-value">${escapeHtml(timeCard.local_time || "--:--")}</span>
          </div>

          <div class="atlas-status-item">
            ${escapeHtml(timeCard.home_label || "한국 시간")}
            <span class="atlas-status-value">${escapeHtml(timeCard.home_time || "--:--")}</span>
          </div>

          <div class="atlas-status-item">
            <span id="atlas-weather-label">현재 지역 날씨</span>
            <span id="atlas-weather-value" class="atlas-status-value">확인 대기</span>
          </div>
        </div>

        <div class="atlas-next-transport">
          <strong>${escapeHtml(transport.title || transport.flight_number || transport.vehicle || "예정된 교통편이 아직 없어요.")}</strong>
          <p>
            ${escapeHtml(transport.departure_place || "-")}
            →
            ${escapeHtml(transport.arrival_place || "-")}
          </p>
        </div>
      </div>
    </div>
  `;

  void refreshWeatherStatusItem();
}
async function getCurrentWeatherStatusItem() {
  const gpsPlace = await getBrowserLocationPlace_();

  if (!gpsPlace || !window.AtlasAPI?.getCurrentWeather) {
    return {
      label: "현재 위치 날씨",
      value: "위치 권한 필요",
      summary: "브라우저 위치 권한을 허용하면 현재 위치 날씨를 표시해요.",
      detail: "-"
    };
  }

  const weather = await AtlasAPI.getCurrentWeather(gpsPlace);

  return {
    label: weather.label || "현재 위치 날씨",
    value: weather.value || "확인 대기",
    summary: "브라우저 현재 위치 기준 날씨예요.",
    detail: weather.value || "-"
  };
}
function getBrowserLocationPlace_() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          title: "현재 위치",
          city: "현재 위치",
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
      },
      () => {
        resolve(null);
      },
      {
        enableHighAccuracy: false,
        timeout: 5000,
        maximumAge: 10 * 60 * 1000
      }
    );
  });
}
async function refreshWeatherStatusItem() {
  try {
    const weather = await getCurrentWeatherStatusItem();

    const labelEl = document.getElementById("atlas-weather-label");
    const valueEl = document.getElementById("atlas-weather-value");

    if (!labelEl || !valueEl) return;

    labelEl.textContent = weather.label || "현재 지역 날씨";
    valueEl.textContent = weather.value || "확인 대기";
  } catch (error) {
    console.warn("Atlas weather background update failed:", error);

    const valueEl = document.getElementById("atlas-weather-value");
    if (valueEl) {
      valueEl.textContent = "확인 대기";
    }
  }
}
  function findCurrentWeatherPlace() {
    const places = STATE.places || [];

    return places.find((place) => {
      const text = [
        place?.title,
        place?.name,
        place?.address,
        place?.query
      ].filter(Boolean).join(" ").toLowerCase();

      if (!Number.isFinite(Number(place?.lat)) || !Number.isFinite(Number(place?.lng))) return false;

      return !(
        text.includes("seoul") ||
        text.includes("incheon") ||
        text.includes("korea") ||
        text.includes("서울") ||
        text.includes("인천") ||
        text.includes("한국") ||
        text.includes("대한민국")
      );
    }) || places.find((place) =>
      Number.isFinite(Number(place?.lat)) &&
      Number.isFinite(Number(place?.lng))
    );
  }

 function renderActions(links) {
  links = links || {};

  document.getElementById("atlas-actions").innerHTML = `
    <div class="atlas-card">
      <div class="atlas-card-inner">
        <div class="atlas-card-label">Quick Actions</div>
        <div class="atlas-actions-grid">
  ${renderQuickActionImageCard({
  label: "Schedule",
  url: links.schedule || "schedule.html",
  imageSrc: "assets/images/quick-actions/schedule.png",
  imageAlt: "Schedule"
})}

          ${renderQuickActionImageCard({
            label: "Boarding Pass",
            url: links.boarding_pass,
            imageSrc: "assets/images/quick-actions/bp.png",
            imageAlt: "Boarding Pass"
          })}

          ${renderQuickActionImageCard({
            label: "Hotel",
            url: links.hotel,
            imageSrc: "assets/images/quick-actions/hotel.png",
            imageAlt: "Hotel"
          })}

          ${renderQuickActionImageCard({
            label: "Documents",
            url: links.documents,
            imageSrc: "assets/images/quick-actions/documents.png",
            imageAlt: "Documents"
          })}

          ${renderQuickActionImageCard({
            label: "Packing",
            url: links.packing,
            imageSrc: "assets/images/quick-actions/packing.png",
            imageAlt: "Packing"
          })}
        </div>
      </div>
    </div>
  `;
}

  function renderQuickActionImageCard(options) {
    const label = options.label || "";
    const url = options.url || "";
    const imageSrc = options.imageSrc || "";
    const imageAlt = options.imageAlt || label;

    if (!url) {
      return `
        <button class="atlas-action-card atlas-action-card-image is-disabled" disabled>
          <img class="atlas-action-card-visual" src="${escapeHtml(imageSrc)}" alt="${escapeHtml(imageAlt)}">
        </button>
      `;
    }

    return `
      <a class="atlas-action-card atlas-action-card-image"
         href="${escapeHtml(url)}"
         target="_blank"
         rel="noopener noreferrer"
         aria-label="${escapeHtml(label)}">
        <img class="atlas-action-card-visual" src="${escapeHtml(imageSrc)}" alt="${escapeHtml(imageAlt)}">
      </a>
    `;
  }

  async function initializeMap() {
    let places = [];

    if (window.AtlasAPI && AtlasAPI.getMapPlaces) {
      try {
        places = await AtlasAPI.getMapPlaces();
        console.log("ATLAS MAP PLACES RAW", places);
      } catch (error) {
        console.warn("Failed to load Atlas map places", error);
      }
    }

    if (!places || places.length === 0) {
      places = [
        { id: "home", title: "Seoul", lat: 37.5665, lng: 126.9780, category: "장소" },
        { id: "airport", title: "Incheon Airport", lat: 37.4602, lng: 126.4407, category: "공항" }
      ];
    }

    STATE.places = places;

    await AtlasMaps.initMap({
      elementId: "google-map",
      places: STATE.places
    });
  }

  function bindEvents() {
    document.addEventListener("click", (event) => {
      const button = event.target.closest(".atlas-plan-item[data-place]");
      if (!button) return;
      AtlasMaps.moveTo(button.dataset.place);
    });

    document.addEventListener("input", (event) => {
      if (event.target && event.target.id === "atlas-notes-input") {
        saveAtlasDashboardNote(event.target.value);
      }
    });
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  return { initialize };
})();

window.addEventListener("DOMContentLoaded", () => {
  Atlas.initialize();
});
const ATLAS_SCHEDULE_TYPES = [
  { value: "flight", label: "Flight", icon: "✈️" },
  { value: "hotel", label: "Hotel", icon: "🏨" },
  { value: "train", label: "Train", icon: "🚆" },
  { value: "bus", label: "Bus", icon: "🚌" },
  { value: "activity", label: "Activity", icon: "🎈" },
  { value: "etc", label: "Etc", icon: "✨" }
];

let atlasCurrentScheduleType = "flight";

function openAtlasScheduleTypePicker() {
  closeAtlasScheduleModal();

  const modal = document.createElement("div");
  modal.id = "atlas-schedule-modal";
  modal.className = "atlas-modal-backdrop";
  modal.innerHTML = `
    <div class="atlas-modal atlas-schedule-picker">
      <div class="atlas-modal-header">
        <div>
          <div class="atlas-modal-kicker">Atlas Intake</div>
          <h2>Add Schedule</h2>
        </div>
        <button class="atlas-modal-close" onclick="closeAtlasScheduleModal()">×</button>
      </div>

      <div class="atlas-schedule-type-grid">
        ${ATLAS_SCHEDULE_TYPES.map(type => `
          <button class="atlas-schedule-type-card" onclick="openAtlasScheduleForm('${type.value}')">
            <span class="atlas-schedule-type-icon">${type.icon}</span>
            <span>${type.label}</span>
          </button>
        `).join("")}
      </div>
    </div>
  `;

  document.body.appendChild(modal);
}

function openAtlasScheduleForm(scheduleType) {
  atlasCurrentScheduleType = scheduleType;
  closeAtlasScheduleModal();

  const typeMeta = ATLAS_SCHEDULE_TYPES.find(t => t.value === scheduleType) || ATLAS_SCHEDULE_TYPES[0];

  const modal = document.createElement("div");
  modal.id = "atlas-schedule-modal";
  modal.className = "atlas-modal-backdrop";
  modal.innerHTML = `
    <div class="atlas-modal atlas-schedule-form">
      <div class="atlas-modal-header">
        <div>
          <div class="atlas-modal-kicker">Manual Schedule</div>
          <h2>${typeMeta.icon} ${typeMeta.label}</h2>
        </div>
        <button class="atlas-modal-close" onclick="closeAtlasScheduleModal()">×</button>
      </div>

      <form id="atlas-schedule-form" onsubmit="submitAtlasScheduleForm(event)">
        ${renderAtlasScheduleFields(scheduleType)}

        <div class="atlas-form-actions">
          <button type="button" class="atlas-secondary-btn" onclick="openAtlasScheduleTypePicker()">Back</button>
          <button type="submit" class="atlas-primary-btn">Save Schedule</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(modal);
}

function renderAtlasScheduleFields(type) {
  const commonTop = `
    <label>
      Trip ID
      <input name="tripId" value="trip_turkiye_2026" required />
    </label>

    <label>
      Title
      <input name="title" placeholder="예: TK21 인천 → 이스탄불" required />
    </label>
  `;

  const confirmationNumberField = `
    <label>
      Confirmation Number
      <input name="confirmationNumber" placeholder="예: PNR, 예약번호, 바우처 번호" required />
    </label>
  `;

  const commonBottom = (options = {}) => {
    const showLocation = options.showLocation !== false;

    return `
      ${showLocation ? `
        <label>
          Location
          <input name="location" placeholder="예: ICN, IST, Göreme" />
        </label>
      ` : ""}

      <label>
        Notes
        <textarea name="notes" rows="3" placeholder="준비물, 메모 등을 적어 주세요."></textarea>
      </label>
    `;
  };

  if (type === "flight") {
    return `
      ${commonTop}
      <div class="atlas-form-row">
        <label>Airline<input name="airline" placeholder="Turkish Airlines" /></label>
        <label>Flight No.<input name="number" placeholder="TK21" /></label>
      </div>
      <div class="atlas-form-row">
        <label>Departure<input name="departurePlace" placeholder="ICN" /></label>
        <label>Arrival<input name="arrivalPlace" placeholder="IST" /></label>
      </div>
      <div class="atlas-form-row">
        <label>Departure Time<input name="startAt" type="datetime-local" required /></label>
        <label>Arrival Time<input name="endAt" type="datetime-local" /></label>
      </div>
      ${confirmationNumberField}
      ${commonBottom({ showLocation: false })}
    `;
  }

  if (type === "hotel") {
    return `
      ${commonTop}
      <label>Hotel Name<input name="hotelName" placeholder="Sultan Cave Suites" /></label>
      <div class="atlas-form-row">
        <label>Check-in<input name="startAt" type="datetime-local" required /></label>
        <label>Check-out<input name="endAt" type="datetime-local" required /></label>
      </div>
      <label>Reservation No.<input name="reservationNumber" placeholder="optional" /></label>
      ${commonBottom()}
    `;
  }

  if (type === "train") {
    return `
      ${commonTop}
      <div class="atlas-form-row">
        <label>Operator<input name="operator" placeholder="TCDD" /></label>
        <label>Train No.<input name="number" placeholder="optional" /></label>
      </div>
      <div class="atlas-form-row">
        <label>Departure Station<input name="departurePlace" /></label>
        <label>Arrival Station<input name="arrivalPlace" /></label>
      </div>
      <div class="atlas-form-row">
        <label>Departure Time<input name="startAt" type="datetime-local" required /></label>
        <label>Arrival Time<input name="endAt" type="datetime-local" /></label>
      </div>
      ${confirmationNumberField}
      ${commonBottom({ showLocation: false })}
    `;
  }

  if (type === "bus") {
    return `
      ${commonTop}
      <div class="atlas-form-row">
        <label>Operator<input name="operator" placeholder="Pamukkale" /></label>
        <label>Bus No.<input name="number" placeholder="optional" /></label>
      </div>
      <div class="atlas-form-row">
        <label>Departure Stop<input name="departurePlace" /></label>
        <label>Arrival Stop<input name="arrivalPlace" /></label>
      </div>
      <div class="atlas-form-row">
        <label>Departure Time<input name="startAt" type="datetime-local" required /></label>
        <label>Arrival Time<input name="endAt" type="datetime-local" /></label>
      </div>
      ${confirmationNumberField}
      ${commonBottom({ showLocation: false })}
    `;
  }

  if (type === "activity") {
    return `
      ${commonTop}
      <label>Provider<input name="provider" placeholder="optional" /></label>
      <div class="atlas-form-row">
        <label>Start Time<input name="startAt" type="datetime-local" required /></label>
        <label>End Time<input name="endAt" type="datetime-local" /></label>
      </div>
      <label>Meeting Point<input name="meetingPoint" placeholder="optional" /></label>
      ${confirmationNumberField}
      ${commonBottom({ showLocation: false })}
    `;
  }

  return `
    ${commonTop}
    <div class="atlas-form-row">
      <label>Start Time<input name="startAt" type="datetime-local" required /></label>
      <label>End Time<input name="endAt" type="datetime-local" /></label>
    </div>
    ${commonBottom()}
  `;
}

function collectAtlasSchedulePayload(form) {
  const data = new FormData(form);
  const raw = Object.fromEntries(data.entries());

  return {
    type: "schedule",
    scheduleType: atlasCurrentScheduleType,
    tripId: raw.tripId,
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

async function submitAtlasScheduleForm(event) {
  event.preventDefault();

  const form = event.target;
  const payload = collectAtlasSchedulePayload(form);

  try {
    setAtlasScheduleSaving(true);

    const result = await sendAtlasSchedulePayload(payload);

    closeAtlasScheduleModal();

    if (typeof renderStatus === "function") {
      renderStatus({
        ok: true,
        message: result.message || "Schedule saved to Atlas."
      });
    }

    if (result.timelineEvent && typeof renderTimeline === "function") {
      renderTimeline([result.timelineEvent]);
    }
  } catch (error) {
    console.error(error);
    alert("Schedule 저장에 실패했어요: " + error.message);
  } finally {
    setAtlasScheduleSaving(false);
  }
}

function setAtlasScheduleSaving(isSaving) {
  const btn = document.querySelector("#atlas-schedule-form .atlas-primary-btn");
  if (!btn) return;
  btn.disabled = isSaving;
  btn.textContent = isSaving ? "Saving..." : "Save Schedule";
}

async function sendAtlasSchedulePayload(payload) {
  const endpoint =
    window.ATLAS_API_URL ||
    window.ATLAS_WEB_APP_URL ||
    "";

  if (!endpoint) {
    throw new Error("ATLAS_API_URL 또는 ATLAS_WEB_APP_URL이 설정되어 있지 않아요.");
  }

  const response = await fetch(endpoint, {
    method: "POST",
    body: JSON.stringify({
      action: "create_schedule",
      payload
    })
  });

  const text = await response.text();

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("서버 응답을 JSON으로 읽을 수 없어요: " + text);
  }

if (!json.ok) {
  console.error("Atlas schedule server error:", json);
  throw new Error(json.error || json.message || JSON.stringify(json));
}

  return json;
}

function closeAtlasScheduleModal() {
  const modal = document.getElementById("atlas-schedule-modal");
  if (modal) modal.remove();
}