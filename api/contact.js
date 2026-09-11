import crypto from 'node:crypto';

const RECIPIENT = 'globalgathering@cuanschutz.edu';
const limits = new Map();

function clean(value, max) { return String(value || '').trim().replace(/\r\n?/g, '\n').slice(0, max); }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]); }

export function buildContactEmail({ name, email, session, message }) {
  const subject = `[Speaker Portal] Message from ${name}${session ? ` — ${session}` : ''}`.slice(0, 240);
  const text = ['SPEAKER PORTAL CONTACT', '', `Name: ${name}`, `Email: ${email}`, `Session: ${session || 'Not provided'}`, '', 'MESSAGE', message, '', `Reply directly to this email to respond to ${name}.`].join('\n');
  const html = `<!doctype html><html><body style="margin:0;background:#f3f6f5;font-family:Arial,sans-serif;color:#243247"><div style="max-width:680px;margin:0 auto;padding:28px 16px"><div style="background:#fff;border:1px solid #d9e2df;border-radius:10px;overflow:hidden"><div style="background:#122345;color:#fff;padding:22px 26px"><div style="color:#b8cc91;font-size:11px;font-weight:700;letter-spacing:.12em">SPEAKER PORTAL CONTACT</div><h1 style="margin:6px 0 0;font-size:22px">New message from ${escapeHtml(name)}</h1></div><div style="padding:26px"><table role="presentation" style="width:100%;border-collapse:collapse;margin-bottom:24px"><tr><td style="padding:10px 12px;border-bottom:1px solid #e5ebe9;font-weight:700;width:110px">Name</td><td style="padding:10px 12px;border-bottom:1px solid #e5ebe9">${escapeHtml(name)}</td></tr><tr><td style="padding:10px 12px;border-bottom:1px solid #e5ebe9;font-weight:700">Email</td><td style="padding:10px 12px;border-bottom:1px solid #e5ebe9"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr><tr><td style="padding:10px 12px;font-weight:700">Session</td><td style="padding:10px 12px">${escapeHtml(session || 'Not provided')}</td></tr></table><div style="padding:18px;background:#f3f6ef;border-left:4px solid #89a84f;border-radius:6px"><div style="margin-bottom:8px;color:#46775d;font-size:11px;font-weight:700;letter-spacing:.08em">MESSAGE</div><div style="white-space:pre-wrap;line-height:1.6">${escapeHtml(message)}</div></div><p style="margin:22px 0 0;color:#5b6677;font-size:13px">Reply directly to this email to respond to ${escapeHtml(name)} at ${escapeHtml(email)}.</p></div></div></div></body></html>`;
  return { subject, text, html };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  const ip = String(req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0];
  const key = crypto.createHash('sha256').update(ip).digest('hex');
  const now = Date.now();
  const current = limits.get(key) || { count: 0, until: now + 3600000 };
  if (current.until <= now) { current.count = 0; current.until = now + 3600000; }
  if (++current.count > 5) { res.setHeader('Retry-After', '3600'); return res.status(429).json({ error: 'Too many messages. Please wait before trying again.' }); }
  limits.set(key, current);
  const name = clean(req.body?.name, 120), email = clean(req.body?.email, 254).toLowerCase();
  const session = clean(req.body?.session, 240), message = clean(req.body?.message, 4000);
  if (clean(req.body?.website, 200)) return res.status(200).json({ sent: true });
  if (name.length < 2) return res.status(400).json({ error: 'Enter your full name.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (!message) return res.status(400).json({ error: 'Enter a message.' });
  const apiKey = process.env.RESEND_CONTACT_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'The contact form is temporarily unavailable. Please try again later.' });
  const from = process.env.CONTACT_FORM_FROM || 'Global Gathering Speaker Portal <onboarding@resend.dev>';
  try {
    const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to: RECIPIENT, reply_to: email, ...buildContactEmail({ name, email, session, message }) }) });
    if (response.ok) return res.status(200).json({ sent: true });
    console.error('Contact form Resend error', response.status, await response.text());
  } catch (error) { console.error('Contact form request failed', error); }
  return res.status(502).json({ error: 'Your message could not be sent right now. Please try again.' });
}
