import type { RequestHandler } from 'express';
import * as clientService from '../services/client.service.js';

export const listClients: RequestHandler = async (req, res, next) => {
  try {
    res.json(await clientService.listPermittedClients(req.user!));
  } catch (err) {
    next(err);
  }
};
