import { env } from '../../../config/env.js';
import type { EmailContent } from '../email.service.js';
import { button, escapeHtml, layout, paragraph } from './layout.js';

export function clientAccessGrantedEmail(params: { name: string; clientName: string }): EmailContent {
  const { name, clientName } = params;
  const link = env.frontendUrl && `${env.frontendUrl.replace(/\/$/, '')}/login`;
  return {
    subject: `You now have access to ${clientName}`,
    text: `Hi ${name},\n\nYou've been given access to the client "${clientName}" and can now view and add its questions.${link ? `\n\nOpen the app: ${link}` : ''}`,
    html: layout({
      title: 'Client access granted',
      preheader: `You can now work with ${clientName}.`,
      body:
        paragraph(`Hi ${escapeHtml(name)},`) +
        paragraph(`You've been given access to <strong>${escapeHtml(clientName)}</strong> and can now view and add its questions.`) +
        (link ? button(link, 'Open the app') : ''),
    }),
  };
}

export function clientAccessRevokedEmail(params: { name: string; clientName: string }): EmailContent {
  const { name, clientName } = params;
  return {
    subject: `Your access to ${clientName} was removed`,
    text: `Hi ${name},\n\nYour access to the client "${clientName}" has been removed. You can no longer view or add its questions.`,
    html: layout({
      title: 'Client access removed',
      preheader: `You no longer have access to ${clientName}.`,
      body:
        paragraph(`Hi ${escapeHtml(name)},`) +
        paragraph(`Your access to <strong>${escapeHtml(clientName)}</strong> has been removed. You can no longer view or add its questions.`),
    }),
  };
}
