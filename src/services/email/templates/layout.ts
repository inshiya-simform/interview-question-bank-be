// Email-safe markup (tables, inline styles). Colours and type follow the web app's design tokens
// (interview-question-bank-fe/src/index.css); keep them in sync when the app is rethemed.
const C = {
  page: '#f4f5f8',
  surface: '#ffffff',
  line: '#e4e7ec',
  ink: '#101828',
  inkSoft: '#344054',
  muted: '#5b6576',
  accent: '#3347d6',
  accentSoft: '#eef0fd',
  accentInk: '#2634ae',
  brand: '#1b2559',
  brandText: '#c7cef2',
  okSoft: '#e3f6f1',
  okInk: '#0b5c48',
  neutralChip: '#eaecf0',
  warmWash: '#fff8ea',
  warmLine: '#f2d49b',
  warmInk: '#7a4100',
};

const FONT = "Inter,'Segoe UI',Roboto,Arial,sans-serif";
export const APP_NAME = 'Interview Question Bank';

export const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Keeps line breaks in user-written text.
const multiline = (value: string) => escapeHtml(value).replace(/\r?\n/g, '<br>');

export const paragraph = (html: string) =>
  `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${C.inkSoft}">${html}</p>`;

export const button = (href: string, label: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px"><tr><td style="border-radius:8px;background:${C.accent}">` +
  `<a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 22px;font:600 15px ${FONT};color:#ffffff;text-decoration:none;border-radius:8px">${escapeHtml(label)}</a>` +
  `</td></tr></table>`;

export const questionQuote = (text: string) =>
  `<div style="margin:0 0 20px;padding:14px 16px;background:${C.page};border:1px solid ${C.line};border-radius:8px">` +
  `<div style="margin:0 0 6px;font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:${C.muted}">Question</div>` +
  `<div style="font-size:15px;line-height:1.55;color:${C.ink}">${multiline(text)}</div></div>`;

// Reviewer's note, set apart so it isn't missed.
export const noteBox = (label: string, text: string) =>
  `<div style="margin:0 0 20px;padding:14px 16px;background:${C.warmWash};border:1px solid ${C.warmLine};border-radius:8px">` +
  `<div style="margin:0 0 6px;font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:${C.warmInk}">${escapeHtml(label)}</div>` +
  `<div style="font-size:15px;line-height:1.55;color:${C.warmInk}">${multiline(text)}</div></div>`;

type Tone = 'approved' | 'changes' | 'rejected';
const TONES: Record<Tone, { bg: string; fg: string; glyph: string }> = {
  approved: { bg: C.okSoft, fg: C.okInk, glyph: '✓' },
  changes: { bg: C.accentSoft, fg: C.accentInk, glyph: '✎' },
  rejected: { bg: C.neutralChip, fg: C.ink, glyph: '✕' },
};

// Status chip: glyph plus label, never colour alone (same rule as the app).
export const statusChip = (tone: Tone, label: string) => {
  const t = TONES[tone];
  return `<span style="display:inline-block;margin:0 0 16px;padding:4px 12px;border-radius:999px;background:${t.bg};color:${t.fg};font-size:13px;font-weight:600">${t.glyph}&nbsp; ${escapeHtml(label)}</span>`;
};

export function layout(params: { title: string; preheader: string; body: string }) {
  const { title, preheader, body } = params;
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="light"><title>${escapeHtml(title)}</title></head>` +
    `<body style="margin:0;padding:0;background:${C.page};font-family:${FONT}">` +
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(preheader)}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page}"><tr><td align="center" style="padding:32px 16px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">` +
    // brand header
    `<tr><td style="background:${C.brand};border-radius:12px 12px 0 0;padding:20px 28px">` +
    `<table role="presentation" cellpadding="0" cellspacing="0"><tr>` +
    `<td style="width:34px;height:34px;background:#ffffff;border-radius:8px;text-align:center;font:700 20px ${FONT};color:${C.brand}">?</td>` +
    `<td style="padding-left:12px;font:700 16px ${FONT};color:#ffffff">${APP_NAME}</td>` +
    `</tr></table></td></tr>` +
    // card
    `<tr><td style="background:${C.surface};border:1px solid ${C.line};border-top:0;border-radius:0 0 12px 12px;padding:32px 28px 12px">` +
    `<h1 style="margin:0 0 16px;font:700 22px/1.25 ${FONT};letter-spacing:-.01em;color:${C.ink}">${escapeHtml(title)}</h1>` +
    body +
    `</td></tr>` +
    // footer
    `<tr><td style="padding:20px 8px;text-align:center;font:400 12px/1.5 ${FONT};color:${C.muted}">` +
    `You're receiving this because you have an account on ${APP_NAME}.</td></tr>` +
    `</table></td></tr></table></body></html>`
  );
}
