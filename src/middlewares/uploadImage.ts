import type { RequestHandler } from 'express';
import multer from 'multer';
import { MAX_IMAGE_BYTES } from '../constants/image.constants.js';
import { AppError } from '../utils/AppError.js';

// Kept in memory: the bytes are verified, then forwarded to object storage.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
});

export const uploadImage: RequestHandler = (req, res, next) => {
  upload.single('file')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? `Image is too large (max ${MAX_IMAGE_BYTES / 1024 / 1024} MB)`
          : `Upload failed: ${err.message}`;
      return next(new AppError(400, 'VALIDATION_ERROR', message));
    }
    if (err) return next(err);
    if (!req.file) return next(new AppError(400, 'VALIDATION_ERROR', 'Attach an image in the "file" field'));
    next();
  });
};
