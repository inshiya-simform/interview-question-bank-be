import { Router } from 'express';
import { listAuditLogs } from '../controllers/audit.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { requirePermission } from '../middlewares/requirePermission.js';

const router = Router();

// Read-only on purpose: the API offers no way to edit or delete audit entries.
router.use(authenticate);
router.get('/', requirePermission('audit:read'), listAuditLogs);

export default router;
