import crypto from "node:crypto";
import { getDb } from "./db.js";

const API_URL = "https://api.groq.com/openai/v1/chat/completions";
const BACKFILL_TOKEN_HASH = "bff0cf08f4344044ec1a8c32e9b867591f9e0cc5817c143b109345ab96d1cc95";

const SYSTEM_PROMPT = `Generate exactly three True/False knowledge-check questions and exactly three measurable learning objectives for a CEU-eligible session at A Global Gathering for the Future of Child Welfare. Use only the session title, description, and context provided. Do not invent facts or ask about the event itself. Each knowledge-check question must be a direct content claim that participants can judge as true or false after attending the session. Put the answer marker at the beginning of each question using exactly "True or False (T):" for true statements or "True or False (F):" for false statements. Do not add a separate answer line or trailing "Answer: True/False" text. The questions should assess concepts, practices, implications, or takeaways from the session topic itself, not whether the session mentions, covers, teaches, or discusses something. Do not generate open-ended, short-answer, fill-in-the-blank, or multiple-choice questions. Make the questions simple, single-answer, and easy to edit. Objectives should begin with measurable verbs such as describe, identify, explain, apply, compare, or reflect on. Use plain text only. Output with exactly two headers: "Suggested Knowledge-Check Questions:" and "Suggested Measurable Objectives:"`;
const QUESTIONS_HEADER = "Suggested Knowledge-Check Questions:";
const OBJECTIVES_HEADER = "Suggested Measurable Objectives:";

function buildUserPrompt(title, description, extra = "") {
  return (
    `Session Title: ${title.trim()}\n` +
    `Description: ${description.trim()}\n` +
    `Relevant Session Context:\n${extra.trim() || "None provided."}`
  );
}

function extractKnowledgeQuestions(output) {
  const text = String(output || "");
  const questionsIndex = text.toLowerCase().indexOf(QUESTIONS_HEADER.toLowerCase());
  const objectivesIndex = text.toLowerCase().indexOf(OBJECTIVES_HEADER.toLowerCase());
  if (questionsIndex < 0 || objectivesIndex < 0 || objectivesIndex <= questionsIndex) return [];

  return text
    .slice(questionsIndex + QUESTIONS_HEADER.length, objectivesIndex)
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);
}

function questionsAreTrueFalse(output) {
  const questions = extractKnowledgeQuestions(output);
  if (questions.length !== 3) return false;
  return questions.every(question => {
    const clean = question.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "");
    return /^true or false\s*\([tf]\)\s*:/i.test(clean) && !/\banswer:\s*(?:true|false)\b/i.test(clean);
  });
}

async function requestDraft(apiKey, messages) {
  const groqRes = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages,
      temperature: 0.4,
      max_tokens: 500
    })
  });

  const bodyText = await groqRes.text();
  if (!groqRes.ok) {
    const error = new Error(`Groq error ${groqRes.status}: ${groqRes.statusText}`);
    error.status = groqRes.status;
    error.details = bodyText;
    throw error;
  }

  const data = JSON.parse(bodyText);
  return data.choices?.[0]?.message?.content?.trim() || "No response.";
}

function isAuthorizedBackfill(token) {
  if (!token) return false;
  const actual = crypto.createHash("sha256").update(String(token)).digest();
  const expected = Buffer.from(BACKFILL_TOKEN_HASH, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function splitName(value) {
  const parts = String(value || "").trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  return { firstName: parts.shift() || "", lastName: parts.join(" ") };
}

async function appendBackfillRow(url, secret, row) {
  const { firstName, lastName } = splitName(row.speaker_name);
  const sheetResponse = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sharedSecret: secret,
      id: row.id,
      submittedAt: row.submitted_at,
      isResubmission: false,
      firstName,
      lastName,
      email: row.email || "",
      sessionCode: row.session_code || "",
      sessionTitle: row.session_title || "",
      sessionVideoFormat: row.session_video_format || "",
      formatConfirmation: row.format_confirmation || "",
      sessionRecordingStatus: row.session_recording_status || "",
      recordingConfirmation: row.recording_confirmation || "",
      prerecordConfirmation: row.prerecord_confirmation || "",
      prerecordLiveSupport: row.prerecord_live_support || "",
      sbiMaxParticipants: row.sbi_max_participants || "",
      ceuOptOut: !!row.ceu_opt_out,
      ceuObjectives: row.ceu_objectives || "",
      ceuQuestions: row.ceu_questions || "",
      sessionFollowupPrompt: row.session_followup_prompt || "",
      sessionFollowupResponse: row.session_followup_response || "",
      sessionTitleFeedback: row.session_title_feedback || "",
      avRequirements: row.av_requirements || "",
      additionalNotes: row.additional_notes || ""
    })
  });
  const text = await sheetResponse.text();
  const result = JSON.parse(text);
  if (!sheetResponse.ok || !result.success) {
    throw new Error(`Google returned HTTP ${sheetResponse.status}: ${text}`);
  }
}

async function runSheetBackfill(res) {
  const url = process.env.SHEET_SYNC_URL?.trim();
  const secret = process.env.SHEET_SYNC_SECRET?.trim();
  if (!url || !secret) {
    return res.status(500).json({ error: "Sheet sync secrets unavailable at runtime." });
  }

  const sql = getDb();
  const firstId = 20;
  const lastId = 29;
  const rows = await sql`
    SELECT
      r.*,
      s.video_format AS session_video_format,
      s.recording_status AS session_recording_status
    FROM survey_responses r
    LEFT JOIN sessions s ON s.session_id = r.session_id
    WHERE r.id >= ${firstId} AND r.id <= ${lastId}
    ORDER BY r.id
  `;

  const succeeded = [];
  for (const row of rows) {
    await appendBackfillRow(url, secret, row);
    succeeded.push(row.id);
  }
  return res.status(200).json({ found: rows.length, succeeded });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const backfillToken = req.headers["x-sheet-backfill-token"];
  if (backfillToken) {
    if (!isAuthorizedBackfill(backfillToken)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    try {
      return await runSheetBackfill(res);
    } catch (error) {
      console.error("Sheet backfill error:", error);
      return res.status(500).json({ error: String(error.message || error) });
    }
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Missing GROQ_API_KEY environment variable." });
  }

  const { title, description, extra = "" } = req.body || {};
  if (!title?.trim() || !description?.trim()) {
    return res.status(400).json({ error: "Session title and description are required." });
  }

  try {
    const userPrompt = buildUserPrompt(title, description, extra);
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt }
    ];

    let output = await requestDraft(apiKey, messages);
    if (!questionsAreTrueFalse(output)) {
      output = await requestDraft(apiKey, [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `${userPrompt}\n\nRegenerate the full response. The three knowledge-check questions MUST each start with "True or False (T):" or "True or False (F):". Do not include a separate answer line or trailing answer text. Do not include any open-ended questions.`
        }
      ]);
    }

    return res.status(200).json({ output });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        error: `Groq error ${error.status}: ${error.message.split(": ").slice(1).join(": ")}`,
        details: error.details
      });
    }
    return res.status(500).json({ error: `Network error: ${error.message}` });
  }
}
