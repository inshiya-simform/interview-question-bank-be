import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import * as notificationService from '../services/notification.service.js';
import * as hub from '../services/notification/notification.hub.js';
import { listNotificationsQuerySchema, notificationIdParamSchema } from '../validators/notification.validators.js';

export const listNotifications: RequestHandler = async (req, res, next) => {
  try {
    const query = listNotificationsQuerySchema.parse(req.query);
    res.json(await notificationService.listNotifications(req.user!, query));
  } catch (err) {
    next(err);
  }
};

export const getUnreadCount: RequestHandler = async (req, res, next) => {
  try {
    res.json(await notificationService.unreadCount(req.user!));
  } catch (err) {
    next(err);
  }
};

export const markRead: RequestHandler = async (req, res, next) => {
  try {
    const { id } = notificationIdParamSchema.parse(req.params);
    res.json(await notificationService.markRead(req.user!, id));
  } catch (err) {
    next(err);
  }
};

export const markAllRead: RequestHandler = async (req, res, next) => {
  try {
    res.json(await notificationService.markAllRead(req.user!));
  } catch (err) {
    next(err);
  }
};

// Server-Sent Events. `authenticate` has already run, so errors can still go through next() until the
// headers are flushed; after that the stream only ever ends.
export const stream: RequestHandler = (req, res, next) => {
  try {
    const userId = req.user!.id;
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    res.write('retry: 5000\n\nevent: ready\ndata: {}\n\n');

    const unsubscribe = hub.subscribe(userId, res);

    // The token was valid on connect, but the stream outlives it: end it at expiry so the client reconnects
    // (and gets a 401 if it is no longer signed in).
    const exp = (jwt.decode(req.headers.authorization!.slice(7)) as { exp?: number } | null)?.exp;
    // setTimeout overflows past ~24.8 days, so a longer-lived token just keeps its stream until the client leaves.
    const expiryMs = exp ? exp * 1000 - Date.now() : 0;
    const expiryTimer = expiryMs > 0 && expiryMs < 2 ** 31 - 1 ? setTimeout(() => res.end(), expiryMs) : undefined;

    req.on('close', () => {
      clearTimeout(expiryTimer);
      unsubscribe();
    });
  } catch (err) {
    if (res.headersSent) res.end();
    else next(err);
  }
};
