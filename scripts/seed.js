// Run with: node --env-file=.env.local scripts/seed.js
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import { neon } from '@neondatabase/serverless';

const require = createRequire(import.meta.url);
const XLSX = require('../node_modules/xlsx/xlsx.js');

const sql = neon(process.env.DATABASE_URL);

// ── Schema ────────────────────────────────────────────────────────────────────

async function createSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS speakers (
      speaker_code TEXT PRIMARY KEY,
      first_name   TEXT,
      last_name    TEXT,
      full_name    TEXT,
      biography    TEXT,
      email        TEXT
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      session_id          TEXT PRIMARY KEY,
      session_code        TEXT,
      session_name        TEXT NOT NULL,
      description         TEXT,
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
  console.log('✓ Schema ready');
}

// ── Parse Speaker CSV ─────────────────────────────────────────────────────────

function parseSpeakers() {
  const raw = readFileSync('./Speaker Database.csv');
  const rows = parse(raw, { columns: true, skip_empty_lines: true, trim: true });

  const byCode = new Map();
  for (const r of rows) {
    const code = (r['Code'] || '').trim();
    if (!code || byCode.has(code)) continue;
    byCode.set(code, {
      speaker_code: code,
      first_name:   (r['First Name'] || '').trim(),
      last_name:    (r['Last Name']  || '').trim(),
      full_name:    (r['Full Name']  || '').trim() || `${r['First Name'] || ''} ${r['Last Name'] || ''}`.trim(),
      biography:    (r['Biography']  || '').trim(),
      email:        (r['Email Address'] || '').trim(),
    });
  }
  console.log(`✓ Parsed ${byCode.size} unique speakers`);
  return [...byCode.values()];
}

// ── Parse Program XLSX ────────────────────────────────────────────────────────

function parseSessions() {
  const wb = XLSX.readFile('./Program Database.xlsx');
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

  // Handle possible duplicate Description columns — use the one with content
  const sessions = rows.map(r => {
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

    return {
      session_id:          String(r['Session ID'] || '').trim(),
      session_code:        String(r['Session Code'] || '').trim(),
      session_name:        String(r['Session Name'] || '').trim(),
      description:         desc.trim(),
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

  // Clear existing data in dependency order
  await sql`TRUNCATE session_speakers, sessions, speakers RESTART IDENTITY CASCADE`;
  console.log('✓ Cleared existing data');

  // Insert speakers in batches of 50
  for (let i = 0; i < speakers.length; i += 50) {
    const batch = speakers.slice(i, i + 50);
    for (const sp of batch) {
      await sql`
        INSERT INTO speakers (speaker_code, first_name, last_name, full_name, biography, email)
        VALUES (${sp.speaker_code}, ${sp.first_name}, ${sp.last_name}, ${sp.full_name}, ${sp.biography}, ${sp.email})
        ON CONFLICT (speaker_code) DO UPDATE SET
          first_name = EXCLUDED.first_name,
          last_name  = EXCLUDED.last_name,
          full_name  = EXCLUDED.full_name,
          biography  = EXCLUDED.biography,
          email      = EXCLUDED.email
      `;
    }
  }
  console.log(`✓ Inserted ${speakers.length} speakers`);

  const speakerCodeSet = new Set(speakers.map(s => s.speaker_code));
  let sessionSpeakerCount = 0;

  // Insert sessions then their speaker links
  for (const s of sessions) {
    await sql`
      INSERT INTO sessions (session_id, session_code, session_name, description, ceu_eligibility, recording_status, video_format, special_tag, pre_record_interest, video_preference, tags)
      VALUES (${s.session_id}, ${s.session_code}, ${s.session_name}, ${s.description}, ${s.ceu_eligibility}, ${s.recording_status}, ${s.video_format}, ${s.special_tag}, ${s.pre_record_interest}, ${s.video_preference}, ${s.tags})
      ON CONFLICT (session_id) DO UPDATE SET
        session_code        = EXCLUDED.session_code,
        session_name        = EXCLUDED.session_name,
        description         = EXCLUDED.description,
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
        console.warn(`  ⚠ Speaker code "${code}" (session: ${s.session_code}) not found in speaker database — skipping`);
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
  console.log('✓ Seed complete');
}

createSchema().then(seed).catch(err => { console.error(err); process.exit(1); });
