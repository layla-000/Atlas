window.AtlasAPI = (() => {
  function getBackendEndpoint() {
    if (!window.AtlasConfig || !window.AtlasConfig.backend) return "";
    return window.AtlasConfig.backend.uploadEndpoint || "";
  }

  async function request(action, fallback, options) {
    const endpoint = getBackendEndpoint();
    if (!endpoint) return fallback;

    const url = `${endpoint}?action=${encodeURIComponent(action)}`;

    try {
      const response = await fetch(url, options || {});
      const data = await response.json();

      if (!data || data.success === false) return fallback;
      return data;
    } catch (error) {
      console.warn(`AtlasAPI ${action} request failed:`, error);
      return fallback;
    }
  }

  async function getBrief() {
    const fallback = {
      success: true,
      brief: {
        title: "좋은 아침이에요.",
        summary: "Atlas Brief 연결을 준비하고 있어요.",
        priority: "normal",
        actions: [],
        status: "demo"
      }
    };

    const data = await request("brief", fallback);
    return data.brief || fallback.brief;
  }

  async function getMemory() {
    const fallback = { success: true, records: [] };
    const data = await request("memory", fallback);
    return data.records || [];
  }

  async function getTravelStatus() {
    const fallback = {
      success: true,
      status: {
        status: "demo",
        title: "Travel Status",
        summary: "Atlas Travel Status 연결을 준비하고 있어요.",
        items: []
      }
    };

    const data = await request("status", fallback);
    return data.status || fallback.status;
  }

  async function getMapPlaces() {
    const fallback = { success: true, places: [] };
    const data = await request("map_places", fallback);
    return data.places || data.items || [];
  }

  async function saveManualMapPlace(place) {
    const fallback = { success: false, place: null };

    return request("save_manual_map_place", fallback, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(place || {})
    });
  }

  async function removeManualMapPlace(placeId) {
    const fallback = { success: false };

    return request("remove_manual_map_place", fallback, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify({ placeId })
    });
  }

  return {
    getBrief,
    getMemory,
    getTravelStatus,
    getMapPlaces,
    saveManualMapPlace,
    removeManualMapPlace
  };
})();