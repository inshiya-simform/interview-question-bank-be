import { Router } from 'express';
import {
  approveQuestion,
  checkDuplicate,
  countQuestions,
  createQuestion,
  downloadImportTemplate,
  getQuestion,
  getQuestionHistory,
  importQuestions,
  listQuestions,
  listSubmissions,
  rejectQuestion,
  requestChanges,
  updateQuestion,
} from '../controllers/question.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import { uploadCsv } from '../middlewares/uploadCsv.js';
import { validate } from '../middlewares/validate.js';
import {
  checkDuplicateSchema,
  createQuestionSchema,
  rejectSchema,
  requestChangesSchema,
  updateQuestionSchema,
} from '../validators/question.validators.js';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission('question:read'), listQuestions);
router.get('/submissions', requirePermission('question:read'), listSubmissions);
router.get('/counts', requirePermission('question:read'), countQuestions);
router.get('/:id', requirePermission('question:read'), getQuestion);
router.get('/:id/history', requirePermission('question:read'), getQuestionHistory);
router.post('/', requirePermission('question:create'), validate(createQuestionSchema), createQuestion);
router.get('/import/template', requirePermission('question:create'), downloadImportTemplate);
router.post('/import', requirePermission('question:create'), uploadCsv, importQuestions);
router.post('/check-duplicate', requirePermission('question:create'), validate(checkDuplicateSchema), checkDuplicate);
router.patch(
  '/:id',
  // Ownership is enforced in the service: edit_own only covers the caller's own questions.
  requirePermission('question:edit_own'),
  validate(updateQuestionSchema),
  updateQuestion,
);

router.post('/:id/approve', requirePermission('question:review'), approveQuestion);
router.post('/:id/request-changes', requirePermission('question:review'), validate(requestChangesSchema), requestChanges);
router.post('/:id/reject', requirePermission('question:review'), validate(rejectSchema), rejectQuestion);

export default router;
