import { env } from '../../../config/env.js';
import type { EmailContent } from '../email.service.js';
import { button, escapeHtml, layout, noteBox, paragraph, questionQuote, statusChip } from './layout.js';

export function questionRejectedEmail(params: {
  authorName: string;
  reviewerName: string;
  questionText: string;
  note?: string | null;
  isEdit: boolean;
}): EmailContent {
  const { authorName, reviewerName, questionText, note, isEdit } = params;
  const title = isEdit ? 'Your edit was rejected' : 'Your question was rejected';
  const link = env.frontendUrl && `${env.frontendUrl}/my-questions`;
  return {
    subject: title,
    text: `Hi ${authorName},\n\n${title} by ${reviewerName}.\n\nQuestion: ${questionText}\n\n${note ? `Reason: ${note}` : 'No reason was given.'}${link ? `\n\nView your questions: ${link}` : ''}`,
    html: layout({
      title,
      preheader: `${reviewerName} reviewed it and didn't approve it.`,
      body:
        statusChip('rejected', 'Rejected') +
        paragraph(`Hi ${escapeHtml(authorName)},`) +
        paragraph(
          `${escapeHtml(reviewerName)} reviewed ${isEdit ? 'your edit' : 'your question'} and didn't approve it.` +
            (isEdit ? ' The live version of the question is unchanged.' : ''),
        ) +
        questionQuote(questionText) +
        noteBox('Reason', note || 'No reason was given.') +
        (link ? button(link, 'View my questions') : ''),
    }),
  };
}
