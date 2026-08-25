// Serves the changelog behind the "Recent Updates" system (Overview tab
// timeline, announcement banner, and tab badges). Entries are written via
// scripts/seed-changelog.js.
import { getDb } from './db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const sql = getDb();
    // Defensive — mirrors the widget's own guard so this endpoint can never
    // 500 on a missing table regardless of deploy/migration order.
    await sql`
      CREATE TABLE IF NOT EXISTS changelog (
        key        TEXT PRIMARY KEY,
        headline   TEXT NOT NULL,
        section    TEXT NOT NULL,
        details    TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    const rows = await sql`
      SELECT key, headline, section, details, created_at
      FROM changelog
      ORDER BY created_at DESC
    `;

    const entries = rows.map(r => ({
      key: r.key,
      headline: r.headline,
      section: r.section,
      details: r.details || '',
      createdAt: new Date(r.created_at).toISOString(),
    }));

    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.status(200).json({ entries });
  } catch (err) {
    console.error('Changelog fetch error:', err);
    return res.status(500).json({ error: 'Failed to load updates.' });
  }
}
