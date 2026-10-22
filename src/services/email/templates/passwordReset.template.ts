import type { EmailContent } from '../email.service.js';
import { button, escapeHtml, layout } from './layout.js';

export function passwordResetEmail(params: {
  name: string;
  resetUrl: string;
  expiresInMinutes: number;
}): EmailContent {
  const { name, resetUrl, expiresInMinutes } = params;
  return {
    subject: 'Reset your password',
    text: `Hi ${name},\n\nUse the link below to reset your password. It expires in ${expiresInMinutes} minutes.\n\n${resetUrl}\n\nIf you didn't request this, you can ignore this email.`,
    html: layout(
      `<p>Hi ${escapeHtml(name)},</p>` +
        `<p>Use the button below to reset your password. It expires in ${expiresInMinutes} minutes.</p>` +
        button(resetUrl, 'Reset password') +
        `<p style="color:#666;font-size:13px">If you didn't request this, you can ignore this email.</p>`,
    ),
  };
}
