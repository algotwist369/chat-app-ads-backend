/* eslint-disable no-unused-vars */
const multer = require("multer");
require("dotenv").config();

const errorHandler = (err, req, res, next) => {
  const isMulterError = err instanceof multer.MulterError;
  const status = err.status || err.statusCode || (isMulterError ? 400 : 500);
  const payload = {
    message: err.message || (isMulterError ? "Upload failed" : "Internal server error"),
  };

  if (process.env.NODE_ENV !== "production" && err.stack) {
    payload.stack = err.stack;
  }

  if (err.details) {
    payload.details = err.details;
  }

  res.status(status).json(payload);
};

module.exports = errorHandler;


