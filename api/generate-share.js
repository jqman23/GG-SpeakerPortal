const API_URL = "https://api.groq.com/openai/v1/chat/completions";
const SHARE_MODEL = process.env.GROQ_SHARE_MODEL || "llama-3.1-8b-instant";

const SYSTEM_PROMPT = `Write one LinkedIn caption for a presenter at the 2026 Global Gathering for the Future of Child Welfare. Use only the provided session details. The caption should sound warm, professional, and specific to the session topic. Do not invent speaker affiliations, dates, or claims. Keep it between 70 and 120 words. Include the event website and these hashtags at the end: #FutureOfChildWelfare #ChildWelfare #SocialWork. Return only the caption text.`;

function buildUserPrompt({ title, description, sessionType, speakers }) {
  return [
    `Session Title: ${String(title || "").trim()}`,
    `Session Type: ${String(sessionType || "").trim() || "Not provided"}`,
    `Presenter(s): ${Array.isArray(speakers) ? speakers.filter(Boolean).join(", ") : "Not provided"}`,
    `Description: ${String(description || "").trim() || "Not provided"}`,
    "Event website: https://www.futureofchildwelfare.org"
  ].join("\n");
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
    const groqRes = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: SHARE_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt({ title, description, sessionType, speakers }) }
        ],
        temperature: 0.7,
        max_tokens: 260
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
    const message = data.choices?.[0]?.message?.content?.trim();
    return res.status(200).json({ message: message || "" });
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
