const path = require("path");
const fs = require("fs");

const normalizeBaseUrl = (value) => {
  if (!value || typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
};

const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(__dirname, "..", "uploads");

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const UPLOAD_PUBLIC_PATH = process.env.UPLOAD_PUBLIC_PATH ?? "/uploads";

const determineDefaultAssetBase = () => {
  const envBase =
    process.env.PUBLIC_ASSET_BASE_URL ??
    process.env.ASSET_BASE_URL ??
    process.env.PUBLIC_URL ??
    process.env.APP_BASE_URL ??
    "";
  const normalized = normalizeBaseUrl(envBase);
  if (normalized) return normalized;
  const deploymentHint = process.env.DEPLOYMENT_URL ?? process.env.VERCEL_URL ?? "";
  if (deploymentHint && !deploymentHint.startsWith("http")) {
    return normalizeBaseUrl(`https://${deploymentHint}`);
  }
  return normalizeBaseUrl("https://28c.d0s369.co.in");
};

const PUBLIC_ASSET_BASE_URL = determineDefaultAssetBase();

const buildPublicAssetUrl = (relativePath) => {
  if (!relativePath || typeof relativePath !== "string") return null;
  if (/^(?:https?:|\/\/|data:|blob:)/i.test(relativePath)) return relativePath;
  const withLeadingSlash = relativePath.startsWith("/") ? relativePath : `/${relativePath}`;
  if (!PUBLIC_ASSET_BASE_URL) return withLeadingSlash;
  return `${PUBLIC_ASSET_BASE_URL}${withLeadingSlash}`;
};

const determineAttachmentType = (mimeType = "") => {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.includes("pdf")) return "file";
  if (mimeType.startsWith("text/")) return "file";
  return "file";
};

module.exports = {
  UPLOAD_DIR,
  UPLOAD_PUBLIC_PATH,
  PUBLIC_ASSET_BASE_URL,
  buildPublicAssetUrl,
  determineAttachmentType,
};
