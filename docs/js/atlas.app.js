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
    renderStatus({});
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
    renderStatus({
      time_card: brief.time_card || {},
      next_transport: brief.next_transport || {}
    });
    renderActions(brief.drive_links || {});
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

  function renderStatus(data) {
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
              다음 이동
              <span class="atlas-status-value">${escapeHtml(transport.departure_time || "대기 중")}</span>
            </div>
          </div>

          <div class="atlas-next-transport">
            <strong>${escapeHtml(transport.title || "예정된 교통편이 아직 없어요.")}</strong>
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

  function renderActions(links) {
    document.getElementById("atlas-actions").innerHTML = `
      <div class="atlas-card">
        <div class="atlas-card-inner">
          <div class="atlas-card-label">Quick Actions</div>
          <div class="atlas-actions-grid">
            ${renderDriveLink("Boarding Pass", links.boarding_pass)}
            ${renderDriveLink("Hotel", links.hotel)}
            ${renderDriveLink("Documents", links.documents)}
            ${renderDriveLink("Packing", links.packing)}
          </div>
        </div>
      </div>
    `;
  }

  function renderDriveLink(label, url) {
    if (!url) {
      return `<button class="atlas-action-button is-disabled" disabled>${escapeHtml(label)}</button>`;
    }

    return `
      <a class="atlas-action-button" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">
        ${escapeHtml(label)}
      </a>
    `;
  }

  async function initializeMap() {
    STATE.places = [
      { id: "home", title: "Home", lat: 37.5665, lng: 126.9780 },
      { id: "airport", title: "Incheon Airport", lat: 37.4602, lng: 126.4407 }
    ];

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