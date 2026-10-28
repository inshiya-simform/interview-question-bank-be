import { Router } from 'express';
import {
  getUnreadCount,
  listNotifications,
  markAllRead,
  markRead,
  stream,
} from '../controllers/notification.controller.js';
import { authenticate } from '../middlewares/authenticate.js';

// Notifications are personal and every role gets them, so there is no permission check beyond being signed in.
const router = Router();

router.use(authenticate);

router.get('/', listNotifications);
router.get('/unread-count', getUnreadCount);
router.get('/stream', stream);
router.post('/read-all', markAllRead);
router.patch('/:id/read', markRead);

export default router;
