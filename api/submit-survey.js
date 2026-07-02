import { getDb, ensureSchema } from './db.js';

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
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Survey submission error:', err);
    return res.status(500).json({ error: 'Failed to save your response. Please try again or contact the Global Gathering Team.' });
  }
}
