window.AtlasBrief = (() => {
  function getBackendEndpoint() {
    if (!window.AtlasConfig || !window.AtlasConfig.backend) {
      return "";
    }

    return window.AtlasConfig.backend.uploadEndpoint || "";
  }

  async function fetchBrief() {
    const endpoint = getBackendEndpoint();

    if (!endpoint) {
      return buildFallbackBrief_();
    }

    try {
      const response = await fetch(`${endpoint}?action=brief`);
      const data = await response.json();

      if (!data.success || !data.brief) {
        return buildFallbackBrief_();
      }

      return data.brief;
    } catch (error) {
      console.warn("Atlas Brief fetch failed:", error);
      return buildFallbackBrief_();
    }
  }

  function buildFallbackBrief_() {
    return {
      title: "좋은 아침이에요.",
      summary: "Atlas Brief 연결을 준비하고 있어요. Backend 연결 후 Memory 기반 브리핑이 이곳에 표시됩니다.",
      priority: "normal",
      actions: [],
      status: "demo"
    };
  }

  return {
    fetchBrief
  };
})();