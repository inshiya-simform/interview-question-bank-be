import type { EmailContent } from '../email.service.js';
import { button, escapeHtml, layout, paragraph } from './layout.js';

export function passwordResetEmail(params: {
  name: string;
  resetUrl: string;
  expiresInMinutes: number;
}): EmailContent {
  const { name, resetUrl, expiresInMinutes } = params;
  return {
    subject: 'Reset your password',
    text: `Hi ${name},\n\nUse the link below to reset your password. It expires in ${expiresInMinutes} minutes.\n\n${resetUrl}\n\nIf you didn't request this, you can ignore this email.`,
    html: layout({
      title: 'Reset your password',
      preheader: `This link expires in ${expiresInMinutes} minutes.`,
      body:
        paragraph(`Hi ${escapeHtml(name)},`) +
        paragraph(`We received a request to reset your password. This link expires in ${expiresInMinutes} minutes.`) +
        button(resetUrl, 'Reset password') +
        paragraph(`<span style="font-size:13px;color:#5b6576">If you didn't request this, you can safely ignore this email. Your password won't change.</span>`),
    }),
  };
}
