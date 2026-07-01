function generateTravelStatus() {
  const memories = getAtlasMemorySnapshots(10);

  if (!memories || memories.length === 0) {
    return {
      status: "waiting",
      title: "Memory 대기 중",
      summary: "아직 여행 상태를 판단할 Memory가 없어요.",
      items: []
    };
  }

  const latest = memories[0];
  const entities = latest.entities || [];

  const flightCount = countStatusEntities_(entities, "flight");
  const hotelCount = countStatusEntities_(entities, "hotel");
  const placeCount = countStatusEntities_(entities, "place");
  const dateCount = countStatusEntities_(entities, "date");

  return {
    status: "active",
    title: latest.tripName || "Trip",
    summary: "Atlas Memory를 기준으로 여행 준비 상태를 확인했어요.",
    items: [
      {
        label: "Flight",
        value: flightCount > 0 ? "확인됨" : "미확인",
        state: flightCount > 0 ? "complete" : "pending"
      },
      {
        label: "Hotel",
        value: hotelCount > 0 ? "확인됨" : "미확인",
        state: hotelCount > 0 ? "complete" : "pending"
      },
      {
        label: "Places",
        value: String(placeCount),
        state: placeCount > 0 ? "complete" : "pending"
      },
      {
        label: "Dates",
        value: String(dateCount),
        state: dateCount > 0 ? "complete" : "pending"
      }
    ]
  };
}

function countStatusEntities_(entities, type) {
  return entities.filter(function(entity) {
    return entity.type === type;
  }).length;
}

function testGenerateTravelStatus() {
  const result = generateTravelStatus();
  console.log(JSON.stringify(result, null, 2));
  return result;
}