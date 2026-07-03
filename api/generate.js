const API_URL = "https://api.groq.com/openai/v1/chat/completions";

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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
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
