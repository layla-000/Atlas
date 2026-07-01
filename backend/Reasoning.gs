function generateAtlasInsights() {
  const memories = getAtlasMemorySnapshots(10);

  if (!memories || memories.length === 0) {
    return [{
      type: "system",
      priority: "normal",
      message: "아직 Atlas Memory가 충분하지 않아요.",
      action: "문서나 예약 정보를 업로드하면 Atlas Brief가 더 똑똑해집니다."
    }];
  }

  const latest = memories[0];
  const entities = latest.entities || [];
  const relationships = latest.relationships || [];

  const insights = [];

  insights.push({
    type: "memory",
    priority: "normal",
    message: latest.tripName + " 관련 최신 문서가 처리되었습니다.",
    action: latest.document && latest.document.fileName
      ? latest.document.fileName + "에서 추출한 정보를 확인하세요."
      : "최근 처리 문서를 확인하세요."
  });

  const placeCount = countEntitiesByType_(entities, "place");
  const dateCount = countEntitiesByType_(entities, "date");
  const moneyCount = countEntitiesByType_(entities, "money");
  const flightCount = countEntitiesByType_(entities, "flight");
  const hotelCount = countEntitiesByType_(entities, "hotel");

  if (flightCount > 0) {
    insights.push({
      type: "flight",
      priority: "high",
      message: "항공편 정보가 Atlas Memory에 확인되었습니다.",
      action: "출발 시간, 공항, 예약번호를 다시 확인하세요."
    });
  }

  if (hotelCount === 0) {
    insights.push({
      type: "hotel",
      priority: "medium",
      message: "호텔 예약 정보는 아직 확인되지 않았어요.",
      action: "숙소 예약 문서를 업로드하거나 예약 상태를 확인하세요."
    });
  }

  if (placeCount > 0) {
    insights.push({
      type: "place",
      priority: "normal",
      message: placeCount + "개의 장소 정보가 Memory에 연결되었습니다.",
      action: "동선과 지도 정보를 확인하세요."
    });
  }

  if (dateCount > 0) {
    insights.push({
      type: "date",
      priority: "normal",
      message: dateCount + "개의 날짜 정보가 발견되었습니다.",
      action: "일정표와 충돌이 없는지 확인하세요."
    });
  }

  if (moneyCount > 0) {
    insights.push({
      type: "budget",
      priority: "normal",
      message: moneyCount + "개의 금액 정보가 발견되었습니다.",
      action: "예산/영수증 기록과 연결할 수 있습니다."
    });
  }

  insights.push({
    type: "graph",
    priority: "normal",
    message: relationships.length + "개의 관계가 생성되었습니다.",
    action: "Atlas Memory Graph에 반영할 준비가 되었습니다."
  });

  return insights;
}

function countEntitiesByType_(entities, type) {
  return entities.filter(function(entity) {
    return entity.type === type;
  }).length;
}