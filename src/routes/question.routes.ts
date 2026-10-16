import { Router } from 'express';
import { checkDuplicate, createQuestion, getQuestion, listQuestions, updateQuestion } from '../controllers/question.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { requireAnyPermission, requirePermission } from '../middlewares/requirePermission.js';
import { validate } from '../middlewares/validate.js';
import { checkDuplicateSchema, createQuestionSchema, updateQuestionSchema } from '../validators/question.validators.js';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission('question:read'), listQuestions);
router.get('/:id', requirePermission('question:read'), getQuestion);
router.post('/', requirePermission('question:create'), validate(createQuestionSchema), createQuestion);
router.post('/check-duplicate', requirePermission('question:create'), validate(checkDuplicateSchema), checkDuplicate);
router.patch(
  '/:id',
  // Ownership is enforced in the service: edit_own only covers the caller's own questions.
  requireAnyPermission('question:edit_own', 'question:edit_any'),
  validate(updateQuestionSchema),
  updateQuestion,
);

export default router;
