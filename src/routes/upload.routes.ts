import { Router } from 'express';
import { getImage, uploadImage } from '../controllers/upload.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { imageUploadLimiter } from '../middlewares/rateLimit.js';
import { requireAnyPermission } from '../middlewares/requirePermission.js';
import { uploadImage as parseImageUpload } from '../middlewares/uploadImage.js';

const router = Router();

// Public on purpose: note HTML embeds these URLs in plain <img> tags, which cannot send a bearer token.
// Ids are random UUIDs, so they cannot be enumerated.
router.get('/images/:id', getImage);

router.post(
  '/images',
  authenticate,
  requireAnyPermission('question:create', 'question:edit_own'),
  imageUploadLimiter,
  parseImageUpload,
  uploadImage,
);

export default router;
