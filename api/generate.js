const API_URL = "https://api.groq.com/openai/v1/chat/completions";

const SYSTEM_PROMPT = `Generate exactly three knowledge-check questions and exactly three measurable learning objectives for a CEU-eligible session at A Global Gathering for the Future of Child Welfare. Use only the session title, description, and context provided. Do not invent facts or ask about the event itself. Knowledge-check questions must test the session content, concepts, practices, or takeaways directly. Do not write meta questions about what the session says, covers, discusses, teaches, focuses on, or includes. Avoid True/False stems such as "This session will cover..." or "The session says..." Instead, write content-based stems such as "Trauma-informed practice includes..." or "A useful strategy for..." Make the questions simple, single-answer, and easy to edit. True/False questions are acceptable only when they assess a content claim directly. Objectives should begin with measurable verbs such as describe, identify, explain, apply, compare, or reflect on. Use plain text only. Output with exactly two headers: "Suggested Knowledge-Check Questions:" and "Suggested Measurable Objectives:"`;

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
