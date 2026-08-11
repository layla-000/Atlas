const AtlasLegacyMigration = (() => {
  const LEGACY_ENDPOINT = "https://script.google.com/macros/s/AKfycbyC-kDrY0tgvLgZSvhryUHQy1ZPr11ySnH40ilJGsSJCn1fZb5YxPiFIW0ym3ElisUZGQ/exec";
  const TRIP_ID = "trip_turkiye_2026";

  async function initialize() {
    await AtlasAuth.requireSession();
    const role = await AtlasAPI.getRole(TRIP_ID);
    if (role !== "owner") {
      document.getElementById("migration-status").textContent = "Owner 전용 도구예요.";
      document.getElementById("migration-button").disabled = true;
    }
  }

  async function run() {
    const button = document.getElementById("migration-button");
    const status = document.getElementById("migration-status");
    button.disabled = true;
    status.textContent = "기존 Atlas 데이터를 읽고 있어요…";
    try {
      const current = await AtlasAPI.getFullSchedule({ tripId: TRIP_ID });
      const existingSchedule = new Set((current.events || []).map(scheduleKey));
      const legacySchedule = await fetchLegacySchedule();
      let scheduleCount = 0;
      for (const event of legacySchedule) {
        const normalized = normalizeLegacyEvent(event);
        if (!normalized.startAt || existingSchedule.has(scheduleKey(normalized))) continue;
        await AtlasAPI.createSchedule(normalized);
        existingSchedule.add(scheduleKey(normalized));
        scheduleCount += 1;
      }

      const existingPlaces = await AtlasAPI.getMapPlaces(TRIP_ID);
      const placeKeys = new Set(existingPlaces.map(placeKey));
      const legacyPlaces = await fetchLegacyPlaces();
      let placeCount = 0;
      for (const place of legacyPlaces) {
        if (!Number.isFinite(Number(place.lat)) || !Number.isFinite(Number(place.lng)) || placeKeys.has(placeKey(place))) continue;
        await AtlasAPI.saveManualMapPlace({ ...place, tripId: TRIP_ID });
        placeKeys.add(placeKey(place));
        placeCount += 1;
      }

      const note = await fetchLegacyNote();
      if (note) await AtlasAPI.saveDashboardNote({ tripId: TRIP_ID, note });

      status.textContent = `완료: 일정 ${scheduleCount}건, 마커 ${placeCount}건${note ? ", 메모 1건" : ""}을 Layla Hub로 옮겼어요.`;
    } catch (error) {
      console.error(error);
      status.textContent = `실패: ${error?.message || error}`;
    } finally {
      button.disabled = false;
    }
  }

  async function fetchLegacySchedule() {
    const response = await fetch(LEGACY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "get_full_schedule", payload: { tripId: TRIP_ID, startDate: "2026-09-23", endDate: "2026-10-02" } })
    });
    const data = await response.json();
    if (!data || data.success === false || data.ok === false) throw new Error(data?.error || "기존 일정을 읽지 못했어요.");
    return data.schedule || data.events || [];
  }

  async function fetchLegacyPlaces() {
    const response = await fetch(`${LEGACY_ENDPOINT}?action=map_places&_=${Date.now()}`, { cache: "no-store" });
    const data = await response.json();
    if (Array.isArray(data)) return data;
    return data?.places || data?.items || [];
  }

  async function fetchLegacyNote() {
    try {
      const response = await fetch(`${LEGACY_ENDPOINT}?action=dashboard_note&tripId=${encodeURIComponent(TRIP_ID)}&_=${Date.now()}`, { cache: "no-store" });
      const data = await response.json();
      return data?.note || "";
    } catch { return ""; }
  }

  function normalizeLegacyEvent(event) {
    const details = event.details || {};
    const confirmationNumber = event.confirmationNumber || event.confirmation_number || event.reservationNumber || event.pnr || details.confirmationNumber || details.reservationNumber || details.pnr || "";
    const notes = event.notes || event.note || event.memo || details.notes || details.note || details.memo || "";
    return {
      tripId: TRIP_ID,
      scheduleType: event.scheduleType || event.schedule_type || event.type || "etc",
      title: event.title || event.name || "일정",
      startAt: normalizeDateTime(event.startAt || event.start_at || event.start || event.datetime || event.date),
      endAt: normalizeDateTime(event.endAt || event.end_at || event.end || ""),
      location: event.location || event.place || event.address || "",
      confirmationNumber,
      notes,
      details
    };
  }

  function normalizeDateTime(v) { return v ? String(v).replace(" ", "T").slice(0,16) : ""; }
  function scheduleKey(e) { return [e.title || "", normalizeDateTime(e.startAt || e.start_at), e.scheduleType || e.schedule_type || e.type || ""].join("::"); }
  function placeKey(p) { return [String(p.title || p.name || "").toLowerCase(), Number(p.lat || 0).toFixed(5), Number(p.lng || 0).toFixed(5)].join("::"); }
  return { initialize, run };
})();
window.addEventListener("DOMContentLoaded", AtlasLegacyMigration.initialize);
