import type { EmailContent } from '../email.service.js';
import { button, escapeHtml, layout, paragraph } from './layout.js';

export function staffWelcomeEmail(params: {
  name: string;
  role: string;
  resetUrl: string;
  expiresInHours: number;
}): EmailContent {
  const { name, role, resetUrl, expiresInHours } = params;
  const roleLabel = role.toLowerCase();
  return {
    subject: 'Welcome to Interview Question Bank',
    text: `Hi ${name},\n\nAn account has been created for you as a ${roleLabel}. Use the link below to choose your password. It expires in ${expiresInHours} hours.\n\n${resetUrl}\n\nIf the link has expired, use "Forgot password" on the login page to get a new one.`,
    html: layout({
      title: 'Welcome aboard',
      preheader: 'Set your password to get started.',
      body:
        paragraph(`Hi ${escapeHtml(name)},`) +
        paragraph(`An account has been created for you as a ${escapeHtml(roleLabel)}. Choose your password to get started. This link expires in ${expiresInHours} hours.`) +
        button(resetUrl, 'Set your password') +
        paragraph(`<span style="font-size:13px;color:#5b6576">If the link has expired, use "Forgot password" on the login page to get a new one.</span>`),
    }),
  };
}
