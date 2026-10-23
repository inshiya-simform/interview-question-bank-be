import sanitizeHtml from 'sanitize-html';

// Images in notes must be ones we uploaded: .../api/v1/uploads/images/<uuid>, relative or absolute.
export const IMAGE_PATH_PATTERN = /^(?:https?:\/\/[^/]+)?\/api\/v1\/uploads\/images\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

const options: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'strong', 'em', 'u', 's', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote',
    'code', 'pre', 'a', 'img', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  ],
  allowedAttributes: {
    a: ['href', 'rel', 'target'],
    img: ['src', 'alt', 'width', 'height'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: { img: ['http', 'https'] },
  allowProtocolRelative: false,
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer nofollow', target: '_blank' }, true),
  },
  // Drop images that are not our own uploads (this also removes data: URIs).
  exclusiveFilter: (frame) => frame.tag === 'img' && !IMAGE_PATH_PATTERN.test(frame.attribs.src ?? ''),
};

export function sanitizeNotesHtml(html: string): string {
  return sanitizeHtml(html, options).trim();
}

// Text content without markup; used to keep the original notes length limit meaningful.
export function htmlToPlainText(html: string): string {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

export function extractImageIds(html: string): string[] {
  const ids = new Set<string>();
  for (const [, src] of html.matchAll(/<img\b[^>]*?\bsrc="([^"]*)"/gi)) {
    const match = IMAGE_PATH_PATTERN.exec(src ?? '');
    if (match?.[1]) ids.add(match[1].toLowerCase());
  }
  return [...ids];
}
