window.AtlasConfig = window.AtlasConfig || {};
window.AtlasConfig.maps = window.AtlasConfig.maps || {};
window.AtlasConfig.maps.apiKey = "AIzaSyBCCIW8JsILMyOOgCfzeurPkvqvHp8z2yY";

// Layla Hub (Supabase). Publishable keys are designed for browser use;
// access is protected by Supabase Auth + RLS, never by hiding this key.
window.AtlasConfig.supabase = {
  url: "https://yhliabpgjnraozzfpxgy.supabase.co",
  publishableKey: "sb_publishable_kNDndAby5yjCpplSbzAGZA_hAF9K3Fl"
};

window.AtlasConfig.atlas = {
  defaultTripId: "trip_turkiye_2026",
  travelTripIds: ["trip_turkiye_2026", "trip_beijing_2026"],
  homeTimeZone: "Asia/Seoul"
};
