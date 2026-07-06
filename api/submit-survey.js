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

function formatConfirmedVideoFormat(formatConfirmation, sessionVideoFormat) {
  const cleanConfirmation = String(formatConfirmation || '').trim();
  const normalizedConfirmation = cleanConfirmation.toLowerCase();
  if (normalizedConfirmation.includes('zoom')) return 'Zoom';
  if (normalizedConfirmation.includes('embedded')) return 'Embedded';
  return formatSessionVideoFormat(sessionVideoFormat);
}

function formatSessionRecordingStatus(value) {
  const clean = String(value || '').trim();
  const normalized = clean.toLowerCase();
  if (!clean) return '';
  if (
    normalized.includes('not') ||
    normalized === 'no' ||
    normalized === 'false' ||
    normalized === 'n/a' ||
    normalized === 'na' ||
    normalized.startsWith('no ') ||
    normalized.includes('non-record') ||
    normalized.includes('no recording') ||
    normalized.includes('unrecorded')
  ) {
    return 'Not recorded';
  }
  if (
    normalized === 'yes' ||
    normalized === 'true' ||
    normalized.includes('recorded') ||
    normalized.includes('recording')
  ) {
    return 'Recorded';
  }
  return clean;
}

function formatConfirmedRecordingStatus(recordingConfirmation, sessionRecordingStatus) {
  const cleanConfirmation = String(recordingConfirmation || '').trim();
  const normalizedConfirmation = cleanConfirmation.toLowerCase();
  if (normalizedConfirmation) {
    if (normalizedConfirmation.includes('not record') || normalizedConfirmation.includes('not be recorded') || normalizedConfirmation.includes('do not record')) {
      return 'Not recorded';
    }
    if (normalizedConfirmation.includes('record')) return 'Recorded';
  }
  return formatSessionRecordingStatus(sessionRecordingStatus);
}

function toBoolean(value) {
  return value === true || value === 'true' || value === '1' || value === 1;
}

function normalizeCcEmails(value, primaryEmail = '') {
  const primary = String(primaryEmail || '').trim().toLowerCase();
  const seen = new Set();
  const list = Array.isArray(value) ? value : [];
  return list
    .map(item => String(item || '').trim())
    .filter(item => item && item.toLowerCase() !== primary)
    .filter(item => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 5);
}

function buildConfirmationEmail({
  firstName,
  name,
  sessionTitle,
  sessionVideoFormat,
  sessionRecordingStatus,
  ceuObjectives,
  ceuQuestions,
  ceuOptOut,
  sessionFollowupPrompt,
  sessionFollowupResponse,
  formatConfirmation,
  recordingConfirmation,
  prerecordConfirmation,
  prerecordLiveSupport,
  sbiMaxParticipants,
  additionalNotes,
  isResubmission
}) {
  const cleanName = (name || [firstName].filter(Boolean).join(" ")).trim();
  const salutationName = (firstName?.trim() || cleanName || "there").split(/\s+/)[0];
  const cleanSessionTitle = sessionTitle?.trim() || 'Not provided';
  const cleanSessionVideoFormat = formatConfirmedVideoFormat(formatConfirmation, sessionVideoFormat) || '';
  const cleanSessionRecordingStatus = formatConfirmedRecordingStatus(recordingConfirmation, sessionRecordingStatus) || '';
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
    prerecordLiveSupport?.trim() ? `Live chat during "simulive" session:\n${prerecordLiveSupport.trim()}` : '',
    sbiMaxParticipants?.toString().trim() ? `Maximum participants: ${sbiMaxParticipants.toString().trim()}` : '',
    ceuOptOut ? 'CEU credit: Opted out' : '',
    sessionFollowupResponse?.trim() ? `${sessionFollowupPrompt?.trim() || 'Session follow-up'}:\n${sessionFollowupResponse.trim()}` : '',
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
    ['Live chat during "simulive" session', prerecordLiveSupport],
    ['Maximum participants', sbiMaxParticipants != null ? String(sbiMaxParticipants) : ''],
    ['CEU credit', ceuOptOut ? 'Opted out' : ''],
    [sessionFollowupPrompt || 'Session follow-up', sessionFollowupResponse],
    ['CEU objectives', ceuObjectives],
    ['CEU questions', ceuQuestions],
    ['Questions or requests', additionalNotes]
  ].filter(([, value]) => value?.trim());

  const html = `
    <div style="margin:0; padding:32px 16px; background:#ffffff; font-family:Montserrat, Arial, sans-serif; color:#1f2937; line-height:1.5;">
      <div style="max-width:680px; margin:0 auto;">
        <img
          src="https://custom.cvent.com/AE944F71438646268B70FF5BF3772347/files/event/e7d15afcf2b14901ab0272ce8a401899/4c40728a45af4e0289e8075b9759c684.png"
          width="680"
          alt="2026 Global Gathering for the Future of Child Welfare"
          style="display:block; width:100%; max-width:680px; height:auto; border:0; outline:none; text-decoration:none; margin:0 0 18px 0;"
        />
        <div style="background:#ffffff; border:1px solid #d9e2ea; border-radius:8px; padding:28px;">
          <p style="margin:0 0 8px 0; color:#46775D; font-size:12px; font-weight:bold; letter-spacing:0.04em; text-transform:uppercase;">${escapeHtml(eyebrow)}</p>
          <h1 style="margin:0 0 14px 0; color:#122345; font-size:26px; line-height:1.25;">Thank you, ${escapeHtml(salutationName)}.</h1>
          <p style="margin:0 0 18px 0; font-size:15px;">We received your Speaker Questionnaire ${escapeHtml(responseNoun)} to the <strong><em>2026 Global Gathering for the Future of Child Welfare</em></strong>.</p>
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

const NOTIFICATION_TO = 'globalgathering@cuanschutz.edu';
const SPEAKER_EMAIL_MISMATCH_TO = 'joshua.kumin@cuanschutz.edu';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function buildNotificationEmail({
  name,
  email,
  sessionTitle,
  additionalNotes,
  submittedAt,
  isResubmission
}) {
  const cleanName = (name || '').trim() || 'Unknown speaker';
  const cleanSession = (sessionTitle || '').trim() || 'Unknown session';
  const cleanNotes = (additionalNotes || '').trim();
  const verb = isResubmission ? 'updated' : 'submitted';
  const subject = `Speaker note: ${cleanName} – ${cleanSession}`;

  const text = compactLines([
    `${cleanName} ${verb} their Speaker Questionnaire and included the following note:`,
    '',
    '---',
    cleanNotes,
    '---',
    '',
    `Speaker: ${cleanName}`,
    `Email: ${email}`,
    `Session: ${cleanSession}`,
    submittedAt ? `Submitted: ${submittedAt}` : '',
    ''
  ]);

  const html = `
    <div style="margin:0; padding:32px 16px; background:#ffffff; font-family:Montserrat, Arial, sans-serif; color:#1f2937; line-height:1.5;">
      <div style="max-width:680px; margin:0 auto;">
        <div style="background:#ffffff; border:1px solid #d9e2ea; border-radius:8px; padding:28px;">
          <p style="margin:0 0 6px 0; color:#46775D; font-size:12px; font-weight:bold; letter-spacing:0.04em; text-transform:uppercase;">Speaker Questionnaire Note</p>
          <h1 style="margin:0 0 18px 0; color:#122345; font-size:22px; line-height:1.3;">${escapeHtml(cleanName)} ${escapeHtml(verb)} their questionnaire and left a note.</h1>

          <div style="margin:0 0 22px 0; padding:16px 18px; background:#FFF8E1; border-left:4px solid #F59E0B; border-radius:6px;">
            <p style="margin:0 0 6px 0; font-size:11px; font-weight:bold; letter-spacing:0.05em; text-transform:uppercase; color:#92400E;">Their note</p>
            <p style="margin:0; font-size:15px; white-space:pre-wrap; color:#1f2937;">${escapeHtml(cleanNotes)}</p>
          </div>

          <table cellpadding="0" cellspacing="0" style="border-collapse:collapse; width:100%; border:1px solid #d9e2ea; border-radius:8px; overflow:hidden; margin:0 0 22px 0;">
            <tr>
              <td style="padding:11px 14px; font-weight:bold; color:#122345; width:130px; vertical-align:top; border-bottom:1px solid #e5edf3;">Speaker</td>
              <td style="padding:11px 14px; vertical-align:top; border-bottom:1px solid #e5edf3;">${escapeHtml(cleanName)}</td>
            </tr>
            <tr>
              <td style="padding:11px 14px; font-weight:bold; color:#122345; vertical-align:top; border-bottom:1px solid #e5edf3;">Email</td>
              <td style="padding:11px 14px; vertical-align:top; border-bottom:1px solid #e5edf3;"><a href="mailto:${escapeHtml(email)}" style="color:#0563C1;">${escapeHtml(email)}</a></td>
            </tr>
            <tr>
              <td style="padding:11px 14px; font-weight:bold; color:#122345; vertical-align:top; border-bottom:1px solid #e5edf3;">Session</td>
              <td style="padding:11px 14px; vertical-align:top; border-bottom:1px solid #e5edf3;"><em>${escapeHtml(cleanSession)}</em></td>
            </tr>
            ${submittedAt ? `
            <tr>
              <td style="padding:11px 14px; font-weight:bold; color:#122345; vertical-align:top;">Submitted</td>
              <td style="padding:11px 14px; vertical-align:top;">${escapeHtml(submittedAt)}</td>
            </tr>` : ''}
          </table>

        </div>
      </div>
    </div>
  `;

  return { subject, text, html };
}

async function sendNotificationEmail(response) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.SURVEY_CONFIRMATION_FROM;
  if (!apiKey || !from) return;

  const email = buildNotificationEmail(response);
  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: NOTIFICATION_TO,
      reply_to: response.email.trim(),
      subject: email.subject,
      text: email.text,
      html: email.html
    })
  });

  if (!resendResponse.ok) {
    const details = await resendResponse.text();
    throw new Error(`Resend notification error ${resendResponse.status}: ${details}`);
  }
}

function buildSpeakerEmailMismatchEmail({
  name,
  email,
  sessionTitle,
  sessionCode,
  sessionId,
  associatedSpeakers,
  submittedAt,
  isResubmission
}) {
  const cleanName = (name || '').trim() || 'Unknown submitter';
  const cleanEmail = (email || '').trim() || 'Unknown email';
  const cleanSession = (sessionTitle || '').trim() || 'Unknown session';
  const cleanSessionCode = (sessionCode || '').trim();
  const action = isResubmission ? 'resubmitted' : 'submitted';
  const speakerRows = (associatedSpeakers || []).length
    ? associatedSpeakers.map(speaker => {
      const speakerName = (speaker.name || '').trim() || 'Unnamed speaker';
      const speakerEmail = (speaker.email || '').trim() || 'No email on file';
      return `${speakerName} <${speakerEmail}>`;
    })
    : ['No speakers with emails were found for this session.'];

  const subject = `Speaker email mismatch: ${cleanName} – ${cleanSession}`;
  const text = compactLines([
    `${cleanName} ${action} a Speaker Questionnaire using an email address that does not match a speaker email associated with the selected session.`,
    '',
    `Submitted name: ${cleanName}`,
    `Submitted email: ${cleanEmail}`,
    `Session: ${cleanSession}`,
    cleanSessionCode ? `Session code: ${cleanSessionCode}` : '',
    sessionId ? `Session ID: ${sessionId}` : '',
    submittedAt ? `Submitted: ${submittedAt}` : '',
    '',
    'Associated speaker emails on file:',
    ...speakerRows.map(row => `- ${row}`)
  ]);

  const html = `
    <div style="margin:0; padding:32px 16px; background:#ffffff; font-family:Montserrat, Arial, sans-serif; color:#1f2937; line-height:1.5;">
      <div style="max-width:680px; margin:0 auto;">
        <div style="background:#ffffff; border:1px solid #d9e2ea; border-radius:8px; padding:28px;">
          <p style="margin:0 0 6px 0; color:#B45309; font-size:12px; font-weight:bold; letter-spacing:0.04em; text-transform:uppercase;">Speaker Email Mismatch</p>
          <h1 style="margin:0 0 18px 0; color:#122345; font-size:22px; line-height:1.3;">A questionnaire was ${escapeHtml(action)} from an email not associated with this session.</h1>

          <table cellpadding="0" cellspacing="0" style="border-collapse:collapse; width:100%; border:1px solid #d9e2ea; border-radius:8px; overflow:hidden; margin:0 0 22px 0;">
            <tr>
              <td style="padding:11px 14px; font-weight:bold; color:#122345; width:150px; vertical-align:top; border-bottom:1px solid #e5edf3;">Submitted name</td>
              <td style="padding:11px 14px; vertical-align:top; border-bottom:1px solid #e5edf3;">${escapeHtml(cleanName)}</td>
            </tr>
            <tr>
              <td style="padding:11px 14px; font-weight:bold; color:#122345; vertical-align:top; border-bottom:1px solid #e5edf3;">Submitted email</td>
              <td style="padding:11px 14px; vertical-align:top; border-bottom:1px solid #e5edf3;"><a href="mailto:${escapeHtml(cleanEmail)}" style="color:#0563C1;">${escapeHtml(cleanEmail)}</a></td>
            </tr>
            <tr>
              <td style="padding:11px 14px; font-weight:bold; color:#122345; vertical-align:top; border-bottom:1px solid #e5edf3;">Session</td>
              <td style="padding:11px 14px; vertical-align:top; border-bottom:1px solid #e5edf3;"><em>${escapeHtml(cleanSession)}</em></td>
            </tr>
            ${cleanSessionCode ? `
            <tr>
              <td style="padding:11px 14px; font-weight:bold; color:#122345; vertical-align:top; border-bottom:1px solid #e5edf3;">Session code</td>
              <td style="padding:11px 14px; vertical-align:top; border-bottom:1px solid #e5edf3;">${escapeHtml(cleanSessionCode)}</td>
            </tr>` : ''}
            ${sessionId ? `
            <tr>
              <td style="padding:11px 14px; font-weight:bold; color:#122345; vertical-align:top; border-bottom:1px solid #e5edf3;">Session ID</td>
              <td style="padding:11px 14px; vertical-align:top; border-bottom:1px solid #e5edf3;">${escapeHtml(sessionId)}</td>
            </tr>` : ''}
            ${submittedAt ? `
            <tr>
              <td style="padding:11px 14px; font-weight:bold; color:#122345; vertical-align:top;">Submitted</td>
              <td style="padding:11px 14px; vertical-align:top;">${escapeHtml(submittedAt)}</td>
            </tr>` : ''}
          </table>

          <p style="margin:0 0 8px 0; color:#122345; font-size:15px; font-weight:bold;">Associated speaker emails on file:</p>
          <ul style="margin:0; padding-left:20px;">
            ${speakerRows.map(row => `<li style="margin:0 0 6px 0;">${escapeHtml(row)}</li>`).join('')}
          </ul>
        </div>
      </div>
    </div>
  `;

  return { subject, text, html };
}

async function sendSpeakerEmailMismatchEmail(response) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.SURVEY_CONFIRMATION_FROM;
  if (!apiKey || !from) return;

  const email = buildSpeakerEmailMismatchEmail(response);
  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: SPEAKER_EMAIL_MISMATCH_TO,
      reply_to: response.email.trim(),
      subject: email.subject,
      text: email.text,
      html: email.html
    })
  });

  if (!resendResponse.ok) {
    const details = await resendResponse.text();
    throw new Error(`Resend speaker email mismatch error ${resendResponse.status}: ${details}`);
  }
}

async function getAssociatedSpeakersForSession(sql, sessionId) {
  return sql`
    SELECT
      TRIM(sp.first_name || ' ' || sp.last_name) AS name,
      sp.email
    FROM session_speakers ss
    JOIN speakers sp ON ss.speaker_code = sp.speaker_code
    WHERE ss.session_id = ${sessionId}
    ORDER BY sp.last_name, sp.first_name
  `;
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
  const cc = normalizeCcEmails(response.ccEmails, response.email);
  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: response.email.trim(),
      ...(cc.length ? { cc } : {}),
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
    ccEmails,
    sessionId,
    sessionCode,
    sessionTitle,
    sessionVideoFormat,
    sessionRecordingStatus,
    ceuObjectives,
    ceuQuestions,
    ceuOptOut,
    sessionFollowupPrompt,
    sessionFollowupResponse,
    formatConfirmation,
    recordingConfirmation,
    prerecordConfirmation,
    prerecordLiveSupport,
    sbiMaxParticipants,
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
  const cleanCeuOptOut = toBoolean(ceuOptOut);

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
        ceu_opt_out,
        session_followup_prompt,
        session_followup_response,
        format_confirmation,
        recording_confirmation,
        prerecord_confirmation,
        prerecord_live_support,
        sbi_max_participants,
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
        ${cleanCeuOptOut ? null : ceuObjectives?.trim() || null},
        ${cleanCeuOptOut ? null : ceuQuestions?.trim() || null},
        ${cleanCeuOptOut},
        ${sessionFollowupPrompt?.trim() || null},
        ${sessionFollowupResponse?.trim() || null},
        ${formatConfirmation?.trim() || null},
        ${recordingConfirmation?.trim() || null},
        ${prerecordConfirmation?.trim() || null},
        ${prerecordLiveSupport?.trim() || null},
        ${sbiMaxParticipants ? String(sbiMaxParticipants).trim() : null},
        ${(additionalNotes || q3)?.trim() || null},
        ${q1?.trim() || null},
        ${q2?.trim() || null}
      )
    `;

    const cleanAdditionalNotes = (additionalNotes || q3 || '').trim();
    const submittedAt = new Date().toLocaleString('en-US', { timeZone: 'America/Denver', dateStyle: 'long', timeStyle: 'short' }) + ' MDT';
    const associatedSpeakers = await getAssociatedSpeakersForSession(sql, sessionId.trim());
    const submittedEmail = normalizeEmail(email);
    const associatedEmails = new Set(
      associatedSpeakers
        .map(speaker => normalizeEmail(speaker.email))
        .filter(Boolean)
    );

    if (!associatedEmails.has(submittedEmail)) {
      try {
        await sendSpeakerEmailMismatchEmail({
          name: cleanName,
          email,
          sessionTitle,
          sessionCode,
          sessionId: sessionId.trim(),
          associatedSpeakers,
          submittedAt,
          isResubmission
        });
      } catch (mismatchErr) {
        console.error('Speaker email mismatch notification error:', mismatchErr);
      }
    }

    if (cleanAdditionalNotes) {
      try {
        await sendNotificationEmail({
          name: cleanName,
          email,
          sessionTitle,
          additionalNotes: cleanAdditionalNotes,
          submittedAt,
          isResubmission
        });
      } catch (notifyErr) {
        console.error('Notification email error:', notifyErr);
      }
    }

    try {
      const emailResult = await sendConfirmationEmail({
        firstName: cleanFirstName,
        name: cleanName,
        email,
        ccEmails,
        sessionTitle,
        sessionVideoFormat,
        sessionRecordingStatus,
        ceuObjectives: cleanCeuOptOut ? '' : ceuObjectives,
        ceuQuestions: cleanCeuOptOut ? '' : ceuQuestions,
        ceuOptOut: cleanCeuOptOut,
        sessionFollowupPrompt,
        sessionFollowupResponse,
        formatConfirmation,
        recordingConfirmation,
        prerecordConfirmation,
        prerecordLiveSupport,
        sbiMaxParticipants,
        additionalNotes: cleanAdditionalNotes,
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
