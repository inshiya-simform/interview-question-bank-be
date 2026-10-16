import type { RequestHandler } from 'express';
import * as adminService from '../services/admin.service.js';
import {
  clientIdParamSchema,
  clientUserParamSchema,
  listClientAccessQuerySchema,
} from '../validators/admin.validators.js';

export const listUsers: RequestHandler = async (_req, res, next) => {
  try {
    res.json(await adminService.listUsers());
  } catch (err) {
    next(err);
  }
};

export const createStaff: RequestHandler = async (req, res, next) => {
  try {
    res.status(201).json(await adminService.createStaff(req.body));
  } catch (err) {
    next(err);
  }
};

export const createClient: RequestHandler = async (req, res, next) => {
  try {
    res.status(201).json(await adminService.createClient(req.body));
  } catch (err) {
    next(err);
  }
};

export const listClientAccess: RequestHandler = async (req, res, next) => {
  try {
    res.json(await adminService.listClientAccess(listClientAccessQuerySchema.parse(req.query)));
  } catch (err) {
    next(err);
  }
};

export const grantClientAccess: RequestHandler = async (req, res, next) => {
  try {
    const { clientId } = clientIdParamSchema.parse(req.params);
    res.json(await adminService.grantClientAccess(clientId, req.body));
  } catch (err) {
    next(err);
  }
};

export const revokeClientAccess: RequestHandler = async (req, res, next) => {
  try {
    const { clientId, userId } = clientUserParamSchema.parse(req.params);
    res.json(await adminService.revokeClientAccess(clientId, userId));
  } catch (err) {
    next(err);
  }
};
