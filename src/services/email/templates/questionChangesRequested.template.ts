import { env } from '../../../config/env.js';
import type { EmailContent } from '../email.service.js';
import { button, escapeHtml, layout, noteBox, paragraph, questionQuote, statusChip } from './layout.js';

export function questionChangesRequestedEmail(params: {
  authorName: string;
  reviewerName: string;
  questionText: string;
  note: string;
}): EmailContent {
  const { authorName, reviewerName, questionText, note } = params;
  const link = env.frontendUrl && `${env.frontendUrl}/my-questions`;
  return {
    subject: 'Changes requested on your question',
    text: `Hi ${authorName},\n\n${reviewerName} requested changes to your question.\n\nQuestion: ${questionText}\n\nRequested changes: ${note}${link ? `\n\nUpdate your question: ${link}` : ''}`,
    html: layout({
      title: 'Changes requested',
      preheader: `${reviewerName} asked for changes to your question.`,
      body:
        statusChip('changes', 'Changes requested') +
        paragraph(`Hi ${escapeHtml(authorName)},`) +
        paragraph(`${escapeHtml(reviewerName)} reviewed your question and asked for a few changes before it can go live.`) +
        questionQuote(questionText) +
        noteBox('Requested changes', note) +
        (link ? button(link, 'Update my question') : ''),
    }),
  };
}
