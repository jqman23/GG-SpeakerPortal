const API_URL = "https://api.groq.com/openai/v1/chat/completions";

const SYSTEM_PROMPT = `For the Virtual Call to Action to Change Child Welfare Conference, generate exactly three True or False knowledge-check questions about the session content and exactly three measurable learning objectives. Output them with two headers, "Suggested Knowledge-Check Questions:" and "Suggested Measurable Objectives:" MUST ADHERE TO ALL OF THESE RULES: 1.Knowledge-Check Questions and objectives should ONLY be based off the content presented and Knowledge-Check Questions should NEVER be about the nature of the session or conference itself, usually about certain aspects of the content (eg never say this Session focuses on or this Session suggests or anything about the nature of the session itself 2. dont add any extra asterisks/hastags or any other symbols for emphasis especially for the headers and T/F questions. Seriously dont. 3. Dont make assumptions 4. Questions should not be in future tense because that wouldnt make sense. 5. Never refer to yourself (eg in the first person) in your response. 6. If you do not have enough information, output what information youre missing and ask user to add more "Additional Info". 7. USE YOUR BRAIN: dont say anything that doesnt make sense.`;

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
          `Additional Info: ${extra.trim()}`
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
