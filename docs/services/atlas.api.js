window.AtlasAPI = (() => {
  const DEFAULT_TRIP_ID = () => window.AtlasConfig?.atlas?.defaultTripId || "trip_turkiye_2026";
  const HOME_TZ = () => window.AtlasConfig?.atlas?.homeTimeZone || "Asia/Seoul";

  function db() {
    return window.AtlasSupabase?.getClient();
  }

  async function getUser() {
    const user = await window.AtlasSupabase?.getUser();
    if (!user) throw new Error("Atlas 로그인이 필요해요.");
    return user;
  }

  async function getCurrentTrip(tripId = DEFAULT_TRIP_ID()) {
    const { data, error } = await db()
      .from("atlas_trips")
      .select("id,name,start_date,end_date,time_zone,home_time_zone")
      .eq("id", tripId)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }

  async function getDriveLinks(tripId = DEFAULT_TRIP_ID()) {
    const role = await getRole(tripId);
    if (role !== "owner") return {};

    const { data, error } = await db()
      .from("atlas_trip_private")
      .select("drive_links")
      .eq("trip_id", tripId)
      .maybeSingle();

    if (error) throw error;
    return data?.drive_links || {};
  }

  async function getRole(tripId = DEFAULT_TRIP_ID()) {
    const user = await getUser();
    const { data, error } = await db()
      .from("atlas_trip_members")
      .select("role")
      .eq("trip_id", tripId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    return data?.role || "none";
  }

  async function getBrief() {
    const trip = await getCurrentTrip();
    const tripId = trip?.id || DEFAULT_TRIP_ID();
    const [scheduleResult, driveLinks] = await Promise.all([
      getFullSchedule({ tripId }),
      getDriveLinks(tripId)
    ]);
    const events = (scheduleResult.events || []).slice().sort((a, b) => String(a.startAt || "").localeCompare(String(b.startAt || "")));
    const nowKey = localDateTimeKey(new Date());
    const next = events.find((event) => String(event.startAt || "") >= nowKey) || events[0];

    return {
      title: next ? `다음 일정 · ${next.title}` : "등록된 다음 일정이 아직 없어요.",
      today_plan: events.slice(0, 3),
      time_card: await buildTimeCard(trip),
      next_transport: next ? {
        title: next.title,
        departure_place: next.details?.departurePlace || next.location || "-",
        arrival_place: next.details?.arrivalPlace || "-"
      } : {},
      quick_links: driveLinks
    };
  }

  async function getMemory() { return []; }

  async function getTravelStatus() {
    const trip = await getCurrentTrip();
    return { status: "ready", title: "Travel Status", time_card: await buildTimeCard(trip), items: [] };
  }

  async function buildTimeCard(trip) {
    const localTimeZone = trip?.time_zone || "Europe/Istanbul";
    const homeTimeZone = trip?.home_time_zone || HOME_TZ();
    return {
      local_label: "현지 시간",
      local_time: formatTime(new Date(), localTimeZone),
      home_label: "서울 시간",
      home_time: formatTime(new Date(), homeTimeZone)
    };
  }

  function formatTime(date, timeZone) {
    try {
      return new Intl.DateTimeFormat("ko-KR", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }).format(date);
    } catch {
      return "--:--";
    }
  }

  async function getCurrentWeather(place) {
    if (!place || !Number.isFinite(Number(place.lat)) || !Number.isFinite(Number(place.lng))) {
      return { label: "현재 지역 날씨", value: "위치 없음" };
    }

    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", Number(place.lat));
    url.searchParams.set("longitude", Number(place.lng));
    url.searchParams.set("current", "temperature_2m,weather_code");
    url.searchParams.set("timezone", "auto");

    try {
      const response = await fetch(url.toString(), { cache: "no-store" });
      if (!response.ok) throw new Error(`Weather ${response.status}`);
      const data = await response.json();
      const temperature = data?.current?.temperature_2m;
      const code = data?.current?.weather_code;
      const region = place.city || place.title || place.name || "현재 지역";
      return {
        label: `${region} 날씨`,
        value: Number.isFinite(Number(temperature)) ? `${Math.round(Number(temperature))}° · ${getWeatherLabelFromCode(code)}` : getWeatherLabelFromCode(code)
      };
    } catch (error) {
      console.warn("Atlas weather request failed", error);
      return { label: "현재 지역 날씨", value: "확인 실패" };
    }
  }

  function getWeatherLabelFromCode(code) {
    const weatherMap = {
      0: "맑음", 1: "대체로 맑음", 2: "부분적으로 흐림", 3: "흐림",
      45: "안개", 48: "서리 안개", 51: "약한 이슬비", 53: "이슬비", 55: "강한 이슬비",
      61: "약한 비", 63: "비", 65: "강한 비", 71: "약한 눈", 73: "눈", 75: "강한 눈",
      80: "약한 소나기", 81: "소나기", 82: "강한 소나기", 95: "뇌우", 96: "우박을 동반한 뇌우", 99: "강한 우박 뇌우"
    };
    return weatherMap[Number(code)] || "날씨 확인 중";
  }

  async function getTripState(tripId = DEFAULT_TRIP_ID()) {
    const { data, error } = await db()
      .from("atlas_trip_state")
      .select("trip_id,current_city,current_lat,current_lng,updated_at")
      .eq("trip_id", tripId)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }

  async function updateTripState(params = {}) {
    const role = await getRole(params.tripId || DEFAULT_TRIP_ID());
    if (role !== "owner") throw new Error("Owner만 현재 위치를 갱신할 수 있어요.");
    const payload = {
      trip_id: params.tripId || DEFAULT_TRIP_ID(),
      current_city: params.city || "현재 위치",
      current_lat: Number(params.lat),
      current_lng: Number(params.lng),
      updated_at: new Date().toISOString()
    };
    const { data, error } = await db().from("atlas_trip_state").upsert(payload, { onConflict: "trip_id" }).select().single();
    if (error) throw error;
    return { success: true, ok: true, state: data };
  }

  async function getMapPlaces(tripId = DEFAULT_TRIP_ID()) {
    const { data, error } = await db()
      .from("atlas_places")
      .select("id,trip_id,title,address,category,lat,lng,google_place_id,source,created_at")
      .eq("trip_id", tripId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data || []).map(fromPlaceRow);
  }

  async function saveManualMapPlace(place) {
    const user = await getUser();
    const tripId = place?.tripId || DEFAULT_TRIP_ID();
    const role = await getRole(tripId);
    if (role !== "owner") throw new Error("Owner만 마커를 저장할 수 있어요.");
    const row = {
      id: isUuid(place?.id) ? place.id : crypto.randomUUID(),
      trip_id: tripId,
      created_by: user.id,
      title: place?.title || place?.name || "Atlas place",
      address: place?.address || place?.query || "",
      category: place?.category || "장소",
      lat: Number(place?.lat),
      lng: Number(place?.lng),
      google_place_id: place?.placeId || place?.place_id || "",
      source: place?.source || "Atlas Map"
    };
    const { data, error } = await db().from("atlas_places").upsert(row).select().single();
    if (error) throw error;
    return { success: true, ok: true, place: fromPlaceRow(data) };
  }

  async function removeManualMapPlace(placeId) {
    const role = await getRole();
    if (role !== "owner") throw new Error("Owner만 마커를 삭제할 수 있어요.");
    const { error } = await db().from("atlas_places").delete().eq("id", placeId);
    if (error) throw error;
    return { success: true, ok: true };
  }

  function fromPlaceRow(row) {
    return {
      id: row.id,
      tripId: row.trip_id,
      title: row.title,
      address: row.address,
      query: row.address,
      category: row.category,
      lat: Number(row.lat),
      lng: Number(row.lng),
      placeId: row.google_place_id || "",
      source: row.source || "Supabase",
      type: "manual_place"
    };
  }

  async function getFullSchedule(params = {}) {
    const tripId = params.tripId || DEFAULT_TRIP_ID();
    let query = db()
      .from("atlas_schedule")
      .select("id,trip_id,schedule_type,title,start_at,end_at,location,details,source,created_at,updated_at")
      .eq("trip_id", tripId)
      .order("start_at", { ascending: true });
    if (params.startDate) query = query.gte("start_at", `${params.startDate} 00:00:00`);
    if (params.endDate) query = query.lte("start_at", `${params.endDate} 23:59:59`);
    const { data, error } = await query;
    if (error) throw error;

    const ids = (data || []).map((row) => row.id);
    let privateById = new Map();
    if (ids.length) {
      const { data: privateRows, error: privateError } = await db()
        .from("atlas_schedule_private")
        .select("schedule_id,confirmation_number,notes")
        .in("schedule_id", ids);
      if (privateError && privateError.code !== "42501") console.warn("Atlas private schedule fields unavailable", privateError);
      privateById = new Map((privateRows || []).map((row) => [row.schedule_id, row]));
    }

    const events = (data || []).map((row) => {
      const privateRow = privateById.get(row.id) || {};
      return {
        id: row.id,
        tripId: row.trip_id,
        scheduleType: row.schedule_type,
        type: row.schedule_type,
        title: row.title,
        startAt: normalizeTimestamp(row.start_at),
        endAt: normalizeTimestamp(row.end_at),
        location: row.location || "",
        details: row.details || {},
        source: row.source || "manual_schedule",
        confirmationNumber: privateRow.confirmation_number || "",
        notes: privateRow.notes || ""
      };
    });
    return { success: true, ok: true, schedule: events, events };
  }

  async function createSchedule(payload = {}) {
    const user = await getUser();
    const tripId = payload.tripId || DEFAULT_TRIP_ID();
    const role = await getRole(tripId);
    if (role !== "owner") throw new Error("Owner만 일정을 추가할 수 있어요.");
    const row = {
      id: crypto.randomUUID(),
      trip_id: tripId,
      created_by: user.id,
      schedule_type: payload.scheduleType || payload.type || "etc",
      title: payload.title || "일정",
      start_at: payload.startAt || null,
      end_at: payload.endAt || null,
      location: payload.location || "",
      details: payload.details || {},
      source: "manual_schedule"
    };
    const { data, error } = await db().from("atlas_schedule").insert(row).select().single();
    if (error) throw error;
    const privatePayload = {
      schedule_id: data.id,
      confirmation_number: payload.confirmationNumber || payload.details?.confirmationNumber || "",
      notes: payload.notes || ""
    };
    const { error: privateError } = await db().from("atlas_schedule_private").upsert(privatePayload);
    if (privateError) throw privateError;
    return { success: true, ok: true, timelineEvent: { ...payload, id: data.id, source: "manual_schedule" }, message: "일정을 저장했어요." };
  }

  async function updateSchedule(params = {}) {
    const tripId = params.tripId || DEFAULT_TRIP_ID();
    const role = await getRole(tripId);
    if (role !== "owner") throw new Error("Owner만 일정을 수정할 수 있어요.");
    if (!params.id) throw new Error("수정할 일정 ID가 없어요.");

    const row = {
      schedule_type: params.scheduleType || params.type || "etc",
      title: params.title || "일정",
      start_at: params.startAt || null,
      end_at: params.endAt || null,
      location: params.location || "",
      details: params.details || {},
      updated_at: new Date().toISOString()
    };

    const { data, error } = await db()
      .from("atlas_schedule")
      .update(row)
      .eq("id", params.id)
      .eq("trip_id", tripId)
      .select()
      .single();
    if (error) throw error;

    const { error: privateError } = await db()
      .from("atlas_schedule_private")
      .upsert({
        schedule_id: params.id,
        confirmation_number: params.confirmationNumber || "",
        notes: params.notes || ""
      }, { onConflict: "schedule_id" });
    if (privateError) throw privateError;

    return { success: true, ok: true, schedule: data, message: "일정을 수정했어요." };
  }

  async function deleteSchedule(params = {}) {
    const tripId = params.tripId || DEFAULT_TRIP_ID();
    const role = await getRole(tripId);
    if (role !== "owner") throw new Error("Owner만 일정을 삭제할 수 있어요.");
    if (!params.id) throw new Error("삭제할 일정 ID가 없어요.");

    const { error } = await db()
      .from("atlas_schedule")
      .delete()
      .eq("id", params.id)
      .eq("trip_id", tripId);
    if (error) throw error;

    return { success: true, ok: true, message: "일정을 삭제했어요." };
  }

  async function updateScheduleNote(params = {}) {
    const role = await getRole();
    if (role !== "owner") throw new Error("Owner만 메모를 수정할 수 있어요.");
    const { error } = await db().from("atlas_schedule_private").upsert({ schedule_id: params.id, notes: params.notes || "" }, { onConflict: "schedule_id" });
    if (error) throw error;
    return { success: true, ok: true };
  }

  async function updateScheduleTime(params = {}) {
    const role = await getRole();
    if (role !== "owner") throw new Error("Owner만 시간을 수정할 수 있어요.");
    const { error } = await db().from("atlas_schedule").update({ start_at: params.startAt || null, end_at: params.endAt || null, updated_at: new Date().toISOString() }).eq("id", params.id);
    if (error) throw error;
    return { success: true, ok: true };
  }

  async function getDashboardNote(params = {}) {
    const tripId = params.tripId || DEFAULT_TRIP_ID();
    const { data, error } = await db()
      .from("atlas_notes")
      .select("id,note")
      .eq("trip_id", tripId)
      .eq("note_key", "dashboard")
      .maybeSingle();
    if (error) throw error;
    return { success: true, ok: true, note: data?.note || "", record: data || null };
  }

  async function saveDashboardNote(params = {}) {
    const user = await getUser();
    const tripId = params.tripId || DEFAULT_TRIP_ID();
    const role = await getRole(tripId);
    if (role !== "owner") throw new Error("Owner만 개인 메모를 저장할 수 있어요.");
    const { data, error } = await db().from("atlas_notes").upsert({
      trip_id: tripId,
      user_id: user.id,
      note_key: "dashboard",
      note: params.note || "",
      updated_at: new Date().toISOString()
    }, { onConflict: "trip_id,user_id,note_key" }).select().single();
    if (error) throw error;
    return { success: true, ok: true, record: data };
  }

  async function getPackingItems(tripId = DEFAULT_TRIP_ID()) {
    const { data, error } = await db().from("atlas_packing_items").select("*").eq("trip_id", tripId).order("sort_order").order("created_at");
    if (error) throw error;
    return data || [];
  }

  async function addPackingItem(item = {}) {
    const user = await getUser();
    const { data, error } = await db().from("atlas_packing_items").insert({
      trip_id: item.tripId || DEFAULT_TRIP_ID(), user_id: user.id, category: item.category || "기타", item: item.item, quantity: Number(item.quantity || 1), is_checked: false
    }).select().single();
    if (error) throw error;
    return data;
  }

  async function updatePackingItem(id, patch) {
    const { data, error } = await db().from("atlas_packing_items").update(patch).eq("id", id).select().single();
    if (error) throw error;
    return data;
  }

  async function deletePackingItem(id) {
    const { error } = await db().from("atlas_packing_items").delete().eq("id", id);
    if (error) throw error;
  }

  async function getExchangeRateToKrw(currency) {
    const code = String(currency || "KRW").trim().toUpperCase();

    if (code === "KRW") {
      return {
        currency: "KRW",
        rate: 1,
        date: new Date().toISOString().slice(0, 10),
        source: "KRW"
      };
    }

    const supported = new Set([
      "USD", "EUR", "TRY", "JPY", "CNY", "HKD", "TWD",
      "GBP", "CAD", "AUD", "THB", "VND", "INR"
    ]);

    if (!supported.has(code)) {
      throw new Error(`지원하지 않는 통화예요: ${code}`);
    }

    const response = await fetch(
      `https://api.frankfurter.dev/v2/rate/${encodeURIComponent(code)}/KRW`
    );

    if (!response.ok) {
      throw new Error(`환율 조회 실패 (${response.status})`);
    }

    const data = await response.json();
    const rate = Number(data?.rate);

    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error(`${code} → KRW 환율을 가져오지 못했어요.`);
    }

    return {
      currency: code,
      rate,
      date: data.date || "",
      source: "Frankfurter"
    };
  }

  async function getExpenses(tripId = DEFAULT_TRIP_ID()) {
    const { data, error } = await db().from("atlas_expenses").select("*").eq("trip_id", tripId).order("spent_at", { ascending: false }).order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function addExpense(expense = {}) {
    const user = await getUser();
    const amount = Number(expense.amount || 0);
    const rate = Number(expense.exchangeRate || 0);
    const krw = expense.currency === "KRW" ? amount : amount * rate;
    const { data, error } = await db().from("atlas_expenses").insert({
      trip_id: expense.tripId || DEFAULT_TRIP_ID(), user_id: user.id, spent_at: expense.spentAt || localDateKey(new Date()), category: expense.category || "기타", merchant: expense.merchant || "", memo: expense.memo || "", original_amount: amount, currency: expense.currency || "KRW", exchange_rate_to_krw: expense.currency === "KRW" ? 1 : rate, krw_amount: Math.round(krw), payment_method: expense.paymentMethod || ""
    }).select().single();
    if (error) throw error;
    return data;
  }

  async function updateExpense(id, expense = {}) {
    if (!id) throw new Error("수정할 지출 ID가 없어요.");
    const user = await getUser();
    const tripId = expense.tripId || DEFAULT_TRIP_ID();
    const amount = Number(expense.amount || 0);
    const currency = String(expense.currency || "KRW").toUpperCase();
    const rate = currency === "KRW" ? 1 : Number(expense.exchangeRate || 0);
    const krw = currency === "KRW" ? amount : amount * rate;

    const { data, error } = await db()
      .from("atlas_expenses")
      .update({
        spent_at: expense.spentAt || localDateKey(new Date()),
        category: expense.category || "기타",
        merchant: expense.merchant || "",
        memo: expense.memo || "",
        original_amount: amount,
        currency,
        exchange_rate_to_krw: rate,
        krw_amount: Math.round(krw),
        payment_method: expense.paymentMethod || ""
      })
      .eq("id", id)
      .eq("trip_id", tripId)
      .eq("user_id", user.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function deleteExpense(id) {
    const { error } = await db().from("atlas_expenses").delete().eq("id", id);
    if (error) throw error;
  }

  function isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
  }

  function normalizeTimestamp(value) {
    if (!value) return "";
    return String(value).replace(" ", "T").slice(0, 16);
  }

  function localDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function localDateTimeKey(date) {
    return `${localDateKey(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }

  return {
    getCurrentTrip, getDriveLinks, getRole, getBrief, getMemory, getTravelStatus, getCurrentWeather,
    getTripState, updateTripState, getMapPlaces, saveManualMapPlace, removeManualMapPlace,
    getFullSchedule, createSchedule, updateSchedule, deleteSchedule, updateScheduleNote, updateScheduleTime,
    getDashboardNote, saveDashboardNote,
    getPackingItems, addPackingItem, updatePackingItem, deletePackingItem,
    getExchangeRateToKrw, getExpenses, addExpense, updateExpense, deleteExpense
  };
})();
