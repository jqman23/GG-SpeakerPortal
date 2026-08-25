// Run with: node --env-file=.env.local scripts/seed-changelog.js
//
// Seeds the changelog table that powers the "Recent Updates" system on the
// Speaker Resource & Questionnaire Page (Overview timeline, announcement
// banner, and tab badges).
//
// - Entries are upserted by stable `key`, so re-running is safe.
// - Entries in the DB that are NOT listed below are deleted, so removing an
//   entry from CHANGELOG_ENTRIES (or emptying the list) and re-running is the
//   way to take updates down.
// - `section` must match a TAB_CONFIG sectionId from src/app.js
//   (overview, faqs, session-lookup, share, attendee-hub, survey).
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

const CHANGELOG_ENTRIES = [
  {
    key: "test-2026-09-04-attendee-hub",
    headline: "Attendee Hub access instructions are now live",
    section: "attendee-hub",
    details: "Step-by-step guidance for logging in and hosting your session in Attendee Hub has been added to the Attendee Hub tab.",
    createdAt: "2026-09-04T09:00:00Z",
  },
  {
    key: "test-2026-08-24-faqs",
    headline: "New FAQs about group registration and CEU deadlines",
    section: "faqs",
    details: "Three frequently asked questions were added to the FAQ tab.",
    createdAt: "2026-08-24T15:00:00Z",
  },
  {
    key: "test-2026-08-20-lookup",
    headline: "Session lookup now shows recording format details",
    section: "session-lookup",
    details: "The Session Information Lookup now displays the video format on file for each session.",
    createdAt: "2026-08-20T12:00:00Z",
  },
];

async function main() {
  await sql`
    CREATE TABLE IF NOT EXISTS changelog (
      key        TEXT PRIMARY KEY,
      headline   TEXT NOT NULL,
      section    TEXT NOT NULL,
      details    TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  const keys = CHANGELOG_ENTRIES.map(e => e.key);
  const queries = [
    sql`DELETE FROM changelog WHERE NOT (key = ANY(${keys}))`,
  ];

  for (const e of CHANGELOG_ENTRIES) {
    queries.push(sql`
      INSERT INTO changelog (key, headline, section, details, created_at)
      VALUES (${e.key}, ${e.headline}, ${e.section}, ${e.details}, ${e.createdAt})
      ON CONFLICT (key) DO UPDATE SET
        headline   = EXCLUDED.headline,
        section    = EXCLUDED.section,
        details    = EXCLUDED.details,
        created_at = EXCLUDED.created_at
    `);
  }

  await sql.transaction(queries);

  const rows = await sql`
    SELECT key, headline, section, created_at
    FROM changelog
    ORDER BY created_at DESC
  `;
  console.log(`✓ Changelog synced: ${rows.length} entries`);
  rows.forEach(r => {
    const when = r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at);
    console.log(`  - [${r.section}] ${r.headline} (${when})`);
  });
  console.log('✓ Seed complete');
}

main().catch(err => { console.error(err); process.exit(1); });
