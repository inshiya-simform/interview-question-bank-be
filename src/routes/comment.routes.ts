import { Router } from 'express';
import {
  createComment,
  deleteComment,
  listComments,
  listReplies,
  listMentionableUsers,
  updateComment,
  voteComment,
} from '../controllers/comment.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import { commentWriteLimiter } from '../middlewares/rateLimit.js';

// Mounted at /questions/:questionId. Anyone who can open the question can read and join its discussion;
// the service re-checks visibility on every call, so an invisible question is a 404.
const router = Router({ mergeParams: true });

// Guards are per route, not router.use: this router shares its prefix with the question routes.
const access = [authenticate, requirePermission('question:read')];

router.get('/comments', ...access, listComments);
router.get('/comments/:commentId/replies', ...access, listReplies);
router.get('/mentionable-users', ...access, listMentionableUsers);
router.post('/comments', ...access, commentWriteLimiter, createComment);
router.patch('/comments/:commentId', ...access, commentWriteLimiter, updateComment);
router.delete('/comments/:commentId', ...access, deleteComment);
router.put('/comments/:commentId/vote', ...access, commentWriteLimiter, voteComment);

export default router;
