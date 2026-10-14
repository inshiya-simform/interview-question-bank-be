import { Router } from 'express';
import { createQuestion } from '../controllers/question.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import { validate } from '../middlewares/validate.js';
import { createQuestionSchema } from '../validators/question.validators.js';

const router = Router();

router.use(authenticate);

router.post('/', requirePermission('question:create'), validate(createQuestionSchema), createQuestion);

export default router;
