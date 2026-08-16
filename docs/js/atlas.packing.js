const AtlasPacking = (() => {
  const DEFAULT_TRIP_ID = () => window.AtlasConfig?.atlas?.defaultTripId || "trip_turkiye_2026";
  const TRIP_ID = () => {
    const fromUrl = new URLSearchParams(window.location.search).get("trip");
    return String(fromUrl || DEFAULT_TRIP_ID()).trim() || DEFAULT_TRIP_ID();
  };
  let items = [];

  async function initialize() {
    await AtlasAuth.requireSession();
    const tripId = TRIP_ID();
    const [role, trip] = await Promise.all([
      AtlasAPI.getRole(tripId),
      AtlasAPI.getCurrentTrip(tripId).catch(() => null)
    ]);
    renderTripHeading(trip, tripId);
    if (role !== "owner") {
      document.getElementById("packing-app").innerHTML = '<div class="utility-empty">Packing은 Owner 전용이에요.</div>';
      return;
    }
    bind();
    await reload();
  }

  function renderTripHeading(trip, tripId) {
    const title = document.getElementById("packing-trip-name");
    if (title) title.textContent = `${trip?.name || tripId} · Owner only`;
  }

  function bind() {
    document.getElementById("packing-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.target);
      const item = String(form.get("item") || "").trim();
      if (!item) return;
      await AtlasAPI.addPackingItem({ tripId: TRIP_ID(), category: form.get("category"), item, quantity: form.get("quantity") });
      event.target.reset();
      event.target.querySelector('[name="quantity"]').value = "1";
      await reload();
    });
  }

  async function reload() {
    items = await AtlasAPI.getPackingItems(TRIP_ID());
    render();
  }

  function render() {
    const total = items.length;
    const done = items.filter((x) => x.is_checked).length;
    document.getElementById("packing-progress").textContent = `${done} / ${total} 완료`;
    const groups = new Map();
    items.forEach((item) => {
      const key = item.category || "기타";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    });
    document.getElementById("packing-list").innerHTML = total ? [...groups.entries()].map(([category, rows]) => `
      <section class="utility-group"><h2>${escapeHtml(category)}</h2>
      ${rows.map((row) => `<div class="utility-row ${row.is_checked ? "is-done" : ""}">
        <label><input type="checkbox" ${row.is_checked ? "checked" : ""} onchange="AtlasPacking.toggle('${row.id}', this.checked)"><span>${escapeHtml(row.item)}${Number(row.quantity) > 1 ? ` × ${row.quantity}` : ""}</span></label>
        <button onclick="AtlasPacking.remove('${row.id}')">삭제</button>
      </div>`).join("")}</section>`).join("") : '<div class="utility-empty">아직 Packing 항목이 없어요.</div>';
  }

  async function toggle(id, checked) { await AtlasAPI.updatePackingItem(id, { is_checked: checked }); await reload(); }
  async function remove(id) { if (!confirm("이 항목을 삭제할까요?")) return; await AtlasAPI.deletePackingItem(id); await reload(); }
  function escapeHtml(v){return String(v||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");}
  return { initialize, toggle, remove };
})();
window.addEventListener("DOMContentLoaded", AtlasPacking.initialize);
