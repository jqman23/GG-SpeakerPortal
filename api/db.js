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
}
