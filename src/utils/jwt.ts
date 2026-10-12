import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from './AppError.js';

export function signToken(userId: string): string {
  return jwt.sign({}, env.jwtSecret, {
    algorithm: 'HS256',
    subject: userId,
    expiresIn: env.jwtExpiresIn as NonNullable<jwt.SignOptions['expiresIn']>,
  });
}

export function verifyToken(token: string): string {
  try {
    const payload = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
    if (typeof payload === 'string' || !payload.sub) throw new Error('Malformed token');
    return payload.sub;
  } catch {
    throw new AppError(401, 'UNAUTHENTICATED', 'Invalid or expired token');
  }
}
