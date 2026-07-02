import { getDb, ensureSchema } from './db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sessionId = String(req.query?.sessionId || '').trim();
  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required.' });
  }

  try {
    const sql = getDb();
    await ensureSchema(sql);
    const rows = await sql`
      SELECT
        id,
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
        submitted_at
      FROM survey_responses
      WHERE session_id = ${sessionId}
      ORDER BY submitted_at DESC, id DESC
    `;

    return res.status(200).json({
      count: rows.length,
      latest: rows[0] ? {
        id: rows[0].id,
        speakerName: rows[0].speaker_name || '',
        email: rows[0].email || '',
        sessionId: rows[0].session_id || '',
        sessionCode: rows[0].session_code || '',
        sessionTitle: rows[0].session_title || '',
        ceuObjectives: rows[0].ceu_objectives || '',
        ceuQuestions: rows[0].ceu_questions || '',
        formatConfirmation: rows[0].format_confirmation || '',
        recordingConfirmation: rows[0].recording_confirmation || '',
        prerecordConfirmation: rows[0].prerecord_confirmation || '',
        additionalNotes: rows[0].additional_notes || '',
        submittedAt: rows[0].submitted_at
      } : null
    });
  } catch (err) {
    console.error('Survey response lookup error:', err);
    return res.status(500).json({ error: 'Failed to load prior survey responses.' });
  }
}
