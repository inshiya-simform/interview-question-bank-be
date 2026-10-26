import { Router } from 'express';
import {
  acquireReviewLock,
  approveQuestion,
  bulkApproveQuestions,
  bulkRejectQuestions,
  checkDuplicate,
  countQuestions,
  createQuestion,
  downloadImportTemplate,
  exportQuestions,
  getQuestion,
  getQuestionHistory,
  getReviewState,
  importQuestions,
  listQuestions,
  listSubmissions,
  rejectQuestion,
  releaseReviewLock,
  requestChanges,
  updateQuestion,
} from '../controllers/question.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { requireAnyPermission, requirePermission } from '../middlewares/requirePermission.js';
import { uploadCsv } from '../middlewares/uploadCsv.js';
import { validate } from '../middlewares/validate.js';
import {
  bulkRejectSchema,
  approveSchema,
  bulkReviewSchema,
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
router.get('/export', requirePermission('question:read'), exportQuestions);
router.get('/:id', requirePermission('question:read'), getQuestion);
router.get('/:id/history', requirePermission('question:read'), getQuestionHistory);
router.get('/:id/review-state', requirePermission('question:review'), getReviewState);
router.post('/', requirePermission('question:create'), validate(createQuestionSchema), createQuestion);
router.get('/import/template', requirePermission('question:create'), downloadImportTemplate);
router.post('/import', requirePermission('question:create'), uploadCsv, importQuestions);
router.post(
  '/check-duplicate',
  requireAnyPermission('question:create', 'question:edit_own'),
  validate(checkDuplicateSchema),
  checkDuplicate,
);
router.patch(
  '/:id',
  // Ownership is enforced in the service: edit_own only covers the caller's own questions.
  requirePermission('question:edit_own'),
  validate(updateQuestionSchema),
  updateQuestion,
);

// Registered before the '/:id/...' routes so "bulk" is never read as an id.
router.post('/bulk/approve', requirePermission('question:review'), validate(bulkReviewSchema), bulkApproveQuestions);
router.post('/bulk/reject', requirePermission('question:review'), validate(bulkRejectSchema), bulkRejectQuestions);
// POST claims the question and renews the claim, so the review screen calls it as a heartbeat.
router.post('/:id/review-lock', requirePermission('question:review'), acquireReviewLock);
router.delete('/:id/review-lock', requirePermission('question:review'), releaseReviewLock);
router.post('/:id/approve', requirePermission('question:review'), validate(approveSchema), approveQuestion);
router.post('/:id/request-changes', requirePermission('question:review'), validate(requestChangesSchema), requestChanges);
router.post('/:id/reject', requirePermission('question:review'), validate(rejectSchema), rejectQuestion);

export default router;
