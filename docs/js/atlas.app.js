const Atlas = (() => {
  const STATE = {
    trip: null,
    places: [],
    brief: null,
    travelStatus: null,
    initialized: false
  };

  async function initialize() {
    console.log("Atlas initializing...");

    render();
    bindEvents();
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
    renderBriefPlaceholder();
    renderMap();
    renderTimeline([]);
    void renderStatus({});
    renderActions({});
  }

  function renderHeader() {
    document.getElementById("atlas-header").innerHTML = `
      <h1 class="atlas-title">ATLAS</h1>
      <p class="atlas-subtitle">Travel Operating System</p>
    `;
  }

  function renderBriefPlaceholder() {
    document.getElementById("atlas-brief").innerHTML = `
      <div class="atlas-card">
        <div class="atlas-card-inner">
          <div class="atlas-card-label">Atlas Brief</div>
          <h2 class="atlas-card-title">좋은 아침이에요.</h2>
          <p class="atlas-card-text">오늘의 브리핑을 준비하고 있어요.</p>
        </div>
      </div>
    `;
  }

  async function refreshAtlasBrief() {
    if (!window.AtlasAPI) return;

    const brief = await AtlasAPI.getBrief();
    console.log("ATLAS BRIEF RAW", brief);
    STATE.brief = brief || {};

    const actions = brief.actions && brief.actions.length > 0
      ? `<ul>${brief.actions.slice(0, 3).map((action) => `<li>${escapeHtml(action)}</li>`).join("")}</ul>`
      : "";

    document.getElementById("atlas-brief").innerHTML = `
      <div class="atlas-card">
        <div class="atlas-card-inner">
          <div class="atlas-card-label">Atlas Brief</div>
          <h2 class="atlas-card-title">${escapeHtml(brief.title || "좋은 아침이에요.")}</h2>
          <p class="atlas-card-text">${escapeHtml(brief.summary || "오늘의 브리핑을 준비하고 있어요.")}</p>
          ${actions}
        </div>
      </div>
    `;

    renderTimeline(brief.today_plan || []);
await renderStatus({
  time_card: brief.time_card || {},
  next_transport: brief.next_transport || {}
});
    renderActions(brief.quick_links || brief.drive_links || {});
  }

  async function refreshTravelStatus() {
    if (!window.AtlasAPI) return;

    const travelStatus = await AtlasAPI.getTravelStatus();
    STATE.travelStatus = travelStatus || {};
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
    const planItems = items && items.length > 0
      ? items.map((item) => `
        <div class="atlas-plan-item">
          <div class="atlas-plan-time">${escapeHtml(item.time || "--:--")}</div>
          <div>
            <span class="atlas-plan-name">${escapeHtml(item.title || item.label || "오늘 일정")}</span>
            <span class="atlas-plan-location">${escapeHtml(item.location || item.label || "")}</span>
          </div>
        </div>
      `).join("")
      : `
        <div class="atlas-plan-item">
          <div class="atlas-plan-time">--:--</div>
          <div>
            <span class="atlas-plan-name">오늘 표시할 확정 일정이 아직 없어요.</span>
            <span class="atlas-plan-location">Atlas가 문서를 더 읽으면 여기에 표시해요.</span>
          </div>
        </div>
      `;

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
   async function renderStatus(data) {
    data = data || {};

    const timeCard = data.time_card || {};
    const transport = data.next_transport || {};
    const weather = await getCurrentWeatherStatusItem();

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
              ${escapeHtml(weather.label)}
              <span class="atlas-status-value">${escapeHtml(weather.value)}</span>
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
  }

  async function getCurrentWeatherStatusItem() {
    const currentPlace = findCurrentWeatherPlace();

    if (!currentPlace || !window.AtlasAPI?.getCurrentWeather) {
      return {
        label: "현재 지역 날씨",
        value: "대기 중",
        summary: "현재 지역 날씨를 준비하고 있어요.",
        detail: "-"
      };
    }

    const weather = await AtlasAPI.getCurrentWeather(currentPlace);

    return {
      label: weather.label || "현재 지역 날씨",
      value: weather.value || "확인 불가",
      summary: `${weather.label || "현재 지역"} 기준 날씨예요.`,
      detail: weather.value || "-"
    };
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