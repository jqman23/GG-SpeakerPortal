const API_URL = "https://api.groq.com/openai/v1/chat/completions";

const SYSTEM_PROMPT = `Generate exactly three CEU knowledge-check questions and exactly three measurable learning objectives for a CEU-eligible session at A Global Gathering for the Future of Child Welfare. Questions and objectives must be based only on the session title, session description, and additional context provided by the user. Do not ask questions about the Global Gathering itself, the format of the session, or whether the session exists. Do not invent facts, statistics, frameworks, or claims that were not provided. All knowledge-check questions must be True/False questions. Do not generate multiple-choice questions. Questions should be clear, answerable, and tied to the actual session content. Learning objectives should be measurable and should begin with action verbs such as describe, identify, explain, apply, compare, analyze, or reflect on. If there is not enough information to generate meaningful questions and objectives, explain what additional information is needed. Use plain text only. Do not use markdown symbols, asterisks, hashtags, or decorative formatting. Output with exactly two headers: "Suggested Knowledge-Check Questions:" and "Suggested Measurable Objectives:"`;

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

  const payload = {
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT
      },
      {
        role: "user",
        content:
          `Session Title: ${title.trim()}\n` +
          `Description: ${description.trim()}\n` +
          `Relevant Session Context:\n${extra.trim() || "None provided."}`
      }
    ],
    temperature: 0.7,
    max_tokens: 500
  };

  try {
    const groqRes = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    const bodyText = await groqRes.text();
    if (!groqRes.ok) {
      return res.status(groqRes.status).json({
        error: `Groq error ${groqRes.status}: ${groqRes.statusText}`,
        details: bodyText
      });
    }

    const data = JSON.parse(bodyText);
    return res.status(200).json({
      output: data.choices?.[0]?.message?.content?.trim() || "No response."
    });
  } catch (error) {
    return res.status(500).json({ error: `Network error: ${error.message}` });
  }
}
