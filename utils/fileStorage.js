const path = require("path");
require("dotenv").config();
const fsPromises = require("fs/promises");
const { UPLOAD_DIR, UPLOAD_PUBLIC_PATH, determineAttachmentType } = require("../config/storage");

const resolvePublicPath = (filename) => `${UPLOAD_PUBLIC_PATH}/${filename}`.replace(/\\/g, "/");

const buildAttachmentRecordFromFile = (file) => {
  if (!file) return null;
  const type = determineAttachmentType(file.mimetype);
  return {
    type,
    name: file.originalname ?? null,
    size: file.size ?? null,
    mimeType: file.mimetype ?? null,
    url: resolvePublicPath(path.basename(file.filename || file.path)),
    preview: null,
    metadata: {
      originalName: file.originalname ?? null,
    },
    storagePath: file.path,
  };
};

const deleteAttachmentFiles = async (attachments = []) => {
  const tasks = attachments
    .map((attachment) => attachment?.storagePath || deriveStoragePathFromUrl(attachment?.url))
    .filter(Boolean)
    .map(async (storagePath) => {
      try {
        await fsPromises.unlink(storagePath);
      } catch (error) {
        if (error.code !== "ENOENT") {
          console.error("[storage] failed to remove file", storagePath, error);
        }
      }
    });

  await Promise.all(tasks);
};

const deriveStoragePathFromUrl = (url) => {
  if (!url) return null;
  const normalizedUrl = url.split("?")[0];
  if (!normalizedUrl.startsWith(`${UPLOAD_PUBLIC_PATH}/`)) {
    return null;
  }
  const filename = path.basename(normalizedUrl);
  if (!filename) return null;
  return path.join(UPLOAD_DIR, filename);
};

const mergeExistingAttachments = (existing = [], keep = []) => {
  if (!Array.isArray(keep) || keep.length === 0) return [];
  const mapByUrl = new Map(
    existing.map((attachment) => [attachment.url ?? attachment.data ?? attachment.storagePath ?? null, attachment]),
  );

  return keep
    .map((attachment) => {
      const key = attachment.url ?? attachment.data ?? null;
      if (!key) return null;
      const original = mapByUrl.get(key);
      if (!original) return null;
      return {
        type: original.type ?? determineAttachmentType(original.mimeType),
        name: original.name ?? attachment.name ?? null,
        size: original.size ?? attachment.size ?? null,
        mimeType: original.mimeType ?? attachment.mimeType ?? null,
        url: original.url ?? key,
        preview: original.preview ?? attachment.preview ?? null,
        metadata: original.metadata ?? attachment.metadata ?? {},
        storagePath: original.storagePath ?? deriveStoragePathFromUrl(original.url ?? key),
      };
    })
    .filter(Boolean);
};

module.exports = {
  buildAttachmentRecordFromFile,
  deleteAttachmentFiles,
  mergeExistingAttachments,
  deriveStoragePathFromUrl,
};
