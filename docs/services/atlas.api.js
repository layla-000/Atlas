window.AtlasAPI = (() => {
  function getBackendEndpoint() {
    if (!window.AtlasConfig || !window.AtlasConfig.backend) {
      return "";
    }

    return window.AtlasConfig.backend.uploadEndpoint || "";
  }

  async function request(action, fallback) {
    const endpoint = getBackendEndpoint();

    if (!endpoint) {
      return fallback;
    }

    try {
      const response = await fetch(`${endpoint}?action=${encodeURIComponent(action)}`);
      const data = await response.json();

      if (!data || data.success === false) {
        return fallback;
      }

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
        summary: "Atlas Brief 연결을 준비하고 있어요. Backend 연결 후 Memory 기반 브리핑이 표시됩니다.",
        priority: "normal",
        actions: [],
        status: "demo"
      }
    };

    const data = await request("brief", fallback);
    return data.brief || fallback.brief;
  }

  async function getMemory() {
    const fallback = {
      success: true,
      records: []
    };

    const data = await request("memory", fallback);
    return data.records || [];
  }

  return {
    getBrief,
    getMemory
  };
})();