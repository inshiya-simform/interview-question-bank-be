import type { RequestHandler } from 'express';
import * as authService from '../services/auth.service.js';

export const register: RequestHandler = async (req, res, next) => {
  try {
    res.status(201).json(await authService.register(req.body));
  } catch (err) {
    next(err);
  }
};

export const login: RequestHandler = async (req, res, next) => {
  try {
    res.json(await authService.login(req.body));
  } catch (err) {
    next(err);
  }
};

export const me: RequestHandler = async (req, res, next) => {
  try {
    res.json(await authService.getMe(req.user!.id));
  } catch (err) {
    next(err);
  }
};
