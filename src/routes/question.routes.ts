import { Router } from 'express';
import { createQuestion, listQuestions, updateQuestion } from '../controllers/question.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { requireAnyPermission, requirePermission } from '../middlewares/requirePermission.js';
import { validate } from '../middlewares/validate.js';
import { createQuestionSchema, updateQuestionSchema } from '../validators/question.validators.js';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission('question:read'), listQuestions);
router.post('/', requirePermission('question:create'), validate(createQuestionSchema), createQuestion);
router.patch(
  '/:id',
  // Ownership is enforced in the service: edit_own only covers the caller's own questions.
  requireAnyPermission('question:edit_own', 'question:edit_any'),
  validate(updateQuestionSchema),
  updateQuestion,
);

export default router;
