// Run with: node --env-file=.env.local scripts/update-program-db.js [--apply]
import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
const SPEAKER_FILE = process.env.SPEAKER_FILE || './Load Program Database/2026-Speaker-Report(2).csv';
const PROGRAM_FILE = process.env.PROGRAM_FILE || './Load Program Database/Session report.csv';
const APPLY = process.argv.includes('--apply');
const EXCLUDED_SPEAKER_CODES = new Set(['JoshKumin', 'JoshKumin1']);

const TYPE_MAP = {
  'Workshops': 'workshop',
  'Solution-Oriented Strategy Sessions': 'strategy',
  'Creative Spaces': 'creative',
  'Keynote': 'keynote',
  'Skill Building Institutes': 'skill',
  'International Exchange': 'intl',
};

function readRows(file) {
  const raw = readFileSync(file);
  return parse(raw, { bom: true, columns: true, skip_empty_lines: true, trim: true });
}

function parseDateTimeParts(value) {
  if (!value) return null;
  const clean = String(value).trim();
  const usMatch = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
  const us24Match = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::\d{2})?$/);
  const match = usMatch || us24Match;
  if (!match) return null;
  let hour = Number(match[4]);
  if (match[6]) {
    const period = match[6].toUpperCase();
    if (period === 'PM' && hour !== 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;
  }
  return {
    year: Number(match[3]),
    month: Number(match[1]),
    day: Number(match[2]),
    hour,
    minute: Number(match[5]),
  };
}

function dateTimeToBlockKey(value) {
  const parts = parseDateTimeParts(value);
  if (!parts) return '';
  const { year, month, day, hour, minute } = parts;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}|${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function dateTimeToTimeOnly(value) {
  return dateTimeToBlockKey(value).split('|')[1] || '';
}

function compact(value) {
  return String(value ?? '').trim();
}

function parseSpeakers() {
  const byCode = new Map();
  const excluded = [];
  for (const r of readRows(SPEAKER_FILE)) {
    const code = compact(r['Code']);
    if (!code || byCode.has(code)) continue;
    const speaker = {
      speaker_code: code,
      first_name: compact(r['First Name']),
      last_name: compact(r['Last Name']),
      full_name: compact(r['Full Name']) || `${r['First Name'] || ''} ${r['Last Name'] || ''}`.trim(),
      biography: compact(r['Biography']),
      email: compact(r['Email Address']),
      title: compact(r['Title']),
      org: compact(r['Company Name'] || r['Organization']),
    };
    if (EXCLUDED_SPEAKER_CODES.has(code)) {
      excluded.push(speaker);
      continue;
    }
    byCode.set(code, speaker);
  }
  return { speakers: [...byCode.values()], excluded };
}

function parseSessions() {
  return readRows(PROGRAM_FILE).map(r => {
    const desc = [r['Description'], r['Description_1']]
      .filter(Boolean)
      .sort((a, b) => String(b).length - String(a).length)[0] || '';
    const speakerCodes = compact(r['Speaker Code'])
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .filter(code => !EXCLUDED_SPEAKER_CODES.has(code));
    const get = (...keys) => {
      for (const k of keys) if (r[k]) return compact(r[k]);
      return '';
    };
    const presType = get('Presentation Type');
    return {
      session_id: compact(r['Session ID']),
      session_code: compact(r['Session Code']),
      session_name: compact(r['Session Name']),
      description: compact(desc),
      session_start: dateTimeToBlockKey(r['Session Start Date/Time']),
      session_end: dateTimeToTimeOnly(r['End Date/Time']),
      presentation_type: TYPE_MAP[presType] || presType.toLowerCase().replace(/\s+/g, '-'),
      category: compact(r['Category']),
      ceu_eligibility: get('2026 GG CEU eligibility', '2025 CTA CEU eligibility'),
      recording_status: get('2026 GG recording', '2025 CTA recording'),
      video_format: get('2026 GG video format', '2025 CTA session features'),
      special_tag: get('2026 GG Special Tag', '2025 CTA Special Tag'),
      pre_record_interest: get('2026 GG pre-record', '2025 CTA pre-record interest', 'Interest in pre-recording session'),
      video_preference: get('2026 GG video format preferences', '2025 CTA video preference'),
      tags: get('2026 GG tags', '2025 CTA tags'),
      speakerCodes,
    };
  }).filter(s => s.session_id && s.session_name);
}

async function createSchema() {
  await sql`CREATE TABLE IF NOT EXISTS speakers (
    speaker_code TEXT PRIMARY KEY, first_name TEXT, last_name TEXT, full_name TEXT,
    biography TEXT, email TEXT, title TEXT, org TEXT, photo_url TEXT
  )`;
  await sql`CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY, session_code TEXT, session_name TEXT NOT NULL,
    description TEXT, session_start TEXT, session_end TEXT, presentation_type TEXT,
    category TEXT, ceu_eligibility TEXT, recording_status TEXT, video_format TEXT,
    special_tag TEXT, pre_record_interest TEXT, video_preference TEXT, tags TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS session_speakers (
    session_id TEXT REFERENCES sessions(session_id) ON DELETE CASCADE,
    speaker_code TEXT REFERENCES speakers(speaker_code) ON DELETE CASCADE,
    PRIMARY KEY (session_id, speaker_code)
  )`;
}

async function currentState() {
  await createSchema();
  const [speakers, sessions, links] = await Promise.all([
    sql`SELECT speaker_code, first_name, last_name, full_name, biography, email, title, org FROM speakers ORDER BY speaker_code`,
    sql`SELECT session_id, session_code, session_name, description, session_start, session_end, presentation_type, category, ceu_eligibility, recording_status, video_format, special_tag, pre_record_interest, video_preference, tags FROM sessions ORDER BY session_id`,
    sql`SELECT session_id, speaker_code FROM session_speakers ORDER BY session_id, speaker_code`,
  ]);
  return { speakers, sessions, links };
}

function byKey(rows, key) {
  return new Map(rows.map(row => [row[key], row]));
}

function compareRows(label, beforeRows, afterRows, key, fields) {
  const before = byKey(beforeRows, key);
  const after = byKey(afterRows, key);
  const added = [];
  const removed = [];
  const changed = [];
  for (const [id, row] of after) {
    if (!before.has(id)) {
      added.push(row);
      continue;
    }
    const old = before.get(id);
    const deltas = fields
      .filter(field => compact(old[field]) !== compact(row[field]))
      .map(field => `${field}: "${compact(old[field])}" -> "${compact(row[field])}"`);
    if (deltas.length) changed.push({ id, label: row[label] || id, deltas });
  }
  for (const [id, row] of before) {
    if (!after.has(id)) removed.push(row);
  }
  return { added, removed, changed };
}

function compareLinks(beforeLinks, afterSessions) {
  const before = new Set(beforeLinks.map(l => `${l.session_id}|${l.speaker_code}`));
  const afterLinks = afterSessions.flatMap(s => s.speakerCodes.map(code => ({ session_id: s.session_id, speaker_code: code })));
  const after = new Set(afterLinks.map(l => `${l.session_id}|${l.speaker_code}`));
  return {
    added: afterLinks.filter(l => !before.has(`${l.session_id}|${l.speaker_code}`)),
    removed: beforeLinks.filter(l => !after.has(`${l.session_id}|${l.speaker_code}`)),
  };
}

function printDiff(diff, excluded) {
  const { speakerDiff, sessionDiff, linkDiff } = diff;
  console.log(`Excluded speakers: ${excluded.map(s => `${s.speaker_code} (${s.full_name})`).join(', ') || 'none'}`);
  console.log(`Speakers: +${speakerDiff.added.length} -${speakerDiff.removed.length} ~${speakerDiff.changed.length}`);
  console.log(`Sessions: +${sessionDiff.added.length} -${sessionDiff.removed.length} ~${sessionDiff.changed.length}`);
  console.log(`Session-speaker links: +${linkDiff.added.length} -${linkDiff.removed.length}`);
  for (const row of sessionDiff.added) console.log(`  + session ${row.session_id} ${row.session_code} "${row.session_name}"`);
  for (const row of sessionDiff.removed) console.log(`  - session ${row.session_id} ${row.session_code} "${row.session_name}"`);
  for (const row of sessionDiff.changed) {
    console.log(`  ~ session ${row.id} "${row.label}"`);
    row.deltas.forEach(d => console.log(`      ${d}`));
  }
  for (const row of speakerDiff.added) console.log(`  + speaker ${row.speaker_code} "${row.full_name}"`);
  for (const row of speakerDiff.removed) console.log(`  - speaker ${row.speaker_code} "${row.full_name}"`);
  for (const row of speakerDiff.changed) {
    console.log(`  ~ speaker ${row.id} "${row.label}"`);
    row.deltas.forEach(d => console.log(`      ${d}`));
  }
  for (const row of linkDiff.added) console.log(`  + link ${row.session_id} -> ${row.speaker_code}`);
  for (const row of linkDiff.removed) console.log(`  - link ${row.session_id} -> ${row.speaker_code}`);
}

async function applyLoad(speakers, sessions) {
  await sql`TRUNCATE session_speakers, sessions, speakers RESTART IDENTITY CASCADE`;
  for (const sp of speakers) {
    await sql`INSERT INTO speakers (speaker_code, first_name, last_name, full_name, biography, email, title, org)
      VALUES (${sp.speaker_code}, ${sp.first_name}, ${sp.last_name}, ${sp.full_name}, ${sp.biography}, ${sp.email}, ${sp.title}, ${sp.org})`;
  }
  const speakerCodeSet = new Set(speakers.map(s => s.speaker_code));
  for (const s of sessions) {
    await sql`INSERT INTO sessions (
      session_id, session_code, session_name, description, session_start, session_end,
      presentation_type, category, ceu_eligibility, recording_status, video_format,
      special_tag, pre_record_interest, video_preference, tags
    ) VALUES (
      ${s.session_id}, ${s.session_code}, ${s.session_name}, ${s.description}, ${s.session_start}, ${s.session_end},
      ${s.presentation_type}, ${s.category}, ${s.ceu_eligibility}, ${s.recording_status}, ${s.video_format},
      ${s.special_tag}, ${s.pre_record_interest}, ${s.video_preference}, ${s.tags}
    )`;
    for (const code of s.speakerCodes) {
      if (!speakerCodeSet.has(code)) continue;
      await sql`INSERT INTO session_speakers (session_id, speaker_code) VALUES (${s.session_id}, ${code})`;
    }
  }
}

const { speakers, excluded } = parseSpeakers();
const sessions = parseSessions();
const before = await currentState();
const diff = {
  speakerDiff: compareRows('full_name', before.speakers, speakers, 'speaker_code', ['first_name', 'last_name', 'full_name', 'biography', 'email', 'title', 'org']),
  sessionDiff: compareRows('session_name', before.sessions, sessions, 'session_id', ['session_code', 'session_name', 'description', 'session_start', 'session_end', 'presentation_type', 'category', 'ceu_eligibility', 'recording_status', 'video_format', 'special_tag', 'pre_record_interest', 'video_preference', 'tags']),
  linkDiff: compareLinks(before.links, sessions),
};

printDiff(diff, excluded);

if (!APPLY) {
  console.log('Dry run only. Re-run with --apply to update the database.');
} else {
  await applyLoad(speakers, sessions);
  console.log(`Applied program database load: ${speakers.length} speakers, ${sessions.length} sessions.`);
}
