import { getDb, ensureSchema } from './db.js';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function compactLines(lines) {
  return lines.filter(Boolean).join('\n');
}

function buildConfirmationEmail({
  name,
  sessionTitle,
  ceuObjectives,
  ceuQuestions,
  formatConfirmation,
  recordingConfirmation,
  prerecordConfirmation,
  additionalNotes
}) {
  const text = compactLines([
    `Hello ${name.trim()},`,
    '',
    'Thank you for completing the 2026 Global Gathering Speaker Survey. We received your response.',
    '',
    `Session: ${sessionTitle?.trim() || 'Not provided'}`,
    formatConfirmation?.trim() ? `Session format confirmation: ${formatConfirmation.trim()}` : '',
    recordingConfirmation?.trim() ? `Recording confirmation: ${recordingConfirmation.trim()}` : '',
    prerecordConfirmation?.trim() ? `Pre-recording confirmation: ${prerecordConfirmation.trim()}` : '',
    ceuObjectives?.trim() ? `CEU measurable objectives:\n${ceuObjectives.trim()}` : '',
    ceuQuestions?.trim() ? `CEU knowledge-check questions:\n${ceuQuestions.trim()}` : '',
    additionalNotes?.trim() ? `Additional questions, requests, or needs:\n${additionalNotes.trim()}` : '',
    '',
    'If you need to update your response or have questions, please contact the Global Gathering Team.',
    '',
    'Global Gathering Team'
  ]);

  const htmlRows = [
    ['Session', sessionTitle],
    ['Session format confirmation', formatConfirmation],
    ['Recording confirmation', recordingConfirmation],
    ['Pre-recording confirmation', prerecordConfirmation],
    ['CEU measurable objectives', ceuObjectives],
    ['CEU knowledge-check questions', ceuQuestions],
    ['Additional questions, requests, or needs', additionalNotes]
  ].filter(([, value]) => value?.trim());

  const html = `
    <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
      <p>Hello ${escapeHtml(name.trim())},</p>
      <p>Thank you for completing the 2026 Global Gathering Speaker Survey. We received your response.</p>
      <table cellpadding="0" cellspacing="0" style="border-collapse: collapse; width: 100%; max-width: 680px;">
        ${htmlRows.map(([label, value]) => `
          <tr>
            <td style="vertical-align: top; padding: 8px 12px 8px 0; font-weight: bold; color: #162A53; width: 220px;">${escapeHtml(label)}</td>
            <td style="vertical-align: top; padding: 8px 0; white-space: pre-wrap;">${escapeHtml(value.trim())}</td>
          </tr>
        `).join('')}
      </table>
      <p>If you need to update your response or have questions, please contact the Global Gathering Team.</p>
      <p>Global Gathering Team</p>
    </div>
  `;

  return {
    subject: `Speaker Survey confirmation: ${sessionTitle?.trim() || '2026 Global Gathering'}`,
    text,
    html
  };
}

async function sendConfirmationEmail(response) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.SURVEY_CONFIRMATION_FROM;
  if (!apiKey || !from) {
    console.warn('Skipping survey confirmation email: RESEND_API_KEY or SURVEY_CONFIRMATION_FROM is not set.');
    return { sent: false, skipped: true };
  }

  const replyTo = process.env.SURVEY_REPLY_TO || undefined;
  const email = buildConfirmationEmail(response);
  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: response.email.trim(),
      reply_to: replyTo,
      subject: email.subject,
      text: email.text,
      html: email.html
    })
  });

  if (!resendResponse.ok) {
    const details = await resendResponse.text();
    throw new Error(`Resend error ${resendResponse.status}: ${details}`);
  }

  return { sent: true };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    name,
    email,
    sessionId,
    sessionCode,
    sessionTitle,
    ceuObjectives,
    ceuQuestions,
    formatConfirmation,
    recordingConfirmation,
    prerecordConfirmation,
    additionalNotes,
    q1,
    q2,
    q3
  } = req.body || {};

  if (!name?.trim() || !email?.trim() || !sessionId?.trim()) {
    return res.status(400).json({ error: 'Name, email, and session selection are required.' });
  }

  try {
    const sql = getDb();
    await ensureSchema(sql);
    await sql`
      INSERT INTO survey_responses (
        speaker_name,
        email,
        session_id,
        session_code,
        session_title,
        ceu_objectives,
        ceu_questions,
        format_confirmation,
        recording_confirmation,
        prerecord_confirmation,
        additional_notes,
        session_title_feedback,
        av_requirements
      )
      VALUES (
        ${name.trim()},
        ${email.trim()},
        ${sessionId.trim()},
        ${sessionCode?.trim() || null},
        ${sessionTitle?.trim() || null},
        ${ceuObjectives?.trim() || null},
        ${ceuQuestions?.trim() || null},
        ${formatConfirmation?.trim() || null},
        ${recordingConfirmation?.trim() || null},
        ${prerecordConfirmation?.trim() || null},
        ${(additionalNotes || q3)?.trim() || null},
        ${q1?.trim() || null},
        ${q2?.trim() || null}
      )
    `;

    try {
      const emailResult = await sendConfirmationEmail({
        name,
        email,
        sessionTitle,
        ceuObjectives,
        ceuQuestions,
        formatConfirmation,
        recordingConfirmation,
        prerecordConfirmation,
        additionalNotes: additionalNotes || q3 || ''
      });
      return res.status(200).json({ success: true, confirmationEmailSent: emailResult.sent });
    } catch (emailErr) {
      console.error('Survey confirmation email error:', emailErr);
      return res.status(200).json({
        success: true,
        confirmationEmailSent: false,
        warning: 'Your response was saved, but the confirmation email could not be sent.'
      });
    }
  } catch (err) {
    console.error('Survey submission error:', err);
    return res.status(500).json({ error: 'Failed to save your response. Please try again or contact the Global Gathering Team.' });
  }
}
