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
    status.textContent = "기존 Atlas 일정을 읽고 있어요…";

    try {
      const current = await AtlasAPI.getFullSchedule({ tripId: TRIP_ID });
      const existingSchedule = new Set((current.events || []).map(scheduleKey));

      const legacySchedule = await fetchLegacySchedule();
      let scheduleCount = 0;

      for (const event of legacySchedule) {
        const normalized = normalizeLegacyEvent(event);

        if (!normalized.startAt) continue;
        if (existingSchedule.has(scheduleKey(normalized))) continue;

        await AtlasAPI.createSchedule(normalized);
        existingSchedule.add(scheduleKey(normalized));
        scheduleCount += 1;
      }

      status.textContent =
        `완료: 일정 ${scheduleCount}건을 Layla Hub로 옮겼어요. 기존 Apps Script 데이터는 그대로 남아 있어요.`;
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
      body: JSON.stringify({
        action: "get_full_schedule",
        payload: {
          tripId: TRIP_ID,
          startDate: "2026-09-23",
          endDate: "2026-10-02"
        }
      })
    });

    if (!response.ok) {
      throw new Error(`기존 일정 조회 실패 (${response.status})`);
    }

    const data = await response.json();

    if (!data || data.success === false || data.ok === false) {
      throw new Error(data?.error || "기존 일정을 읽지 못했어요.");
    }

    return data.schedule || data.events || [];
  }

  function normalizeLegacyEvent(event) {
    const details = event.details || {};

    const confirmationNumber =
      event.confirmationNumber ||
      event.confirmation_number ||
      event.reservationNumber ||
      event.pnr ||
      details.confirmationNumber ||
      details.reservationNumber ||
      details.pnr ||
      "";

    const notes =
      event.notes ||
      event.note ||
      event.memo ||
      details.notes ||
      details.note ||
      details.memo ||
      "";

    return {
      tripId: TRIP_ID,
      scheduleType:
        event.scheduleType ||
        event.schedule_type ||
        event.type ||
        "etc",
      title: event.title || event.name || "일정",
      startAt: normalizeDateTime(
        event.startAt ||
        event.start_at ||
        event.start ||
        event.datetime ||
        event.date
      ),
      endAt: normalizeDateTime(
        event.endAt ||
        event.end_at ||
        event.end ||
        ""
      ),
      location:
        event.location ||
        event.place ||
        event.address ||
        "",
      confirmationNumber,
      notes,
      details
    };
  }

  function normalizeDateTime(value) {
    return value
      ? String(value).replace(" ", "T").slice(0, 16)
      : "";
  }

  function scheduleKey(event) {
    return [
      event.title || "",
      normalizeDateTime(event.startAt || event.start_at),
      event.scheduleType || event.schedule_type || event.type || ""
    ].join("::");
  }

  return { initialize, run };
})();

window.addEventListener("DOMContentLoaded", AtlasLegacyMigration.initialize);
