const multer = require("multer");
const path = require("path");
const crypto = require("crypto");
const { UPLOAD_DIR } = require("../config/storage");
require("dotenv").config();
const MAX_FILE_SIZE_MB = parseInt(process.env.UPLOAD_MAX_FILE_MB ?? "10", 10);
const MAX_FILES = parseInt(process.env.UPLOAD_MAX_FILES ?? "5", 10);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const unique = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");
    const extension = path.extname(file.originalname || "");
    cb(null, `${unique}${extension}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (!file?.mimetype) {
    cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", file?.fieldname ?? "attachments"));
    return;
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE_MB * 1024 * 1024,
    files: MAX_FILES,
  },
});

module.exports = {
  upload,
  MAX_FILES,
};
