import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as t from '../src/services/email/templates/index.js';

// Renders every template to HTML files so the design can be checked in a browser.
const out = process.argv[2] ?? 'email-previews';
mkdirSync(out, { recursive: true });

const q = 'Explain the difference between a process and a thread, and when you would choose one over the other.';
const previews = {
  'question-approved': t.questionApprovedEmail({ authorName: 'Asha Patel', reviewerName: 'Rohan Mehta', questionText: q, isEdit: false }),
  'question-approved-edit': t.questionApprovedEmail({ authorName: 'Asha Patel', reviewerName: 'Rohan Mehta', questionText: q, isEdit: true }),
  'question-changes-requested': t.questionChangesRequestedEmail({ authorName: 'Asha Patel', reviewerName: 'Rohan Mehta', questionText: q, note: 'Please add expected answer notes covering context switching.\nAlso tag this with the Operating Systems category.' }),
  'question-rejected': t.questionRejectedEmail({ authorName: 'Asha Patel', reviewerName: 'Rohan Mehta', questionText: q, note: 'This duplicates an existing question in the bank.', isEdit: false }),
  'password-reset': t.passwordResetEmail({ name: 'Asha Patel', resetUrl: 'http://localhost:5173/reset-password?token=abc123', expiresInMinutes: 30 }),
  welcome: t.welcomeEmail({ name: 'Asha Patel' }),
  staffWelcome: t.staffWelcomeEmail({ name: 'Asha Patel', role: 'REVIEWER', resetUrl: 'https://example.com/reset-password?token=abc', expiresInHours: 72 }),
};

for (const [name, content] of Object.entries(previews)) {
  writeFileSync(join(out, `${name}.html`), content.html ?? '');
}
console.log(`Wrote ${Object.keys(previews).length} previews to ${out}/`);
