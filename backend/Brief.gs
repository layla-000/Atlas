const ATLAS_BRIEF_LATEST_KEY = "ATLAS_BRIEF_LATEST";

function generateAtlasBrief() {
  const insights = generateAtlasInsights();
  const now = new Date().toISOString();

  const highPriority = insights.filter(function(item) {
    return item.priority === "high";
  });

  const mediumPriority = insights.filter(function(item) {
    return item.priority === "medium";
  });

  const title = buildBriefTitle_(highPriority, mediumPriority);
  const summary = buildBriefSummary_(insights);

  const brief = {
    id: "brief_" + Utilities.getUuid(),
    generatedAt: now,
    title: title,
    summary: summary,
    priority: highPriority.length > 0 ? "high" : mediumPriority.length > 0 ? "medium" : "normal",
    insights: insights,
    actions: insights.map(function(item) {
      return item.action;
    }).filter(function(action) {
      return !!action;
    }).slice(0, 5),
    status: "ready"
  };

  saveAtlasBrief_(brief);
  return brief;
}

function getLatestAtlasBrief() {
  const raw = PropertiesService.getScriptProperties().getProperty(ATLAS_BRIEF_LATEST_KEY);

  if (!raw) {
    return generateAtlasBrief();
  }

  return JSON.parse(raw);
}

function saveAtlasBrief_(brief) {
  PropertiesService.getScriptProperties().setProperty(
    ATLAS_BRIEF_LATEST_KEY,
    JSON.stringify(brief)
  );
}

function buildBriefTitle_(highPriority, mediumPriority) {
  if (highPriority.length > 0) {
    return "확인할 여행 이슈가 있어요.";
  }

  if (mediumPriority.length > 0) {
    return "여행 준비 상태를 점검해 볼게요.";
  }

  return "좋은 아침이에요.";
}

function buildBriefSummary_(insights) {
  if (!insights || insights.length === 0) {
    return "아직 생성된 브리핑이 없어요.";
  }

  return insights
    .slice(0, 3)
    .map(function(item) {
      return item.message;
    })
    .join(" ");
}