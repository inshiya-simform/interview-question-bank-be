import { Router } from 'express';
import { listTags } from '../controllers/tag.controller.js';
import { authenticate } from '../middlewares/authenticate.js';

const router = Router();

router.use(authenticate);

router.get('/', listTags);

export default router;
