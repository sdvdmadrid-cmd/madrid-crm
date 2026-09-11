export const JOB_FILES_BUCKET = "job-files";
export const JOB_FILE_MAX_BYTES = 15 * 1024 * 1024;
export const JOB_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export const JOB_MEDIA_SOFT_CAP = {
  photo: 200,
  video: 20,
};

export const JOB_FILE_ACCEPTED_MIME_TYPES = {
  photo: new Set(["image/jpeg", "image/png", "image/webp"]),
  document: new Set(["application/pdf"]),
  receipt: new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
  video: new Set(["video/mp4", "video/webm", "video/quicktime"]),
};

export const JOB_FILE_EXTENSION_BY_MIME = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

export const JOB_FILE_TYPE_VALUES = new Set([
  "photo",
  "document",
  "receipt",
  "video",
]);

export const JOB_PHOTO_STAGES = ["before", "progress", "completion"];

export function normalizePhotoStage(value, fallback = "progress") {
  const stage = String(value || "").trim().toLowerCase();
  if (JOB_PHOTO_STAGES.includes(stage)) return stage;
  const fb = String(fallback || "progress").trim().toLowerCase();
  return JOB_PHOTO_STAGES.includes(fb) ? fb : "progress";
}

export function sanitizeFileName(name) {
  return (
    String(name || "file")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 120) || "file"
  );
}

export function getJobFileMaxBytes(fileType) {
  return fileType === "video" ? JOB_VIDEO_MAX_BYTES : JOB_FILE_MAX_BYTES;
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

  const maxBytes = getJobFileMaxBytes(fileType);
  if (Number(file.size || 0) > maxBytes) {
    return fileType === "video"
      ? "Video exceeds 50MB limit"
      : "File exceeds 15MB limit";
  }

  const mimeType = String(file.type || "").toLowerCase();
  const allowedTypes = JOB_FILE_ACCEPTED_MIME_TYPES[fileType];
  if (!allowedTypes || !allowedTypes.has(mimeType)) {
    if (fileType === "video") {
      return "Videos must be MP4, WebM, or MOV";
    }
    if (fileType === "photo" || fileType === "receipt") {
      return "Photos/receipts must be JPG, PNG, or WebP (PDF also allowed for receipts)";
    }
    return "Documents must be PDF";
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

export function isJobTimelineMediaType(fileType) {
  const type = String(fileType || "").trim().toLowerCase();
  return type === "photo" || type === "video";
}
