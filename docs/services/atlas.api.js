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
    function getWeatherLabelFromCode(code) {
    const weatherMap = {
      0: "맑음",
      1: "대체로 맑음",
      2: "부분적으로 흐림",
      3: "흐림",
      45: "안개",
      48: "서리 안개",
      51: "약한 이슬비",
      53: "이슬비",
      55: "강한 이슬비",
      61: "약한 비",
      63: "비",
      65: "강한 비",
      71: "약한 눈",
      73: "눈",
      75: "강한 눈",
      80: "약한 소나기",
      81: "소나기",
      82: "강한 소나기",
      95: "뇌우"
    };

    return weatherMap[Number(code)] || "날씨 확인 중";
  }

  async function getCurrentWeather(place) {
    if (!place || !Number.isFinite(Number(place.lat)) || !Number.isFinite(Number(place.lng))) {
      return {
        label: "현재 지역 날씨",
        value: "대기 중"
      };
    }

    const region = place.city || place.title || place.name || "현재 지역";
    const url =
      "https://api.open-meteo.com/v1/forecast" +
      `?latitude=${encodeURIComponent(place.lat)}` +
      `&longitude=${encodeURIComponent(place.lng)}` +
      "&current=temperature_2m,weather_code" +
      "&timezone=auto";

    try {
      const response = await fetch(url);
      const data = await response.json();

      const temperature = data?.current?.temperature_2m;
      const weatherCode = data?.current?.weather_code;

      if (temperature === undefined || weatherCode === undefined) {
        return {
          label: `${region} 날씨`,
          value: "확인 불가"
        };
      }

      return {
        label: `${region} 날씨`,
        value: `${Math.round(Number(temperature))}°C · ${getWeatherLabelFromCode(weatherCode)}`
      };
    } catch (error) {
      console.warn("Atlas weather request failed:", error);

      return {
        label: `${region} 날씨`,
        value: "확인 불가"
      };
    }
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
        getCurrentWeather,
    saveManualMapPlace,
    removeManualMapPlace
  };
})();