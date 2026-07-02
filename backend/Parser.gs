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
const knowledge = generateKnowledgeObjects(parsed, record);

const completed = completeInboxRecord(record.id, {
  parserStatus: "completed",
  notionStatus: "pending",
  memoryStatus: "pending",
  knowledgeStatus: "generated",
  parsed: parsed,
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
    extractedText: extractTextPreview_(file, record),
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
    return file.getBlob().getDataAsString().slice(0, 5000);
  }

  if (mimeType === MimeType.PDF || mimeType === "application/pdf") {
    const text = extractPdfText_(record.fileId);
    console.log("[Parser] PDF extractedText length:", text.length);
    return text.slice(0, 50000);
  }

  return "";
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