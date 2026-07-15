// One-time backfill: pushes every existing survey_responses row to the
// Google Sheet via the same Apps Script web app that api/submit-survey.js
// calls for new submissions. Run this once after deploying
// apps-script/survey-sheet-sync.gs; new submissions sync automatically
// after that and do not need this script again.
//
// Run with: node --env-file=.env.local scripts/backfill-sheet-sync.js
//
// Requires DATABASE_URL, SHEET_SYNC_URL, SHEET_SYNC_SECRET to be set.
// This reads the full survey_responses table from Neon once — a normal,
// one-time cost, unlike the per-submission sync which reads nothing extra.

import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
const SHEET_SYNC_URL = process.env.SHEET_SYNC_URL;
const SHEET_SYNC_SECRET = process.env.SHEET_SYNC_SECRET;

// Delay between rows so we stay well under Apps Script's execution quotas.
const DELAY_MS = 300;

if (!SHEET_SYNC_URL) {
  console.error('SHEET_SYNC_URL is not set. Deploy apps-script/survey-sheet-sync.gs first.');
  process.exit(1);
}

function splitName(value) {
  const clean = String(value || '').trim().replace(/\s+/g, ' ');
  if (!clean) return { firstName: '', lastName: '' };
  const parts = clean.split(' ');
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchRows() {
  return sql`
    SELECT
      r.*,
      s.video_format      AS session_video_format,
      s.recording_status  AS session_recording_status
    FROM survey_responses r
    LEFT JOIN sessions s ON s.session_id = r.session_id
    ORDER BY r.submitted_at ASC, r.id ASC
  `;
}

async function pushRow(row) {
  const { firstName, lastName } = splitName(row.speaker_name);

  const response = await fetch(SHEET_SYNC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sharedSecret: SHEET_SYNC_SECRET,
      id: row.id,
      submittedAt: row.submitted_at,
      isResubmission: false,
      firstName,
      lastName,
      email: row.email || '',
      sessionCode: row.session_code || '',
      sessionTitle: row.session_title || '',
      sessionVideoFormat: row.session_video_format || '',
      formatConfirmation: row.format_confirmation || '',
      sessionRecordingStatus: row.session_recording_status || '',
      recordingConfirmation: row.recording_confirmation || '',
      prerecordConfirmation: row.prerecord_confirmation || '',
      prerecordLiveSupport: row.prerecord_live_support || '',
      sbiMaxParticipants: row.sbi_max_participants || '',
      ceuOptOut: !!row.ceu_opt_out,
      ceuObjectives: row.ceu_objectives || '',
      ceuQuestions: row.ceu_questions || '',
      sessionFollowupPrompt: row.session_followup_prompt || '',
      sessionFollowupResponse: row.session_followup_response || '',
      sessionTitleFeedback: row.session_title_feedback || '',
      avRequirements: row.av_requirements || '',
      additionalNotes: row.additional_notes || ''
    })
  });

  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`non-JSON response: ${text.slice(0, 200)}`);
  }
  if (!response.ok || !parsed.success) {
    throw new Error(`${response.status}: ${text}`);
  }
}

async function backfill() {
  const rows = await fetchRows();
  console.log(`✓ Found ${rows.length} survey responses to backfill`);

  let succeeded = 0;
  const failed = [];

  for (const row of rows) {
    try {
      await pushRow(row);
      succeeded++;
      console.log(`  ✓ row ${row.id} (${row.email})`);
    } catch (err) {
      failed.push({ id: row.id, email: row.email, error: String(err) });
      console.error(`  ✗ row ${row.id} (${row.email}): ${err.message || err}`);
    }
    await sleep(DELAY_MS);
  }

  console.log(`\n✓ Backfill complete: ${succeeded}/${rows.length} succeeded`);
  if (failed.length) {
    console.log(`✗ ${failed.length} failed:`);
    failed.forEach(f => console.log(`    row ${f.id} (${f.email}): ${f.error}`));
    process.exit(1);
  }
}

backfill().catch(err => { console.error(err); process.exit(1); });
