import { env } from '../../../config/env.js';
import type { EmailContent } from '../email.service.js';
import { button, escapeHtml, layout, paragraph } from './layout.js';

export function welcomeEmail(params: { name: string }): EmailContent {
  const { name } = params;
  const link = env.frontendUrl && `${env.frontendUrl}/login`;
  return {
    subject: 'Welcome to Interview Question Bank',
    text: `Hi ${name},\n\nYour account has been created. Welcome aboard!${link ? `\n\nLog in: ${link}` : ''}`,
    html: layout({
      title: 'Welcome aboard',
      preheader: 'Your account has been created.',
      body:
        paragraph(`Hi ${escapeHtml(name)},`) +
        paragraph('Your account has been created. You can now browse the question bank and submit your own questions.') +
        (link ? button(link, 'Log in') : ''),
    }),
  };
}
