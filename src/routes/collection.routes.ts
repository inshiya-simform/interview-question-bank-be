import { Router } from 'express';
import {
  createCollection,
  deleteCollection,
  listCollections,
  listSavedQuestions,
  renameCollection,
  saveQuestion,
  unsaveQuestion,
} from '../controllers/collection.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import { validate } from '../middlewares/validate.js';
import { collectionNameSchema, saveQuestionSchema } from '../validators/collection.validators.js';

// Collections are personal: every route is scoped to the caller. Anyone who can read the bank can save from it.
const router = Router();

router.use(authenticate, requirePermission('question:read'));

router.get('/', listCollections);
router.post('/', validate(collectionNameSchema), createCollection);
router.patch('/:id', validate(collectionNameSchema), renameCollection);
router.delete('/:id', deleteCollection);

router.get('/saved-questions', listSavedQuestions);
router.put('/saved-questions/:questionId', validate(saveQuestionSchema), saveQuestion);
router.delete('/saved-questions/:questionId', unsaveQuestion);

export default router;
