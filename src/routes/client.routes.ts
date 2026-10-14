import { Router } from 'express';
import { listClients } from '../controllers/client.controller.js';
import { authenticate } from '../middlewares/authenticate.js';

const router = Router();

router.use(authenticate);

router.get('/', listClients);

export default router;
