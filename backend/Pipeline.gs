function runAtlasPipelineBatch(limit) {
  const maxItems = limit || 5;
  const startedAt = new Date().toISOString();
  const results = [];

  for (let i = 0; i < maxItems; i++) {
    const result = runAtlasParserOnce();

    results.push({
      index: i + 1,
      success: result.success,
      message: result.message,
      recordId: result.record ? result.record.id : null,
      fileName: result.record ? result.record.fileName : null,
      parserStatus: result.record ? result.record.parserStatus : null,
      notionStatus: result.record ? result.record.notionStatus : null,
      memoryStatus: result.record ? result.record.memoryStatus : null,
      error: result.record ? result.record.error : null
    });

    if (!result.record) {
      break;
    }

    if (!result.success) {
      break;
    }
  }

  const completed = results.filter(function(item) {
    return item.success && item.recordId;
  });

  const failed = results.filter(function(item) {
    return !item.success;
  });

  const brief = generateAtlasBrief();

  return {
    success: failed.length === 0,
    startedAt: startedAt,
    completedAt: new Date().toISOString(),
    requestedLimit: maxItems,
    processedCount: completed.length,
    failedCount: failed.length,
    results: results,
    brief: {
      id: brief.id,
      generatedAt: brief.generatedAt,
      title: brief.title,
      summary: brief.summary,
      priority: brief.priority,
      status: brief.status
    }
  };
}

function runAtlasPipelineBatchDefault() {
  const result = runAtlasPipelineBatch(5);
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function runAtlasPipelineBatchOne() {
  const result = runAtlasPipelineBatch(1);
  console.log(JSON.stringify(result, null, 2));
  return result;
}