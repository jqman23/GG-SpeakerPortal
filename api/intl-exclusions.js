import { neon } from '@neondatabase/serverless';
import { getDb } from './db.js';

// Resolves the International Exchange exclusion list to a set of excluded session IDs.
// The exclusion list itself (a list of speaker emails standing in for their sessions)
// lives in the backend masterplanner's database (a different Neon project than this
// app's own DATABASE_URL, with a tight monthly egress cap) — so that DB is only ever
// hit lazily/on-demand from the frontend (never polled, never fetched on every page
// load), and responses here are cached to keep repeat calls cheap.
//
// This is a session-level exclusion: if ANY speaker on a session has an email on the
// list, that whole session is excluded from the International Exchange questionnaire
// rule — regardless of who actually fills out the Questionnaire for it.
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!process.env.MASTERPLANNER_DATABASE_URL) {
      throw new Error('MASTERPLANNER_DATABASE_URL is not set');
    }
    const masterplannerSql = neon(process.env.MASTERPLANNER_DATABASE_URL);
    const listRows = await masterplannerSql`
      SELECT emails FROM speaker_management_lists WHERE list_key = 'intlExchangeExclusions'
    `;
    const emails = (listRows[0]?.emails || []).map(e => String(e).toLowerCase().trim());

    let excludedSessionIds = [];
    if (emails.length) {
      const sql = getDb();
      const sessionRows = await sql`
        SELECT DISTINCT ss.session_id
        FROM session_speakers ss
        JOIN speakers sp ON sp.speaker_code = ss.speaker_code
        WHERE LOWER(sp.email) = ANY(${emails})
      `;
      excludedSessionIds = sessionRows.map(r => r.session_id);
    }

    // Cache aggressively — this list changes rarely and the source DB has a tight
    // egress budget. 1 hour browser cache, 1 day stale-while-revalidate at the edge.
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    return res.status(200).json({ excludedSessionIds });
  } catch (err) {
    console.error('Intl exclusions fetch error:', err);
    return res.status(500).json({ error: 'Failed to load International Exchange exclusions.' });
  }
}
