function runAtlasParserOnce() {
  const record = lockNextInboxRecord();

  if (!record) {
    return {
      success: true,
      message: "처리할 Inbox 문서가 없어요.",
      record: null
    };
  }

  try {
   const parsed = parseInboxRecord(record);
   const documentIntel = analyzeTravelDocument(parsed);

parsed.documentIntel = documentIntel;

const knowledge = generateKnowledgeObjects(parsed, record);

const completed = completeInboxRecord(record.id, {
  parserStatus: "completed",
  notionStatus: "pending",
  memoryStatus: "pending",
  knowledgeStatus: "generated",
  parsed: parsed,
documentIntel: documentIntel,
  knowledge: knowledge
});

    return {
      success: true,
      message: "Parser 처리가 완료되었어요.",
      record: completed
    };
  } catch (error) {
    const failed = failInboxRecord(record.id, error.message);

    return {
      success: false,
      message: error.message,
      record: failed
    };
  }
}

function parseInboxRecord(record) {
  const file = DriveApp.getFileById(record.fileId);
  const extraction = extractTextPreview_(file, record);

  return {
    parsedAt: new Date().toISOString(),
    source: "google_drive",
    fileId: record.fileId,
    fileName: record.fileName,
    fileUrl: record.fileUrl,
    mimeType: record.mimeType,
    uploadType: record.uploadType,
    tripId: record.tripId,
    tripName: record.tripName,
    title: buildParsedDocumentTitle_(record),
    summary: buildParsedDocumentSummary_(record, file),
    extractedText: extraction.text || "",
    extractionMeta: {
      lowQuality: extraction.lowQuality || false,
      method: extraction.method || "unknown"
    },
    nextAction: "notion_document_record"
  };
}
function buildParsedDocumentTitle_(record) {
  return "[" + record.tripName + "] " + record.fileName;
}

function buildParsedDocumentSummary_(record, file) {
  return record.fileName
    + " 파일이 Google Drive에 저장되었고, Atlas Parser Queue에서 1차 메타데이터 처리가 완료되었습니다.";
}

function extractTextPreview_(file, record) {
  const mimeType = record.mimeType || file.getMimeType();

  if (mimeType.indexOf("text/") === 0) {
    return {
      text: file.getBlob().getDataAsString().slice(0, 5000),
      lowQuality: false,
      method: "plain_text"
    };
  }

  if (mimeType === MimeType.PDF || mimeType === "application/pdf") {
    const text = extractPdfText_(record.fileId);
    const lowQuality = isLowQualityExtractedText_(text);

    console.log("[Parser] PDF extractedText length:", text.length);
    console.log("[Parser] PDF extractedText lowQuality:", lowQuality);

    return {
      text: text.slice(0, 50000),
      lowQuality: lowQuality,
      method: "google_docs_pdf_conversion"
    };
  }

  return {
    text: "",
    lowQuality: false,
    method: "unsupported"
  };
}
function extractPdfText_(fileId) {
  let tempDocId = null;

  try {
    const resource = {
      title: 'atlas_temp_pdf_extract_' + fileId,
      mimeType: MimeType.GOOGLE_DOCS
    };

    const converted = Drive.Files.copy(resource, fileId);
    tempDocId = converted.id;

    const doc = DocumentApp.openById(tempDocId);
    return doc.getBody().getText() || '';

  } catch (error) {
    console.error('[Parser] PDF text extraction failed:', error);
    return '';

  } finally {
    if (tempDocId) {
      try {
        DriveApp.getFileById(tempDocId).setTrashed(true);
      } catch (cleanupError) {
        console.error('[Parser] Temp doc cleanup failed:', cleanupError);
      }
    }
  }
}
function isLowQualityExtractedText_(text) {
  if (!text) return true;

  const trimmed = String(text).trim();
  if (trimmed.length < 80) return true;

  // 줄 수와 단어 수
  const lines = trimmed.split(/\r?\n/).map(function(line) {
    return line.trim();
  }).filter(Boolean);

  const words = trimmed.split(/\s+/).filter(Boolean);

  // 이상한 문자 비율
  const weirdMatches = trimmed.match(/[^a-zA-Z0-9가-힣\s.,:;()\-\/#&@]/g) || [];
  const weirdRatio = weirdMatches.length / trimmed.length;

  // "정상 단어"로 보이는 토큰 수
  const readableWords = words.filter(function(word) {
    return /[a-zA-Z가-힣]{2,}/.test(word);
  });
  const readableRatio = words.length ? readableWords.length / words.length : 0;

  // 너무 짧은 줄이 비정상적으로 많으면 깨진 PDF일 가능성
  const shortLines = lines.filter(function(line) {
    return line.length <= 3;
  });
  const shortLineRatio = lines.length ? shortLines.length / lines.length : 0;

  // 한 글자/기호 위주 토큰 비율
  const junkWords = words.filter(function(word) {
    return word.length <= 2 && !/[a-zA-Z가-힣0-9]{2,}/.test(word);
  });
  const junkRatio = words.length ? junkWords.length / words.length : 0;

  if (weirdRatio > 0.18) return true;
  if (readableRatio < 0.45) return true;
  if (shortLineRatio > 0.35) return true;
  if (junkRatio > 0.35) return true;

  return false;
}