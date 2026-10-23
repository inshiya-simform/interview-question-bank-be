import type { RequestHandler } from 'express';
import * as adminService from '../services/admin.service.js';
import {
  clientIdParamSchema,
  clientUserParamSchema,
  listClientsQuerySchema,
  listUsersQuerySchema,
} from '../validators/admin.validators.js';

export const listUsers: RequestHandler = async (req, res, next) => {
  try {
    res.json(await adminService.listUsers(listUsersQuerySchema.parse(req.query)));
  } catch (err) {
    next(err);
  }
};

export const createStaff: RequestHandler = async (req, res, next) => {
  try {
    res.status(201).json(await adminService.createStaff(req.user!, req.body));
  } catch (err) {
    next(err);
  }
};

export const createClient: RequestHandler = async (req, res, next) => {
  try {
    res.status(201).json(await adminService.createClient(req.user!, req.body));
  } catch (err) {
    next(err);
  }
};

export const listClients: RequestHandler = async (req, res, next) => {
  try {
    res.json(await adminService.listClients(listClientsQuerySchema.parse(req.query)));
  } catch (err) {
    next(err);
  }
};

export const grantClientAccess: RequestHandler = async (req, res, next) => {
  try {
    const { clientId } = clientIdParamSchema.parse(req.params);
    res.json(await adminService.grantClientAccess(req.user!, clientId, req.body));
  } catch (err) {
    next(err);
  }
};

export const revokeClientAccess: RequestHandler = async (req, res, next) => {
  try {
    const { clientId, userId } = clientUserParamSchema.parse(req.params);
    res.json(await adminService.revokeClientAccess(req.user!, clientId, userId));
  } catch (err) {
    next(err);
  }
};
