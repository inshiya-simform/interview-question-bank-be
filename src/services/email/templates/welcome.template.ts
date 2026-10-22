import type { EmailContent } from '../email.service.js';
import { escapeHtml, layout } from './layout.js';

export function welcomeEmail(params: { name: string }): EmailContent {
  const { name } = params;
  return {
    subject: 'Welcome to Interview Question Bank',
    text: `Hi ${name},\n\nYour account has been created. Welcome aboard!`,
    html: layout(`<p>Hi ${escapeHtml(name)},</p><p>Your account has been created. Welcome aboard!</p>`),
  };
}
