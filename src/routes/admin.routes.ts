import { Router } from 'express';
import {
  createClient,
  createStaff,
  grantClientAccess,
  listClientAccess,
  listUsers,
  revokeClientAccess,
} from '../controllers/admin.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { requirePermission } from '../middlewares/requirePermission.js';
import { validate } from '../middlewares/validate.js';
import { createClientSchema, createStaffSchema, grantClientAccessSchema } from '../validators/admin.validators.js';

const router = Router();

router.use(authenticate);

// Authors & reviewers page
router.get('/users', requirePermission('user:read'), listUsers);
router.post('/users', requirePermission('user:create_staff'), validate(createStaffSchema), createStaff);

// Client access page
router.get('/clients', requirePermission('client:read_all'), listClientAccess);
router.post('/clients', requirePermission('client:create'), validate(createClientSchema), createClient);
router.post(
  '/clients/:clientId/users',
  requirePermission('client:assign'),
  validate(grantClientAccessSchema),
  grantClientAccess,
);
router.delete('/clients/:clientId/users/:userId', requirePermission('client:assign'), revokeClientAccess);

export default router;
