const Atlas = (() => {

    const STATE = {

        trip: null,

        places: [],

        initialized: false

    };



    async function initialize() {

    console.log("Atlas initializing...");

 render();
bindEvents();
await initializeMap();
await refreshAtlasBrief();
await refreshTravelStatus();
AtlasCapture.initialize();

    STATE.initialized = true;

    console.log("Atlas ready.");

}


    function render() {

        renderHeader();

        renderBrief();

        renderMap();

        renderTimeline();

        renderStatus();

        renderActions();

    }



    function renderHeader() {

        document.getElementById("atlas-header").innerHTML = `

            <h1 class="atlas-title">ATLAS</h1>

            <p class="atlas-subtitle">

                Travel Operating System

            </p>

        `;

    }



    function renderBrief() {

        document.getElementById("atlas-brief").innerHTML = `

            <div class="atlas-card">

                <div class="atlas-card-inner">

                    <div class="atlas-card-label">

                        Atlas Brief

                    </div>

                    <h2 class="atlas-card-title">

                        좋은 아침이에요.

                    </h2>

                    <p class="atlas-card-text">

                        오늘은 Atlas Dashboard의 첫 번째 버전입니다.

                        앞으로 이곳에는 일정, 날씨, 추천,

                        위험 분석 등이 자연스럽게 하나의 브리핑으로

                        생성됩니다.

                    </p>

                </div>

            </div>

        `;

    }

async function refreshAtlasBrief() {
  if (!window.AtlasAPI) {
    return;
  }

  const brief = await AtlasAPI.getBrief();
  const actions = brief.actions && brief.actions.length > 0
    ? `<ul>${brief.actions.slice(0, 3).map((action) => `<li>${action}</li>`).join("")}</ul>`
    : "";

  document.getElementById("atlas-brief").innerHTML = `
    <span class="eyebrow">Atlas Brief</span>
    <h2>${brief.title || "좋은 아침이에요."}</h2>
    <p>${brief.summary || "오늘의 브리핑을 준비하고 있어요."}</p>
    ${actions}
  `;
}
async function refreshTravelStatus() {
  if (!window.AtlasAPI) {
    return;
  }

  const travelStatus = await AtlasAPI.getTravelStatus();
  const target = document.getElementById("travel-status");

  if (!target) {
    return;
  }

  const items = travelStatus.items && travelStatus.items.length > 0
    ? travelStatus.items.map((item) => `
      <li>
        <span>${item.label}</span>
        <strong>${item.value}</strong>
      </li>
    `).join("")
    : "<li><span>Status</span><strong>대기 중</strong></li>";

  target.innerHTML = `
    <span class="eyebrow">Travel Status</span>
    <h3>${travelStatus.title || "Travel Status"}</h3>
    <p>${travelStatus.summary || "여행 준비 상태를 확인하고 있어요."}</p>
    <ul>
      ${items}
    </ul>
  `;
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


    function renderTimeline() {

        document.getElementById("atlas-plan").innerHTML = `

            <div class="atlas-card">

                <div class="atlas-card-inner">

                    <div class="atlas-card-label">

                        Today's Plan

                    </div>

                    <div class="atlas-plan-list">

                        <button class="atlas-plan-item"

                                data-place="home">

                            <div class="atlas-plan-time">

                                09:00

                            </div>

                            <div>

                                <span class="atlas-plan-name">

                                    Leave Home

                                </span>

                                <span class="atlas-plan-location">

                                    Seoul

                                </span>

                            </div>

                        </button>

                        <button class="atlas-plan-item"

                                data-place="airport">

                            <div class="atlas-plan-time">

                                11:10

                            </div>

                            <div>

                                <span class="atlas-plan-name">

                                    Check-in

                                </span>

                                <span class="atlas-plan-location">

                                    ICN Terminal 2

                                </span>

                            </div>

                        </button>

                    </div>

                </div>

            </div>

        `;

    }



    function renderStatus() {

        document.getElementById("atlas-status").innerHTML = `

            <div class="atlas-card">

                <div class="atlas-card-inner">

                    <div class="atlas-card-label">

                        Travel Status

                    </div>

                    <div class="atlas-status-grid">

                        <div class="atlas-status-item">

                            Flight

                            <span class="atlas-status-value">

                                Ready

                            </span>

                        </div>

                        <div class="atlas-status-item">

                            Passport

                            <span class="atlas-status-value">

                                Valid

                            </span>

                        </div>

                        <div class="atlas-status-item">

                            Weather

                            <span class="atlas-status-value">

                                Sunny

                            </span>

                        </div>

                    </div>

                </div>

            </div>

        `;

    }



    function renderActions() {

        document.getElementById("atlas-actions").innerHTML = `

            <div class="atlas-card">

                <div class="atlas-card-inner">

                    <div class="atlas-card-label">

                        Quick Actions

                    </div>

                    <div class="atlas-actions-grid">

                        <button class="atlas-action-button">

                            Boarding Pass

                        </button>

                        <button class="atlas-action-button">

                            Hotel

                        </button>

                        <button class="atlas-action-button">

                            Documents

                        </button>

                        <button class="atlas-action-button">

                            Packing

                        </button>

                    </div>

                </div>

            </div>

        `;

    }

async function renderMemoryPanel() {
  const target = document.getElementById("atlas-status");

  if (!target || !window.AtlasMemory) {
    return;
  }

  const snapshots = await AtlasMemory.fetchSnapshots();
  const latest = snapshots[0];

  if (!latest) {
    target.innerHTML += `
      <div class="atlas-memory-panel">
        <h3>Atlas Memory</h3>
        <p>아직 저장된 Memory Snapshot이 없어요.</p>
      </div>
    `;
    return;
  }

  const entityCount = latest.entities ? latest.entities.length : 0;
  const relationshipCount = latest.relationships ? latest.relationships.length : 0;
  const fileName = latest.document && latest.document.fileName
    ? latest.document.fileName
    : "Unknown document";

  target.innerHTML += `
    <div class="atlas-memory-panel">
      <h3>Atlas Memory</h3>
      <p><strong>${latest.tripName || "Trip"}</strong></p>
      <p>${fileName}</p>
      <p>Entities: ${entityCount} · Relationships: ${relationshipCount}</p>
      <p>Status: ${latest.status || "ready"}</p>
    </div>
  `;
}

    async function initializeMap() {

        STATE.places = [

            {

                id: "home",

                title: "Home",

                lat: 37.5665,

                lng: 126.9780

            },

            {

                id: "airport",

                title: "Incheon Airport",

                lat: 37.4602,

                lng: 126.4407

            }

        ];



        await AtlasMaps.initMap({

            elementId: "google-map",

            places: STATE.places

        });

    }



    function bindEvents() {

        document.addEventListener("click", (event) => {

            const button = event.target.closest(".atlas-plan-item");

            if (!button) {

                return;

            }

            AtlasMaps.moveTo(button.dataset.place);

        });

    }



    return {

        initialize

    };

})();



window.addEventListener(

    "DOMContentLoaded",

    () => {

        Atlas.initialize();

    }

);