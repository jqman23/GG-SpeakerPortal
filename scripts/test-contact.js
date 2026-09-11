import test from 'node:test';
import assert from 'node:assert/strict';
import { buildContactEmail } from '../api/contact.js';

test('contact email is reply-friendly and escapes submitted content', () => {
  const email = buildContactEmail({ name: 'Jordan Example', email: 'jordan@example.org', session: 'A Session', message: '<script>alert(1)</script>\nSecond line' });
  assert.match(email.subject, /^\[Speaker Portal\] Message from Jordan Example/);
  assert.match(email.text, /Reply directly to this email/);
  assert.match(email.html, /jordan@example\.org/);
  assert.doesNotMatch(email.html, /<script>/);
  assert.match(email.html, /&lt;script&gt;/);
});
