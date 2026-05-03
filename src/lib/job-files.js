export const JOB_FILES_BUCKET = "job-files";
export const JOB_FILE_MAX_BYTES = 10 * 1024 * 1024;

export const JOB_FILE_ACCEPTED_MIME_TYPES = {
  photo: new Set(["image/jpeg", "image/png"]),
  document: new Set(["application/pdf"]),
};

export const JOB_FILE_EXTENSION_BY_MIME = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "application/pdf": "pdf",
};

export const JOB_FILE_TYPE_VALUES = new Set(["photo", "document"]);

export function sanitizeFileName(name) {
  return String(name || "file")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120) || "file";
}

export function getJobFileValidationError(fileType, file) {
  if (!JOB_FILE_TYPE_VALUES.has(fileType)) {
    return "Invalid file type";
  }

  if (!file) {
    return "No file provided";
  }

  if (Number(file.size || 0) <= 0) {
    return "File is empty";
  }

  if (Number(file.size || 0) > JOB_FILE_MAX_BYTES) {
    return "File exceeds 10MB limit";
  }

  const mimeType = String(file.type || "").toLowerCase();
  const allowedTypes = JOB_FILE_ACCEPTED_MIME_TYPES[fileType];
  if (!allowedTypes || !allowedTypes.has(mimeType)) {
    return fileType === "photo"
      ? "Photos must be JPG or PNG"
      : "Documents must be PDF";
  }

  return "";
}

export function buildJobFilePath({ userId, jobId, fileType, fileName, mimeType }) {
  const safeName = sanitizeFileName(fileName);
  const ext = JOB_FILE_EXTENSION_BY_MIME[String(mimeType || "").toLowerCase()];
  const hasKnownExtension = ext && safeName.endsWith(`.${ext}`);
  const normalizedName = hasKnownExtension || !ext ? safeName : `${safeName}.${ext}`;
  return `${userId}/${jobId}/${fileType}/${Date.now()}-${normalizedName}`;
}
