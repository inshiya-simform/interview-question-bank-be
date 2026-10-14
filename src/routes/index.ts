import { Router } from 'express';
import authRoutes from './auth.routes.js';
import clientRoutes from './client.routes.js';
import healthRoutes from './health.routes.js';
import questionRoutes from './question.routes.js';
import tagRoutes from './tag.routes.js';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/clients', clientRoutes);
router.use('/questions', questionRoutes);
router.use('/tags', tagRoutes);

export default router;
