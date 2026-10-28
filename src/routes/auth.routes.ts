import { Router } from 'express';
import {
  changePassword,
  forgotPassword,
  login,
  logout,
  me,
  myPermissions,
  refresh,
  register,
  resetPassword,
  verifyResetToken,
} from '../controllers/auth.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { passwordResetLimiter, refreshLimiter } from '../middlewares/rateLimit.js';
import { validate } from '../middlewares/validate.js';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  verifyResetTokenSchema,
} from '../validators/auth.validators.js';

const router = Router();

router.post('/register', validate(registerSchema), register);
router.post('/login', validate(loginSchema), login);
router.post('/refresh', refreshLimiter, validate(refreshSchema), refresh);
router.post('/logout', refreshLimiter, validate(logoutSchema), logout);
router.post('/forgot-password', passwordResetLimiter, validate(forgotPasswordSchema), forgotPassword);
router.post(
  '/reset-password/verify',
  passwordResetLimiter,
  validate(verifyResetTokenSchema),
  verifyResetToken,
);
router.post('/reset-password', passwordResetLimiter, validate(resetPasswordSchema), resetPassword);
router.post(
  '/change-password',
  authenticate,
  passwordResetLimiter,
  validate(changePasswordSchema),
  changePassword,
);
router.get('/me', authenticate, me);
router.get('/permissions', authenticate, myPermissions);

export default router;
