/**
 * Client-side image compression before upload (keeps UI responsive).
 */

const DEFAULT_MAX_EDGE = 1920;
const DEFAULT_QUALITY = 0.82;
const MAX_OUTPUT_BYTES = 2.5 * 1024 * 1024;

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image"));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

export async function compressImageFile(file, options = {}) {
  const maxEdge = options.maxEdge || DEFAULT_MAX_EDGE;
  const quality = options.quality ?? DEFAULT_QUALITY;
  if (!file?.type?.startsWith("image/")) {
    throw new Error("Images only");
  }
  if (file.type === "image/gif") {
    return file;
  }

  const img = await loadImageFromFile(file);
  let { width, height } = img;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  width = Math.round(width * scale);
  height = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(img, 0, 0, width, height);

  let blob = await canvasToBlob(canvas, "image/jpeg", quality);
  if (!blob) throw new Error("Compression failed");
  if (blob.size > MAX_OUTPUT_BYTES) {
    blob = await canvasToBlob(canvas, "image/jpeg", 0.72);
  }
  if (!blob) throw new Error("Compression failed");

  const baseName = String(file.name || "photo").replace(/\.[^.]+$/, "");
  return new File([blob], `${baseName}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });
}
