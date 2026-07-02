// Run with: node --env-file=.env.local scripts/seed.js
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import { neon } from '@neondatabase/serverless';

const require = createRequire(import.meta.url);
const XLSX = require('../node_modules/xlsx/xlsx.js');

const sql = neon(process.env.DATABASE_URL);

// ── Excel serial → "YYYY-MM-DD|HH:MM" (times stored as local Mountain Time) ──
function excelSerialToBlockKey(serial) {
  if (!serial || typeof serial !== 'number') return '';
  const days     = Math.floor(serial);
  const fraction = serial - days;
  // Excel epoch is Dec 30, 1899; 25569 days to Unix epoch (Jan 1, 1970)
  const d        = new Date((days - 25569) * 86400 * 1000);
  const year     = d.getUTCFullYear();
  const month    = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day      = String(d.getUTCDate()).padStart(2, '0');
  // Fractional part is already in local Mountain Time — convert directly
  const totalMin = Math.round(fraction * 24 * 60);
  const h        = Math.floor(totalMin / 60);
  const m        = totalMin % 60;
  return `${year}-${month}-${day}|${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function excelSerialToTimeOnly(serial) {
  const key = excelSerialToBlockKey(serial);
  return key.split('|')[1] || '';
}

const TYPE_MAP = {
  'Workshops':                           'workshop',
  'Solution-Oriented Strategy Sessions': 'strategy',
  'Creative Spaces':                     'creative',
  'Keynote':                             'keynote',
  'Skill Building Institutes':           'skill',
  'International Exchange':              'intl',
};

// ── Schema ────────────────────────────────────────────────────────────────────

async function createSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS speakers (
      speaker_code TEXT PRIMARY KEY,
      first_name   TEXT,
      last_name    TEXT,
      full_name    TEXT,
      biography    TEXT,
      email        TEXT,
      title        TEXT,
      org          TEXT,
      photo_url    TEXT
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      session_id          TEXT PRIMARY KEY,
      session_code        TEXT,
      session_name        TEXT NOT NULL,
      description         TEXT,
      session_start       TEXT,
      session_end         TEXT,
      presentation_type   TEXT,
      category            TEXT,
      ceu_eligibility     TEXT,
      recording_status    TEXT,
      video_format        TEXT,
      special_tag         TEXT,
      pre_record_interest TEXT,
      video_preference    TEXT,
      tags                TEXT,
      updated_at          TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS session_speakers (
      session_id   TEXT REFERENCES sessions(session_id)  ON DELETE CASCADE,
      speaker_code TEXT REFERENCES speakers(speaker_code) ON DELETE CASCADE,
      PRIMARY KEY (session_id, speaker_code)
    )
  `;

  // Add columns that may not exist on older schema
  await sql`ALTER TABLE speakers ADD COLUMN IF NOT EXISTS title     TEXT`;
  await sql`ALTER TABLE speakers ADD COLUMN IF NOT EXISTS org       TEXT`;
  await sql`ALTER TABLE speakers ADD COLUMN IF NOT EXISTS photo_url TEXT`;
  await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS session_start       TEXT`;
  await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS session_end         TEXT`;
  await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS presentation_type   TEXT`;
  await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS category            TEXT`;

  console.log('✓ Schema ready');
}

// ── Parse Speaker CSV ─────────────────────────────────────────────────────────

function parseSpeakers() {
  const raw  = readFileSync('./Speaker Database.csv');
  const rows = parse(raw, { columns: true, skip_empty_lines: true, trim: true });

  const byCode = new Map();
  for (const r of rows) {
    const code = (r['Code'] || '').trim();
    if (!code || byCode.has(code)) continue;
    byCode.set(code, {
      speaker_code: code,
      first_name:   (r['First Name']    || '').trim(),
      last_name:    (r['Last Name']     || '').trim(),
      full_name:    (r['Full Name']     || '').trim() || `${r['First Name'] || ''} ${r['Last Name'] || ''}`.trim(),
      biography:    (r['Biography']     || '').trim(),
      email:        (r['Email Address'] || '').trim(),
      title:        (r['Title']         || '').trim(),
      org:          (r['Company Name']  || r['Organization'] || '').trim(),
    });
  }
  console.log(`✓ Parsed ${byCode.size} unique speakers`);
  return [...byCode.values()];
}

// ── Parse Program XLSX ────────────────────────────────────────────────────────

function parseSessions() {
  const wb   = XLSX.readFile('./Program Database.xlsx');
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

  const sessions = rows.map(r => {
    // Handle possible duplicate Description columns — use whichever has content
    const desc = [r['Description'], r['Description_1']]
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)[0] || '';

    const speakerCodes = String(r['Speaker Code'] || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    // Prefer 2026 GG headers, fall back to 2025 CTA equivalents
    const get = (...keys) => {
      for (const k of keys) if (r[k]) return String(r[k]).trim();
      return '';
    };

    const startSerial = r['Session Start Date/Time'];
    const endSerial   = r['End Date/Time'];
    const presType    = get('Presentation Type');

    return {
      session_id:          String(r['Session ID']   || '').trim(),
      session_code:        String(r['Session Code'] || '').trim(),
      session_name:        String(r['Session Name'] || '').trim(),
      description:         desc.trim(),
      session_start:       excelSerialToBlockKey(startSerial),
      session_end:         excelSerialToTimeOnly(endSerial),
      presentation_type:   TYPE_MAP[presType] || presType.toLowerCase().replace(/\s+/g, '-'),
      category:            String(r['Category'] || '').trim(),
      ceu_eligibility:     get('2026 GG CEU eligibility',          '2025 CTA CEU eligibility'),
      recording_status:    get('2026 GG recording',                '2025 CTA recording'),
      video_format:        get('2026 GG video format',             '2025 CTA session features'),
      special_tag:         get('2026 GG Special Tag',              '2025 CTA Special Tag'),
      pre_record_interest: get('2026 GG pre-record',               '2025 CTA pre-record interest'),
      video_preference:    get('2026 GG video format preferences', '2025 CTA video preference'),
      tags:                get('2026 GG tags',                     '2025 CTA tags'),
      speakerCodes,
    };
  }).filter(s => s.session_id && s.session_name);

  console.log(`✓ Parsed ${sessions.length} sessions`);
  return sessions;
}

// ── Seed ──────────────────────────────────────────────────────────────────────

async function seed() {
  const speakers = parseSpeakers();
  const sessions = parseSessions();

  await sql`TRUNCATE session_speakers, sessions, speakers RESTART IDENTITY CASCADE`;
  console.log('✓ Cleared existing data');

  for (const sp of speakers) {
    await sql`
      INSERT INTO speakers (speaker_code, first_name, last_name, full_name, biography, email, title, org)
      VALUES (${sp.speaker_code}, ${sp.first_name}, ${sp.last_name}, ${sp.full_name}, ${sp.biography}, ${sp.email}, ${sp.title}, ${sp.org})
      ON CONFLICT (speaker_code) DO UPDATE SET
        first_name = EXCLUDED.first_name,
        last_name  = EXCLUDED.last_name,
        full_name  = EXCLUDED.full_name,
        biography  = EXCLUDED.biography,
        email      = EXCLUDED.email,
        title      = EXCLUDED.title,
        org        = EXCLUDED.org
    `;
  }
  console.log(`✓ Inserted ${speakers.length} speakers`);

  const speakerCodeSet = new Set(speakers.map(s => s.speaker_code));
  let sessionSpeakerCount = 0;

  for (const s of sessions) {
    await sql`
      INSERT INTO sessions (
        session_id, session_code, session_name, description,
        session_start, session_end, presentation_type, category,
        ceu_eligibility, recording_status, video_format,
        special_tag, pre_record_interest, video_preference, tags
      ) VALUES (
        ${s.session_id}, ${s.session_code}, ${s.session_name}, ${s.description},
        ${s.session_start}, ${s.session_end}, ${s.presentation_type}, ${s.category},
        ${s.ceu_eligibility}, ${s.recording_status}, ${s.video_format},
        ${s.special_tag}, ${s.pre_record_interest}, ${s.video_preference}, ${s.tags}
      )
      ON CONFLICT (session_id) DO UPDATE SET
        session_code        = EXCLUDED.session_code,
        session_name        = EXCLUDED.session_name,
        description         = EXCLUDED.description,
        session_start       = EXCLUDED.session_start,
        session_end         = EXCLUDED.session_end,
        presentation_type   = EXCLUDED.presentation_type,
        category            = EXCLUDED.category,
        ceu_eligibility     = EXCLUDED.ceu_eligibility,
        recording_status    = EXCLUDED.recording_status,
        video_format        = EXCLUDED.video_format,
        special_tag         = EXCLUDED.special_tag,
        pre_record_interest = EXCLUDED.pre_record_interest,
        video_preference    = EXCLUDED.video_preference,
        tags                = EXCLUDED.tags,
        updated_at          = NOW()
    `;

    for (const code of s.speakerCodes) {
      if (!speakerCodeSet.has(code)) {
        console.warn(`  ⚠ Speaker code "${code}" (session: ${s.session_code}) not in speaker DB — skipping`);
        continue;
      }
      await sql`
        INSERT INTO session_speakers (session_id, speaker_code)
        VALUES (${s.session_id}, ${code})
        ON CONFLICT DO NOTHING
      `;
      sessionSpeakerCount++;
    }
  }

  console.log(`✓ Inserted ${sessions.length} sessions, ${sessionSpeakerCount} session-speaker links`);

  // Show a sample of block keys to verify time conversion
  const sample = await sql`SELECT session_start, session_end, session_name FROM sessions WHERE session_start IS NOT NULL LIMIT 5`;
  console.log('✓ Sample block keys:');
  sample.forEach(r => console.log(`    ${r.session_start} → ${r.session_end}  "${r.session_name.substring(0, 50)}"`));

  console.log('✓ Seed complete');
}

createSchema().then(seed).catch(err => { console.error(err); process.exit(1); });
