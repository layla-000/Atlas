const AtlasCapture = (() => {
  function initialize() { render(); bindEvents(); }

  function render() {
    const root = document.getElementById("atlas-overlay-root");
    if (!root) return;
    root.innerHTML = `
      <div class="atlas-capture" id="atlas-capture">
        <div class="atlas-capture-menu" id="atlas-capture-menu">
          <button type="button" class="atlas-capture-item" id="atlas-schedule-button"><span class="atlas-capture-icon">🗓️</span><span>Schedule</span></button>
          <a class="atlas-capture-item" href="expenses.html"><span class="atlas-capture-icon">₩</span><span>Expense</span></a>
          <a class="atlas-capture-item" href="packing.html"><span class="atlas-capture-icon">🧳</span><span>Packing</span></a>
        </div>
        <button id="atlas-capture-button" class="atlas-capture-button" aria-label="Open Atlas Capture">+</button>
      </div>`;
  }

  function bindEvents() {
    const button = document.getElementById("atlas-capture-button");
    const menu = document.getElementById("atlas-capture-menu");
    const scheduleButton = document.getElementById("atlas-schedule-button");
    button?.addEventListener("click", () => { menu.classList.toggle("is-open"); button.classList.toggle("is-open"); });
    scheduleButton?.addEventListener("click", () => {
      menu.classList.remove("is-open"); button.classList.remove("is-open");
      if (typeof openAtlasScheduleTypePicker === "function") openAtlasScheduleTypePicker();
    });
  }

  return { initialize };
})();
window.AtlasCapture = AtlasCapture;
