import type { RequestHandler } from 'express';
import * as imageService from '../services/image.service.js';

export const uploadImage: RequestHandler = async (req, res, next) => {
  try {
    res.status(201).json(await imageService.uploadImage(req.file!, req.user!.id));
  } catch (err) {
    next(err);
  }
};

export const getImage: RequestHandler = async (req, res, next) => {
  try {
    const { image, stream } = await imageService.getImage(String(req.params.id));
    res.set({
      'Content-Type': image.mimeType,
      'Content-Length': String(image.size),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=31536000, immutable',
      // Helmet-less app: allow the frontend origin to embed the image
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    stream.on('error', next);
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
};
