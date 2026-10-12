import type { RequestHandler } from 'express';
import { loadAuthUser } from '../services/auth.service.js';
import { AppError } from '../utils/AppError.js';
import { verifyToken } from '../utils/jwt.js';

export const authenticate: RequestHandler = async (req, _res, next) => {
  try {
    const [scheme, token] = req.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Missing bearer token');
    }

    const user = await loadAuthUser(verifyToken(token));
    if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'User no longer exists');

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};
