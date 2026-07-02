function syncParsedDocumentToMemory(record, parsed, documentIntel, knowledge) {
  if (!documentIntel || !documentIntel.documentType || !documentIntel.travelData) {
    return {
      memoryStatus: "skipped",
      message: "DocumentIntel 결과가 없어 Memory 저장을 건너뛰었어요."
    };
  }

  if (documentIntel.documentType === "unknown_document") {
    return {
      memoryStatus: "skipped",
      message: "unknown_document는 Memory 저장을 건너뛰었어요."
    };
  }

  const patch = buildMemoryPatchFromTravelDocument_(record, parsed, documentIntel, knowledge);
  const result = appendAtlasTravelMemoryPatch_(record.tripId, patch);

  return {
    memoryStatus: "completed",
    syncedAt: new Date().toISOString(),
    documentType: documentIntel.documentType,
    patch: patch,
    result: result
  };
}

function buildMemoryPatchFromTravelDocument_(record, parsed, documentIntel, knowledge) {
  const type = documentIntel.documentType;
  const data = documentIntel.travelData || {};
  const extractionMeta = parsed.extractionMeta || {};

  return {
    id: "memory_patch_" + Utilities.getUuid(),
    createdAt: new Date().toISOString(),
    tripId: record.tripId,
    tripName: record.tripName,
    source: "document_intel",
    sourceDocument: {
      inboxId: record.id,
      fileId: parsed.fileId,
      fileName: parsed.fileName,
      fileUrl: parsed.fileUrl,
      documentType: type,
      lowQuality: extractionMeta.lowQuality === true,
      extractionMethod: extractionMeta.method || "unknown"
    },
    objectType: type,
    object: normalizeTravelMemoryObject_(type, data, parsed, record),
    knowledgeObjectCount: knowledge && knowledge.objects ? knowledge.objects.length : 0
  };
}

function normalizeTravelMemoryObject_(type, data, parsed, record) {
  if (type === "hotel_booking") {
    return {
      type: "hotel_booking",
      name: data.hotelName || parsed.fileName,
      hotelName: data.hotelName || "",
      roomType: data.roomType || "",
      checkIn: data.checkIn || "",
      checkOut: data.checkOut || "",
      guestName: data.guestName || "",
      bookingReference: data.bookingReference || "",
      address: data.address || "",
      cancellationPolicy: data.cancellationPolicy || "",
      sourceFileName: parsed.fileName
    };
  }

  if (type === "flight_booking") {
    return {
      type: "flight_booking",
      name: buildRouteName_(data, parsed),
      airline: data.airline || "",
      flightNumber: data.flightNumber || "",
      departurePlace: data.departurePlace || "",
      arrivalPlace: data.arrivalPlace || "",
      departureTime: data.departureTime || "",
      arrivalTime: data.arrivalTime || "",
      terminal: data.terminal || "",
      bookingReference: data.bookingReference || "",
      sourceFileName: parsed.fileName
    };
  }

  if (type === "tour_booking") {
    return {
      type: "tour_booking",
      name: data.tourName || parsed.fileName,
      tourName: data.tourName || "",
      date: data.date || "",
      startTime: data.startTime || "",
      meetingPoint: data.meetingPoint || "",
      voucherNumber: data.voucherNumber || "",
      notes: data.notes || "",
      sourceFileName: parsed.fileName
    };
  }

  if (type === "train_ticket" || type === "bus_ticket") {
    return {
      type: type,
      name: buildRouteName_(data, parsed),
      provider: data.provider || "",
      routeName: data.routeName || "",
      departurePlace: data.departurePlace || "",
      arrivalPlace: data.arrivalPlace || "",
      departureTime: data.departureTime || "",
      arrivalTime: data.arrivalTime || "",
      seat: data.seat || "",
      bookingReference: data.bookingReference || "",
      sourceFileName: parsed.fileName
    };
  }

  return {
    type: type,
    name: parsed.fileName,
    sourceFileName: parsed.fileName
  };
}

function buildRouteName_(data, parsed) {
  const route = [data.departurePlace, data.arrivalPlace].filter(Boolean).join(" → ");
  if (route) return route;
  return parsed.fileName || "Travel Item";
}

function appendAtlasTravelMemoryPatch_(tripId, patch) {
  const props = PropertiesService.getScriptProperties();
  const key = "ATLAS_TRAVEL_MEMORY_PATCHES__" + tripId;
  const raw = props.getProperty(key);
  const patches = raw ? JSON.parse(raw) : [];

  patches.unshift(patch);

  props.setProperty(key, JSON.stringify(patches.slice(0, 100)));

  return {
    key: key,
    patchCount: patches.length
  };
}

function getAtlasTravelMemoryPatches(tripId, limit) {
  const props = PropertiesService.getScriptProperties();
  const key = "ATLAS_TRAVEL_MEMORY_PATCHES__" + tripId;
  const raw = props.getProperty(key);
  const patches = raw ? JSON.parse(raw) : [];

  return limit ? patches.slice(0, limit) : patches;
}