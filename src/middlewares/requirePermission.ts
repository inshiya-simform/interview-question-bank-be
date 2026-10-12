import type { RequestHandler } from 'express';
import { AppError } from '../utils/AppError.js';

export const requirePermission =
  (code: string): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(new AppError(401, 'UNAUTHENTICATED', 'Authentication required'));
    if (!req.user.permissions.includes(code)) {
      return next(new AppError(403, 'FORBIDDEN', `Missing permission: ${code}`));
    }
    next();
  };
