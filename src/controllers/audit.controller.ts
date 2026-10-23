import type { RequestHandler } from 'express';
import * as auditService from '../services/audit.service.js';
import { listAuditLogsQuerySchema } from '../validators/audit.validators.js';

export const listAuditLogs: RequestHandler = async (req, res, next) => {
  try {
    res.json(await auditService.listAuditLogs(listAuditLogsQuerySchema.parse(req.query)));
  } catch (err) {
    next(err);
  }
};
