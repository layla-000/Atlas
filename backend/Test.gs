function testRunParserOnce() {
  const result = runAtlasParserOnce();
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function testRunSemanticOnce() {
  const result = runAtlasSemanticOnce();
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function testGenerateAtlasBrief() {
  const result = generateAtlasBrief();
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function testGetLatestAtlasBrief() {
  const result = getLatestAtlasBrief();
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function testGetAtlasMemorySnapshots() {
  const result = getAtlasMemorySnapshots(20);
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function testGenerateTravelStatus() {
  const result = generateTravelStatus();
  console.log(JSON.stringify(result, null, 2));
  return result;
}