function saveBase64FileToDrive(options) {
  const folder = DriveApp.getFolderById(options.folderId);

  const bytes = Utilities.base64Decode(options.contentBase64);

  const blob = Utilities.newBlob(
    bytes,
    options.mimeType || "application/octet-stream",
    options.fileName
  );

  return folder.createFile(blob);
}