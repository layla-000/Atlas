window.AtlasMemory = (() => {
  function getBackendEndpoint() {
    if (!window.AtlasConfig || !window.AtlasConfig.backend) {
      return "";
    }
    return window.AtlasConfig.backend.uploadEndpoint || "";
  }

  async function fetchSnapshots() {
    const endpoint = getBackendEndpoint();

    if (!endpoint) {
      return buildFallbackSnapshots_();
    }

    try {
      const response = await fetch(`${endpoint}?action=memory`);
      const data = await response.json();

      if (!data.success) {
        return buildFallbackSnapshots_();
      }

      return data.records || [];
    } catch (error) {
      console.warn("Atlas Memory fetch failed:", error);
      return buildFallbackSnapshots_();
    }
  }

  function buildFallbackSnapshots_() {
    return [
      {
        id: "demo_memory",
        tripName: "Türkiye 2026",
        document: {
          fileName: "Memory API 연결 대기 중"
        },
        entities: [],
        relationships: [],
        status: "demo"
      }
    ];
  }

  return {
    fetchSnapshots
  };
})();