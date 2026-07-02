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

function splitLegacyName(value) {
  const clean = String(value || '').trim().replace(/\s+/g, ' ');
  if (!clean) return { firstName: '', lastName: '' };
  const parts = clean.split(' ');
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function formatSessionVideoFormat(value) {
  const clean = String(value || '').trim();
  const normalized = clean.toLowerCase();
  if (!clean) return '';
  if (normalized.includes('zoom')) return 'Zoom';
  if (normalized.includes('embedded')) return 'Embedded';
  return clean;
}

function formatSessionRecordingStatus(value) {
  const clean = String(value || '').trim();
  const normalized = clean.toLowerCase();
  if (!clean) return '';
  if (normalized.includes('not')) return 'Marked as not recorded';
  return 'Marked to be recorded';
}

function buildConfirmationEmail({
  firstName,
  name,
  sessionTitle,
  sessionVideoFormat,
  sessionRecordingStatus,
  ceuObjectives,
  ceuQuestions,
  formatConfirmation,
  recordingConfirmation,
  prerecordConfirmation,
  additionalNotes,
  isResubmission
}) {
  const cleanName = (name || [firstName].filter(Boolean).join(" ")).trim();
  const salutationName = (firstName?.trim() || cleanName || "there").split(/\s+/)[0];
  const cleanSessionTitle = sessionTitle?.trim() || 'Not provided';
  const cleanSessionVideoFormat = formatSessionVideoFormat(sessionVideoFormat) || formatConfirmation?.trim() || '';
  const cleanSessionRecordingStatus = formatSessionRecordingStatus(sessionRecordingStatus) || recordingConfirmation?.trim() || '';
  const responseNoun = isResubmission ? 'updated response' : 'response';
  const subjectPrefix = isResubmission ? 'Speaker Questionnaire update confirmation' : 'Speaker Questionnaire confirmation';
  const eyebrow = isResubmission ? 'Speaker Questionnaire update received' : 'Speaker Questionnaire received';
  const text = compactLines([
    `Hello ${salutationName},`,
    '',
    isResubmission
      ? 'Thank you for updating your Speaker Questionnaire for the 2026 Global Gathering. We received your updated response for:'
      : 'Thank you for completing the Speaker Questionnaire for the 2026 Global Gathering. We received your response for:',
    '',
    `*${cleanSessionTitle}*`,
    '',
    'Summary of your response:',
    cleanSessionVideoFormat ? `Format: ${cleanSessionVideoFormat}` : '',
    cleanSessionRecordingStatus ? `Recording: ${cleanSessionRecordingStatus}` : '',
    prerecordConfirmation?.trim() ? `Pre-recording: ${prerecordConfirmation.trim()}` : '',
    ceuObjectives?.trim() ? `CEU objectives:\n${ceuObjectives.trim()}` : '',
    ceuQuestions?.trim() ? `CEU questions:\n${ceuQuestions.trim()}` : '',
    additionalNotes?.trim() ? `Questions or requests:\n${additionalNotes.trim()}` : '',
    '',
    'Questions? Reply to this email or contact globalgathering@cuanschutz.edu.',
    '',
    'Global Gathering Team',
    'The Kempe Center for the Prevention and Treatment of Child Abuse & Neglect',
    'University of Colorado Anschutz Medical Campus | Department of Pediatrics',
    '13121 E. 17th Ave., 5th Floor, Box C221, Aurora, CO 80045',
    'E: globalgathering@cuanschutz.edu | www.futureofchildwelfare.org'
  ]);

  const htmlRows = [
    ['Session', sessionTitle],
    ['Format', cleanSessionVideoFormat],
    ['Recording', cleanSessionRecordingStatus],
    ['Pre-recording', prerecordConfirmation],
    ['CEU objectives', ceuObjectives],
    ['CEU questions', ceuQuestions],
    ['Questions or requests', additionalNotes]
  ].filter(([, value]) => value?.trim());

  const html = `
    <div style="margin:0; padding:32px 16px; background:#ffffff; font-family:Montserrat, Arial, sans-serif; color:#1f2937; line-height:1.5;">
      <div style="max-width:680px; margin:0 auto;">
        <div style="background:#ffffff; border:1px solid #d9e2ea; border-radius:8px; padding:28px;">
          <p style="margin:0 0 8px 0; color:#46775D; font-size:12px; font-weight:bold; letter-spacing:0.04em; text-transform:uppercase;">${escapeHtml(eyebrow)}</p>
          <h1 style="margin:0 0 14px 0; color:#122345; font-size:26px; line-height:1.25;">Thank you, ${escapeHtml(salutationName)}.</h1>
          <p style="margin:0 0 18px 0; font-size:15px;">We received your ${escapeHtml(responseNoun)} for the Speaker Questionnaire for the 2026 Global Gathering.</p>
          <div style="margin:0 0 22px 0; padding:14px 16px; background:#F5F7FA; border-left:4px solid #46775D; border-radius:6px;">
            <p style="margin:0 0 4px 0; font-size:12px; color:#46775D; font-weight:bold; text-transform:uppercase; letter-spacing:0.04em;">Session</p>
            <p style="margin:0; color:#122345; font-size:17px; font-weight:bold;">${escapeHtml(cleanSessionTitle)}</p>
          </div>
          <p style="margin:0 0 12px 0; color:#122345; font-size:15px; font-weight:bold;">Here is a copy of what we received:</p>
          <div style="border:1px solid #d9e2ea; border-radius:8px; overflow:hidden;">
            <table cellpadding="0" cellspacing="0" style="border-collapse: collapse; width: 100%;">
              ${htmlRows.map(([label, value], index) => `
                <tr>
                  <td style="vertical-align: top; padding:12px 14px; font-weight:bold; color:#122345; width:190px; border-top:${index === 0 ? '0' : '1px solid #e5edf3'};">${escapeHtml(label)}</td>
                  <td style="vertical-align: top; padding:12px 14px; white-space:pre-wrap; border-top:${index === 0 ? '0' : '1px solid #e5edf3'};">${label === 'Session' ? `<em>${escapeHtml(value.trim())}</em>` : escapeHtml(value.trim())}</td>
                </tr>
              `).join('')}
            </table>
          </div>
          <p style="margin:22px 0 0 0;">Questions? Reply to this email or contact <a href="mailto:globalgathering@cuanschutz.edu" style="color:#0563C1; text-decoration:underline;">globalgathering@cuanschutz.edu</a>.</p>
        </div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:24px;">
          <tr>
            <td style="font-family:Arial, sans-serif; color:#023890; font-size:12px; line-height:1.4;">
              <p style="margin:0 0 2px 0; font-size:12px; line-height:1.4; font-weight:bold; color:#023890;">
                Global Gathering Team
              </p>

              <p style="margin:0; font-size:12px; line-height:1.4; color:#023890;">
                The Kempe Center for the Prevention and Treatment of Child Abuse &amp; Neglect
              </p>

              <p style="margin:0; font-size:12px; line-height:1.4; color:#023890;">
                University of Colorado Anschutz Medical Campus | Department of Pediatrics
              </p>

              <p style="margin:0; font-size:12px; line-height:1.4; color:#023890;">
                13121 E. 17th Ave., 5th Floor, Box C221, Aurora, CO 80045
              </p>

              <p style="margin:0 0 12px 0; font-size:12px; line-height:1.4; color:#023890;">
                <strong>E:</strong>
                <a href="mailto:globalgathering@cuanschutz.edu" style="color:#0563C1; text-decoration:underline;">globalgathering@cuanschutz.edu</a>
                <span style="color:#023890;"> | </span>
                <a href="https://www.futureofchildwelfare.org/" style="color:#0563C1; text-decoration:underline;">www.futureofchildwelfare.org</a>
              </p>

              <img
                src="https://custom.cvent.com/AE944F71438646268B70FF5BF3772347/files/event/e7d15afcf2b14901ab0272ce8a401899/4c40728a45af4e0289e8075b9759c684.png"
                width="485"
                height="109"
                alt="2026 Global Gathering for the Future of Child Welfare"
                style="display:block; width:485px; max-width:100%; height:auto; border:0; outline:none; text-decoration:none;"
              />
            </td>
          </tr>
        </table>
      </div>
    </div>
  `;

  return {
    subject: `${subjectPrefix}: ${cleanSessionTitle}`,
    text,
    html
  };
}

async function sendConfirmationEmail(response) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.SURVEY_CONFIRMATION_FROM;
  if (!apiKey || !from) {
    console.warn('Skipping questionnaire confirmation email: RESEND_API_KEY or SURVEY_CONFIRMATION_FROM is not set.');
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
    firstName,
    lastName,
    name,
    email,
    sessionId,
    sessionCode,
    sessionTitle,
    sessionVideoFormat,
    sessionRecordingStatus,
    ceuObjectives,
    ceuQuestions,
    formatConfirmation,
    recordingConfirmation,
    prerecordConfirmation,
    additionalNotes,
    isResubmission,
    q1,
    q2,
    q3
  } = req.body || {};

  const parsedLegacyName = splitLegacyName(name);
  const cleanFirstName = firstName?.trim() || parsedLegacyName.firstName || "";
  const cleanLastName = lastName?.trim() || parsedLegacyName.lastName || "";
  const cleanName = [cleanFirstName, cleanLastName].filter(Boolean).join(' ') || name?.trim() || "";

  if (!cleanFirstName || !cleanLastName || !email?.trim() || !sessionId?.trim()) {
    return res.status(400).json({ error: 'First name, last name, email, and session selection are required.' });
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
        ${cleanName},
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
        firstName: cleanFirstName,
        name: cleanName,
        email,
        sessionTitle,
        sessionVideoFormat,
        sessionRecordingStatus,
        ceuObjectives,
        ceuQuestions,
        formatConfirmation,
        recordingConfirmation,
        prerecordConfirmation,
        additionalNotes: additionalNotes || q3 || '',
        isResubmission
      });
      if (!emailResult.sent) {
        return res.status(200).json({
          success: true,
          confirmationEmailSent: false,
          warning: 'Your questionnaire response was saved, but the confirmation email could not be sent.'
        });
      }
      return res.status(200).json({ success: true, confirmationEmailSent: emailResult.sent });
    } catch (emailErr) {
      console.error('Questionnaire confirmation email error:', emailErr);
      return res.status(200).json({
        success: true,
        confirmationEmailSent: false,
        warning: 'Your questionnaire response was saved, but the confirmation email could not be sent.'
      });
    }
  } catch (err) {
    console.error('Survey submission error:', err);
    return res.status(500).json({ error: 'Failed to save your response. Please try again or contact the Global Gathering Team.' });
  }
}
