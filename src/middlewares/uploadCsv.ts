import type { RequestHandler } from 'express';
import multer from 'multer';
import { AppError } from '../utils/AppError.js';

const MAX_CSV_BYTES = 2 * 1024 * 1024;
const CSV_MIME_TYPES = new Set(['text/csv', 'application/csv', 'application/vnd.ms-excel', 'text/plain', 'application/octet-stream']);

// Kept in memory: the file is parsed once and never written to disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_CSV_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const looksLikeCsv = file.originalname.toLowerCase().endsWith('.csv') && CSV_MIME_TYPES.has(file.mimetype);
    if (looksLikeCsv) return cb(null, true);
    cb(new AppError(400, 'VALIDATION_ERROR', 'Only .csv files are accepted'));
  },
});

// Multer reports its own error types; turn them into the API's standard error shape.
export const uploadCsv: RequestHandler = (req, res, next) => {
  upload.single('file')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? `File is too large (max ${MAX_CSV_BYTES / 1024 / 1024} MB)`
          : `Upload failed: ${err.message}`;
      return next(new AppError(400, 'VALIDATION_ERROR', message));
    }
    if (err) return next(err);
    if (!req.file) {
      return next(new AppError(400, 'VALIDATION_ERROR', 'Attach a CSV file in the "file" field'));
    }
    next();
  });
};
