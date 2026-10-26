import { env } from '../../../config/env.js';
import type { EmailContent } from '../email.service.js';
import { button, escapeHtml, layout, paragraph } from './layout.js';

export function passwordChangedEmail(params: { name: string }): EmailContent {
  const { name } = params;
  const link = env.frontendUrl && `${env.frontendUrl.replace(/\/$/, '')}/forgot-password`;
  return {
    subject: 'Your password was changed',
    text: `Hi ${name},\n\nYour password was just changed and your other sessions were signed out.\n\nIf this wasn't you, reset your password right away${link ? `: ${link}` : '.'}`,
    html: layout({
      title: 'Your password was changed',
      preheader: 'Your other sessions were signed out.',
      body:
        paragraph(`Hi ${escapeHtml(name)},`) +
        paragraph('Your password was just changed and your other sessions were signed out.') +
        paragraph(`<span style="font-size:13px;color:#5b6576">If this wasn't you, reset your password right away.</span>`) +
        (link ? button(link, 'Reset password') : ''),
    }),
  };
}
