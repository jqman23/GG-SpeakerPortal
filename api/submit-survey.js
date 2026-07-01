import { getDb, ensureSchema } from './db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, email, q1, q2, q3 } = req.body || {};

  if (!name?.trim() || !email?.trim() || !q1?.trim()) {
    return res.status(400).json({ error: 'Name, email, and question 1 are required.' });
  }

  try {
    const sql = getDb();
    await ensureSchema(sql);
    await sql`
      INSERT INTO survey_responses (speaker_name, email, session_title_feedback, av_requirements, additional_notes)
      VALUES (${name.trim()}, ${email.trim()}, ${q1.trim()}, ${q2?.trim() || null}, ${q3?.trim() || null})
    `;
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Survey submission error:', err);
    return res.status(500).json({ error: 'Failed to save your response. Please try again or contact the Global Gathering Team.' });
  }
}
