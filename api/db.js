import { neon } from '@neondatabase/serverless';

export function getDb() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  return neon(process.env.DATABASE_URL);
}

export async function ensureSchema(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS survey_responses (
      id SERIAL PRIMARY KEY,
      speaker_name TEXT NOT NULL,
      email TEXT NOT NULL,
      session_title_feedback TEXT,
      av_requirements TEXT,
      additional_notes TEXT,
      submitted_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS session_id TEXT`;
  await sql`ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS session_code TEXT`;
  await sql`ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS session_title TEXT`;
  await sql`ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS ceu_objectives TEXT`;
  await sql`ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS ceu_questions TEXT`;
  await sql`ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS ceu_opt_out BOOLEAN DEFAULT FALSE`;
  await sql`ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS session_followup_prompt TEXT`;
  await sql`ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS session_followup_response TEXT`;
  await sql`ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS format_confirmation TEXT`;
  await sql`ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS recording_confirmation TEXT`;
  await sql`ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS prerecord_confirmation TEXT`;
  await sql`ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS sbi_max_participants TEXT`;
}
