import { Router } from 'express';
import adminRoutes from './admin.routes.js';
import auditRoutes from './audit.routes.js';
import authRoutes from './auth.routes.js';
import clientRoutes from './client.routes.js';
import healthRoutes from './health.routes.js';
import questionRoutes from './question.routes.js';
import tagRoutes from './tag.routes.js';
import uploadRoutes from './upload.routes.js';

const router = Router();

router.use('/health', healthRoutes);
router.use('/admin/audit-logs', auditRoutes);
router.use('/admin', adminRoutes);
router.use('/auth', authRoutes);
router.use('/clients', clientRoutes);
router.use('/questions', questionRoutes);
router.use('/tags', tagRoutes);
router.use('/uploads', uploadRoutes);

export default router;
