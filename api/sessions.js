import { getDb } from './db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const sql = getDb();
    const rows = await sql`
      SELECT
        s.session_id,
        s.session_code,
        s.session_name,
        s.description,
        s.session_start,
        s.session_end,
        s.presentation_type,
        s.ceu_eligibility,
        s.recording_status,
        s.video_format,
        s.pre_record_interest,
        COALESCE(
          ARRAY_AGG(
            CASE WHEN sp.speaker_code IS NOT NULL
              THEN TRIM(sp.first_name || ' ' || sp.last_name)
            END
          ) FILTER (WHERE sp.speaker_code IS NOT NULL),
          '{}'
        ) AS speaker_names
      FROM sessions s
      LEFT JOIN session_speakers ss ON s.session_id = ss.session_id
      LEFT JOIN speakers sp ON ss.speaker_code = sp.speaker_code
      GROUP BY s.session_id, s.session_code, s.session_name, s.description, s.session_start, s.session_end, s.presentation_type, s.ceu_eligibility, s.recording_status, s.video_format, s.pre_record_interest
      ORDER BY s.session_name
    `;

    const sessions = rows.map(r => ({
      id:             r.session_id,
      code:           r.session_code || '',
      title:          r.session_name,
      description:    r.description || '',
      start:          r.session_start || '',
      end:            r.session_end || '',
      presentationType: r.presentation_type || '',
      speakers:       (r.speaker_names || []).map(name => ({ name })),
      ceuEligibility: r.ceu_eligibility || '',
      recordingStatus: r.recording_status || '',
      videoFormat:    r.video_format || '',
      preRecordInterest: r.pre_record_interest || '',
    }));

    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.status(200).json({
      SESSIONS_AS_OF: new Date().toISOString().split('T')[0],
      sessions,
    });
  } catch (err) {
    console.error('Sessions fetch error:', err);
    return res.status(500).json({ error: 'Failed to load session data.' });
  }
}
