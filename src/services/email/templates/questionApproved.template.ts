import { env } from '../../../config/env.js';
import type { EmailContent } from '../email.service.js';
import { button, escapeHtml, layout, paragraph, questionQuote, statusChip } from './layout.js';

export function questionApprovedEmail(params: {
  authorName: string;
  reviewerName: string;
  questionText: string;
  isEdit: boolean;
}): EmailContent {
  const { authorName, reviewerName, questionText, isEdit } = params;
  const title = isEdit ? 'Your edit was approved' : 'Your question was approved';
  const link = env.frontendUrl && `${env.frontendUrl}/my-questions`;
  return {
    subject: title,
    text: `Hi ${authorName},\n\n${title} by ${reviewerName} and is now live.\n\nQuestion: ${questionText}${link ? `\n\nView your questions: ${link}` : ''}`,
    html: layout({
      title,
      preheader: `${reviewerName} approved it. It's now live.`,
      body:
        statusChip('approved', 'Approved') +
        paragraph(`Hi ${escapeHtml(authorName)},`) +
        paragraph(`${escapeHtml(reviewerName)} approved ${isEdit ? 'your edit' : 'your question'}. It's now live in the question bank.`) +
        questionQuote(questionText) +
        (link ? button(link, 'View my questions') : ''),
    }),
  };
}
