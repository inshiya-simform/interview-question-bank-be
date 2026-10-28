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

export const refresh: RequestHandler = async (req, res, next) => {
  try {
    res.json(await authService.refresh(req.body));
  } catch (err) {
    next(err);
  }
};

export const logout: RequestHandler = async (req, res, next) => {
  try {
    res.json(await authService.logout(req.body));
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

export const myPermissions: RequestHandler = (req, res) => {
  const { role, permissions, clientIds } = req.user!;
  res.json({ role, permissions, clientIds });
};

export const changePassword: RequestHandler = async (req, res, next) => {
  try {
    res.json(await authService.changePassword(req.user!.id, req.body));
  } catch (err) {
    next(err);
  }
};

export const forgotPassword: RequestHandler = async (req, res, next) => {
  try {
    res.json(await authService.forgotPassword(req.body));
  } catch (err) {
    next(err);
  }
};

export const verifyResetToken: RequestHandler = async (req, res, next) => {
  try {
    res.json(await authService.verifyResetToken(req.body));
  } catch (err) {
    next(err);
  }
};

export const resetPassword: RequestHandler = async (req, res, next) => {
  try {
    res.json(await authService.resetPassword(req.body));
  } catch (err) {
    next(err);
  }
};
