export interface EmailNotification {
  to: { email: string; name?: string };
  subject: string;
  heading: string;
  category?: string;
  preview?: string;
  paragraphs: string[];
  details?: { label: string; value: string }[];
  action?: { label: string; url: string };
  footnote?: string;
}
export interface RenderedEmail { html: string; text: string }

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}
export function validateEmailAddress(value: string): void {
  if (typeof value !== 'string' || value.length > 254 || !/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(value)) throw new TypeError('A single valid email address is required');
}
function text(value: string, label: string, maximum = 4000): void {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) throw new TypeError(`${label} must be non-empty text up to ${maximum} characters`);
}
function validate(notification: EmailNotification): void {
  validateEmailAddress(notification.to?.email);
  if (notification.to.name !== undefined) text(notification.to.name, 'Recipient name', 200);
  text(notification.subject, 'Subject', 200);
  if (/[\r\n]/.test(notification.subject)) throw new TypeError('Subject must be a single line');
  text(notification.heading, 'Heading', 200);
  if (notification.category !== undefined) text(notification.category, 'Category', 100);
  if (notification.preview !== undefined) text(notification.preview, 'Preview', 300);
  if (!Array.isArray(notification.paragraphs) || notification.paragraphs.length < 1 || notification.paragraphs.length > 20) throw new TypeError('Provide 1–20 paragraphs');
  notification.paragraphs.forEach(paragraph => text(paragraph, 'Paragraph'));
  if (notification.details !== undefined) {
    if (!Array.isArray(notification.details) || notification.details.length > 20) throw new TypeError('Provide at most 20 details');
    notification.details.forEach(detail => { text(detail.label, 'Detail label', 100); text(detail.value, 'Detail value', 2000); });
  }
  if (notification.action !== undefined) {
    text(notification.action.label, 'Action label', 100);
    text(notification.action.url, 'Action URL', 4096);
    const url = new URL(notification.action.url);
    if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) throw new TypeError('Action URLs must use HTTPS (except localhost) and contain no credentials');
  }
  if (notification.footnote !== undefined) text(notification.footnote, 'Footnote', 2000);
}

/** Pure renderer: accepts text, never untrusted HTML. Uses inline styles for email clients. */
export function renderThemedEmail(notification: EmailNotification): RenderedEmail {
  validate(notification);
  const e = escapeHtml;
  const paragraphs = [notification.to.name ? `Hello ${notification.to.name},` : 'Hello,', ...notification.paragraphs];
  const details = notification.details ?? [];
  const plain = [
    'Letchworth, Baldock & Ashwell Scouts', notification.category ?? 'District Workflow', notification.heading,
    ...paragraphs, ...details.map(detail => `${detail.label}: ${detail.value}`),
    ...(notification.action ? [`${notification.action.label}:\n${notification.action.url}`] : []),
    ...(notification.footnote ? [notification.footnote] : []),
    'More time for #SkillsForLife.',
  ].join('\n\n');
  // Email-client compatibility requires legacy table attributes and Outlook-specific CSS.
  // noinspection HtmlDeprecatedAttribute,CssUnknownProperty
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${e(notification.subject)}</title></head>
<body style="margin:0;padding:0;background-color:#f5f8f8;color:#172329;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${e(notification.preview ?? notification.heading)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f5f8f8;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #dfe7e7;border-radius:14px;">
<tr><td style="padding:30px;background-color:#103d3f;color:#ffffff;border-radius:14px 14px 0 0;">
<p style="margin:0 0 18px;font-size:15px;line-height:1.5;">Letchworth, Baldock &amp; Ashwell Scouts</p>
<p style="margin:0 0 10px;color:#86e8a8;font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;">${e(notification.category ?? 'District Workflow')}</p>
<h1 style="margin:0;font-size:28px;line-height:1.2;">${e(notification.heading)}</h1></td></tr>
<tr><td style="padding:30px;font-size:16px;line-height:1.6;">
${paragraphs.map(paragraph => `<p style="margin:0 0 18px;">${e(paragraph).replace(/\n/g, '<br>')}</p>`).join('\n')}
${details.length ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:12px 0 24px;background-color:#f5f8f8;border:1px solid #dfe7e7;border-radius:8px;">${details.map(detail => `<tr><td style="padding:12px 16px;overflow-wrap:anywhere;"><strong>${e(detail.label)}</strong><br>${e(detail.value).replace(/\n/g, '<br>')}</td></tr>`).join('')}</table>` : ''}
${notification.action ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0;"><tr><td bgcolor="#05696c" style="background-color:#05696c;border-radius:8px;"><a href="${e(notification.action.url)}" style="display:inline-block;padding:14px 22px;color:#ffffff;text-decoration:none;font-weight:bold;">${e(notification.action.label)}</a></td></tr></table><p style="font-size:12px;line-height:1.5;color:#66747b;overflow-wrap:anywhere;">If the button does not work, copy this link:<br><a href="${e(notification.action.url)}" style="color:#05696c;word-break:break-all;">${e(notification.action.url)}</a></p>` : ''}
${notification.footnote ? `<p style="margin:24px 0 0;padding-top:20px;border-top:1px solid #dfe7e7;font-size:13px;color:#66747b;">${e(notification.footnote).replace(/\n/g, '<br>')}</p>` : ''}
</td></tr><tr><td style="padding:22px 30px;background-color:#0c3436;color:#86e8a8;border-radius:0 0 14px 14px;font-size:14px;">More time for <strong>#SkillsForLife.</strong></td></tr>
</table></td></tr></table></body></html>`;
  return { html, text: plain };
}
