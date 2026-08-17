const Atlas = (() => {
  const STATE = {
    trip: null,
    trips: [],
    tripId: "",
    places: [],
    brief: null,
    travelStatus: null,
    dashboardNoteSaveTimer: null,
    dashboardNoteLoadedFromBackend: false,
    initialized: false,
    role: "none"
  };

  async function initialize() {
    console.log("Atlas initializing...");

    await AtlasAuth.requireSession();
    STATE.trips = await AtlasAPI.getAvailableTrips();
    const savedTripId = localStorage.getItem("atlas.activeTripId") || "";
    const defaultTripId = window.AtlasConfig?.atlas?.defaultTripId || "trip_turkiye_2026";
    const selected = STATE.trips.find((trip) => trip.id === savedTripId)
      || STATE.trips.find((trip) => trip.id === defaultTripId)
      || STATE.trips[0]
      || null;
    STATE.tripId = selected?.id || defaultTripId;
    STATE.trip = selected || await AtlasAPI.getCurrentTrip(STATE.tripId);
    STATE.role = selected?.role || await AtlasAPI.getRole(STATE.tripId);

    if (STATE.role === "none") {
      document.getElementById("atlas-app").innerHTML = `
        <main style="max-width:720px;margin:80px auto;padding:24px;color:#f2f4f3;font-family:var(--atlas-font)">
          <h1>ATLAS</h1>
          <p style="color:#c0c0c0;line-height:1.7">로그인은 됐지만 이 여행을 볼 권한이 아직 없어요. Owner가 Viewer 권한을 추가하면 다시 열어 주세요.</p>
          <button class="atlas-auth-logout" onclick="AtlasAuth.signOut()">로그아웃</button>
        </main>`;
      return;
    }

    render();
    bindEvents();

    if (isTravelTrip()) {
      if (STATE.role === "owner") await refreshDashboardNote();
      await initializeMap();
      await refreshAtlasBrief();
      await refreshTravelStatus();
      if (window.AtlasCapture && STATE.role === "owner") AtlasCapture.initialize();
    } else {
      await refreshTodayPlan([]);
      const links = await AtlasAPI.getDriveLinks(STATE.tripId).catch(() => ({}));
      renderActions(links);
    }

    STATE.initialized = true;
    console.log("Atlas ready.");
  }

  function render() {
    renderHeader();
    document.getElementById("atlas-dashboard").classList.toggle("is-compact-trip", !isTravelTrip());
    renderTimeline([]);
    renderActions({});

    if (isTravelTrip()) {
      renderMap();
      renderBriefPlaceholder();
      void renderStatus({});
      if (STATE.role === "owner") renderNotes();
      else document.getElementById("atlas-notes").innerHTML = "";
    } else {
      ["atlas-brief", "atlas-map", "atlas-status", "atlas-notes"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = "";
      });
    }
  }

  function isTravelTrip() {
    return STATE.tripId === "trip_turkiye_2026";
  }

  function renderHeader() {
    const options = STATE.trips.map((trip) => `
      <option value="${escapeHtml(trip.id)}" ${trip.id === STATE.tripId ? "selected" : ""}>${escapeHtml(trip.name || trip.id)}</option>
    `).join("");

    document.getElementById("atlas-header").innerHTML = `
      <div class="atlas-header-row">
        <div>
          <h1 class="atlas-title">ATLAS</h1>
          <p class="atlas-subtitle">${escapeHtml(STATE.trip?.name || "Travel Companion")} · ${STATE.role === "owner" ? "Owner" : "Viewer"}</p>
        </div>
        <div class="atlas-header-controls">
          <label class="atlas-trip-picker" aria-label="Trip 선택">
            <span>Trip</span>
            <select id="atlas-trip-select">${options}</select>
          </label>
          <button class="atlas-auth-logout" onclick="AtlasAuth.signOut()">로그아웃</button>
        </div>
      </div>
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

    const brief = await AtlasAPI.getBrief(STATE.tripId);
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
      const params = { tripId: STATE.tripId };
      if (STATE.trip?.start_date) params.startDate = STATE.trip.start_date;
      if (STATE.trip?.end_date) params.endDate = STATE.trip.end_date;
      const result = await AtlasAPI.getFullSchedule(params);

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

    const travelStatus = await AtlasAPI.getTravelStatus(STATE.tripId);
    STATE.travelStatus = travelStatus || {};
  }

  function getOrCreateNotesContainer() {
    let container = document.getElementById("atlas-notes");
    if (container) return container;

    container = document.createElement("section");
    container.id = "atlas-notes";

    const dashboardGrid = document.querySelector(".atlas-dashboard-grid");
    if (dashboardGrid) {
      dashboardGrid.appendChild(container);
      return container;
    }

    const main = document.querySelector("main") || document.body;
    main.appendChild(container);
    return container;
  }

  function renderNotes(noteValue) {
    const savedNote = noteValue == null ? "" : String(noteValue || "");
    const notesContainer = getOrCreateNotesContainer();
    notesContainer.innerHTML = `
      <div class="atlas-card">
        <div class="atlas-card-inner">
          <div class="atlas-card-label">Travel Notes · Private</div>
          <textarea id="atlas-notes-input" class="atlas-notes-input" placeholder="개인 메모를 남겨두세요.">${escapeHtml(savedNote)}</textarea>
          <div id="atlas-notes-meta" class="atlas-notes-meta">Layla Hub에서 불러오는 중이에요.</div>
        </div>
      </div>`;
  }

  async function refreshDashboardNote() {
    if (STATE.role !== "owner") return;
    try {
      const result = await AtlasAPI.getDashboardNote({ tripId: STATE.tripId });
      const input = document.getElementById("atlas-notes-input");
      if (input) input.value = result?.note || "";
      setAtlasNotesMeta("Layla Hub에 자동 저장돼요.");
    } catch (error) {
      console.warn("Atlas note load failed", error);
      setAtlasNotesMeta("메모를 불러오지 못했어요.");
    }
  }

  function saveAtlasDashboardNote(value) {
    if (STATE.role !== "owner") return;
    const note = String(value || "");
    setAtlasNotesMeta("저장 중이에요…");
    window.clearTimeout(STATE.dashboardNoteSaveTimer);
    STATE.dashboardNoteSaveTimer = window.setTimeout(async () => {
      try {
        await AtlasAPI.saveDashboardNote({ tripId: STATE.tripId, note });
        setAtlasNotesMeta("Layla Hub에 저장됐어요.");
      } catch (error) {
        console.warn("Atlas note save failed", error);
        setAtlasNotesMeta("저장에 실패했어요. 연결을 확인해 주세요.");
      }
    }, 500);
  }

  function setAtlasNotesMeta(message) {
    const meta = document.getElementById("atlas-notes-meta");
    if (meta) meta.textContent = message;
  }

  function renderMap() {
    document.getElementById("atlas-map").innerHTML = `
      <div class="atlas-card">
        <div class="atlas-card-inner">
          <div style="display:flex;align-items:center;gap:10px">
            <div class="atlas-card-label" style="margin-bottom:14px">Live Map</div>
            ${STATE.role === "owner" ? `<button class="atlas-location-share" onclick="Atlas.updateCurrentLocation()">현재 위치 공유</button>` : ""}
          </div>
          <div id="atlas-shared-location" class="atlas-shared-location"></div>
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
  let place = null;
  try {
    const state = await AtlasAPI.getTripState(STATE.tripId);
    if (state && Number.isFinite(Number(state.current_lat)) && Number.isFinite(Number(state.current_lng))) {
      place = {
        title: state.current_city || "현재 위치",
        city: state.current_city || "현재 위치",
        lat: Number(state.current_lat),
        lng: Number(state.current_lng)
      };
      const shared = document.getElementById("atlas-shared-location");
      if (shared) shared.textContent = `현재 공유 위치 · ${place.city}`;
    }
  } catch (error) {
    console.warn("Atlas shared location load failed", error);
  }

  if (!place && STATE.role === "owner") place = await getBrowserLocationPlace_();
  if (!place) {
    return { label: "현재 위치 날씨", value: "위치 미공유", summary: "Owner가 현재 위치를 공유하면 표시해요.", detail: "-" };
  }

  const weather = await AtlasAPI.getCurrentWeather(place);
  return { label: weather.label || "현재 위치 날씨", value: weather.value || "확인 대기", summary: "공유된 현재 위치 기준 날씨예요.", detail: weather.value || "-" };
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
  const tripQuery = `?trip=${encodeURIComponent(STATE.tripId)}`;
  const cards = [
    renderQuickActionImageCard({ label: "Schedule", url: `schedule.html${tripQuery}`, imageSrc: "assets/images/quick-actions/schedule.png", imageAlt: "Schedule" })
  ];

  if (STATE.role === "owner") {
    cards.push(
      renderQuickActionImageCard({ label: "Expenses", url: `expenses.html${tripQuery}`, imageSrc: "assets/images/quick-actions/money.png", imageAlt: "Expenses" }),
      renderQuickActionImageCard({ label: "Documents", url: links.documents || "", imageSrc: "assets/images/quick-actions/documents.png", imageAlt: "Documents" }),
      renderQuickActionImageCard({ label: "Packing", url: `packing.html${tripQuery}`, imageSrc: "assets/images/quick-actions/packing.png", imageAlt: "Packing" })
    );

    if (isTravelTrip()) {
      cards.push(
        renderQuickActionImageCard({ label: "Boarding Pass", url: links.boarding_pass || "", imageSrc: "assets/images/quick-actions/bp.png", imageAlt: "Boarding Pass" }),
        renderQuickActionImageCard({ label: "Hotel", url: links.hotel || "", imageSrc: "assets/images/quick-actions/hotel.png", imageAlt: "Hotel" })
      );
    }
  }

  document.getElementById("atlas-actions").innerHTML = `
    <div class="atlas-card"><div class="atlas-card-inner">
      <div class="atlas-card-label">Quick Actions</div>
      <div class="atlas-actions-grid">${cards.join("")}</div>
    </div></div>`;
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
        places = await AtlasAPI.getMapPlaces(STATE.tripId);
        const sharedState = await AtlasAPI.getTripState(STATE.tripId);
        if (sharedState && Number.isFinite(Number(sharedState.current_lat)) && Number.isFinite(Number(sharedState.current_lng))) {
          places = [{
            id: "atlas-current-location",
            title: sharedState.current_city || "현재 위치",
            address: "Owner가 공유한 현재 위치",
            lat: Number(sharedState.current_lat),
            lng: Number(sharedState.current_lng),
            category: "현재 위치",
            type: "shared_current",
            source: "Layla Hub"
          }, ...places];
        }
        console.log("ATLAS MAP PLACES RAW", places);
      } catch (error) {
        console.warn("Failed to load Atlas map places", error);
      }
    }

    if (!places || places.length === 0) {
      places = [{ id: "istanbul", title: "Istanbul", lat: 41.0082, lng: 28.9784, category: "기본 위치", type: "default" }];
    }

    STATE.places = places;

    await AtlasMaps.initMap({
      elementId: "google-map",
      places: STATE.places
    });
  }

  function bindEvents() {
    document.getElementById("atlas-trip-select")?.addEventListener("change", (event) => {
      const nextTripId = String(event.target.value || "").trim();
      if (!nextTripId || nextTripId === STATE.tripId) return;
      localStorage.setItem("atlas.activeTripId", nextTripId);
      window.location.reload();
    });

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

  async function updateCurrentLocation() {
    if (STATE.role !== "owner") return;
    const place = await getBrowserLocationPlace_();
    if (!place) { alert("브라우저 위치 권한을 허용해 주세요."); return; }
    let city = "현재 위치";
    try {
      if (window.google?.maps) {
        const geocoder = new google.maps.Geocoder();
        const result = await geocoder.geocode({ location: { lat: place.lat, lng: place.lng } });
        const components = result?.results?.[0]?.address_components || [];
        const locality = components.find((c) => c.types.includes("locality")) || components.find((c) => c.types.includes("administrative_area_level_1"));
        city = locality?.long_name || result?.results?.[0]?.formatted_address || city;
      }
    } catch (error) { console.warn("Atlas reverse geocode failed", error); }
    await AtlasAPI.updateTripState({ tripId: STATE.tripId, city, lat: place.lat, lng: place.lng });
    const shared = document.getElementById("atlas-shared-location");
    if (shared) shared.textContent = `현재 공유 위치 · ${city}`;
    await refreshWeatherStatusItem();
    alert("현재 위치를 Atlas에 공유했어요.");
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  return { initialize, updateCurrentLocation };
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
  setupAtlasScheduleDateTimeRules(modal);
}

function setupAtlasScheduleDateTimeRules(container) {
  const startInput = container?.querySelector('input[name="startAt"]');
  const endInput = container?.querySelector('input[name="endAt"]');
  if (!startInput) return;

  [startInput, endInput].filter(Boolean).forEach((input) => {
    input.step = "300";
    input.addEventListener("change", () => {
      input.value = normalizeAtlasFiveMinuteValue(input.value);
      syncAtlasScheduleEndDate(startInput, endInput);
    });
  });

  syncAtlasScheduleEndDate(startInput, endInput);
}

function normalizeAtlasFiveMinuteValue(value) {
  if (!value) return "";
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return value;
  const [, year, month, day, hour, minute] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), 0, 0);
  date.setMinutes(Math.round(date.getMinutes() / 5) * 5, 0, 0);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function syncAtlasScheduleEndDate(startInput, endInput) {
  if (!startInput || !endInput || !startInput.value) return;
  const startDate = startInput.value.slice(0, 10);
  endInput.min = `${startDate}T00:00`;
  if (endInput.value && endInput.value.slice(0, 10) < startDate) {
    const endTime = endInput.value.slice(11, 16) || startInput.value.slice(11, 16) || "00:00";
    endInput.value = `${startDate}T${endTime}`;
  }
}

function normalizeAtlasScheduleFormDateTimes(form) {
  const startInput = form?.querySelector('input[name="startAt"]');
  const endInput = form?.querySelector('input[name="endAt"]');
  if (!startInput) return;
  startInput.value = normalizeAtlasFiveMinuteValue(startInput.value);
  if (endInput) endInput.value = normalizeAtlasFiveMinuteValue(endInput.value);
  syncAtlasScheduleEndDate(startInput, endInput);
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
        <label>Departure Time<input name="startAt" type="datetime-local" step="300" required /></label>
        <label>Arrival Time<input name="endAt" type="datetime-local" step="300" /></label>
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
        <label>Check-in<input name="startAt" type="datetime-local" step="300" required /></label>
        <label>Check-out<input name="endAt" type="datetime-local" step="300" required /></label>
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
        <label>Departure Time<input name="startAt" type="datetime-local" step="300" required /></label>
        <label>Arrival Time<input name="endAt" type="datetime-local" step="300" /></label>
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
        <label>Departure Time<input name="startAt" type="datetime-local" step="300" required /></label>
        <label>Arrival Time<input name="endAt" type="datetime-local" step="300" /></label>
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
        <label>Start Time<input name="startAt" type="datetime-local" step="300" required /></label>
        <label>End Time<input name="endAt" type="datetime-local" step="300" /></label>
      </div>
      <label>Meeting Point<input name="meetingPoint" placeholder="optional" /></label>
      ${confirmationNumberField}
      ${commonBottom({ showLocation: false })}
    `;
  }

  return `
    ${commonTop}
    <div class="atlas-form-row">
      <label>Start Time<input name="startAt" type="datetime-local" step="300" required /></label>
      <label>End Time<input name="endAt" type="datetime-local" step="300" /></label>
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
  normalizeAtlasScheduleFormDateTimes(form);
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
  if (!window.AtlasAPI?.createSchedule) throw new Error("Atlas Supabase API가 준비되지 않았어요.");
  return AtlasAPI.createSchedule(payload);
}

function closeAtlasScheduleModal() {
  const modal = document.getElementById("atlas-schedule-modal");
  if (modal) modal.remove();
}