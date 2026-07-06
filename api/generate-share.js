const API_URL = "https://api.groq.com/openai/v1/chat/completions";
const SHARE_MODEL = process.env.GROQ_SHARE_MODEL || "llama-3.1-8b-instant";
const SHARE_FALLBACK_MODELS = (process.env.GROQ_SHARE_FALLBACK_MODELS || "openai/gpt-oss-20b")
  .split(",")
  .map(model => model.trim())
  .filter(Boolean);

const SYSTEM_PROMPT = `Write only the middle paragraph for a LinkedIn caption from a presenter at the 2026 Global Gathering for the Future of Child Welfare. Use only the provided session details. Write 2-3 warm, professional sentences that are specific to the session topic and explain what the session is about or why it matters. Do not include the event name, the session title, presenter names, a greeting, a call to action, a website, hashtags, bullets, quotation marks, or labels. Do not invent speaker affiliations, dates, outcomes, or claims. Return only the paragraph text.`;

function buildUserPrompt({ title, description, sessionType, speakers }) {
  return [
    `Session Title: ${String(title || "").trim()}`,
    `Session Type: ${String(sessionType || "").trim() || "Not provided"}`,
    `Presenter(s): ${Array.isArray(speakers) ? speakers.filter(Boolean).join(", ") : "Not provided"}`,
    `Description: ${String(description || "").trim() || "Not provided"}`,
    "Event website: https://www.futureofchildwelfare.org"
  ].join("\n");
}

function getShareModels() {
  return [...new Set([SHARE_MODEL, ...SHARE_FALLBACK_MODELS])];
}

function shouldTryFallback(error) {
  const details = String(error.details || error.message || "").toLowerCase();
  return (
    error.status === 429 ||
    error.status === 500 ||
    error.status === 503 ||
    error.status === 529 ||
    details.includes("rate limit") ||
    details.includes("token") ||
    details.includes("quota") ||
    details.includes("decommissioned") ||
    details.includes("not supported")
  );
}

async function requestShareMiddle(apiKey, model, messages) {
  const groqRes = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 180
    })
  });

  const bodyText = await groqRes.text();
  if (!groqRes.ok) {
    const error = new Error(`Groq error ${groqRes.status}: ${groqRes.statusText}`);
    error.status = groqRes.status;
    error.details = bodyText;
    error.model = model;
    throw error;
  }

  const data = JSON.parse(bodyText);
  return data.choices?.[0]?.message?.content?.trim() || "";
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

  const { title, description = "", sessionType = "", speakers = [] } = req.body || {};
  if (!title?.trim()) {
    return res.status(400).json({ error: "Session title is required." });
  }

  try {
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt({ title, description, sessionType, speakers }) }
    ];
    let lastError = null;

    for (const model of getShareModels()) {
      try {
        const middle = await requestShareMiddle(apiKey, model, messages);
        return res.status(200).json({ middle, model });
      } catch (error) {
        lastError = error;
        if (!shouldTryFallback(error)) throw error;
      }
    }

    throw lastError || new Error("Unable to generate social post.");
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
