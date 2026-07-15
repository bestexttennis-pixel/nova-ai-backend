// Nova AI — serveur backend
// Utilise l'API Google Gemini (gratuite) pour tout le monde.
// Le niveau "Pro" ne change pas le modèle (toujours Gemini, donc $0 pour toi) :
// il retire simplement la limite quotidienne de messages du niveau gratuit.

const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const PRO_ACCESS_CODE = process.env.PRO_ACCESS_CODE; // le code que tu donnes à tes clients payants
const FREE_DAILY_LIMIT = parseInt(process.env.FREE_DAILY_LIMIT || "15", 10);

if (!GEMINI_KEY) {
  console.warn("⚠️  GEMINI_API_KEY n'est pas définie.");
}
if (!PRO_ACCESS_CODE) {
  console.warn("⚠️  PRO_ACCESS_CODE n'est pas définie — le niveau Pro sera inaccessible.");
}

// Compteur simple en mémoire (IP -> { count, day }). Se réinitialise si le serveur redémarre.
const usage = new Map();
function todayKey() {
  return new Date().toISOString().slice(0, 10);
}
function checkAndIncrement(ip) {
  const key = todayKey();
  const entry = usage.get(ip);
  if (!entry || entry.day !== key) {
    usage.set(ip, { day: key, count: 1 });
    return 1;
  }
  entry.count += 1;
  return entry.count;
}

const SYSTEM_PROMPT =
  "Tu es Nova AI, un assistant conversationnel utile et chaleureux. Donne des réponses complètes, bien structurées (utilise des listes à puces, du gras avec ** et des paragraphes courts quand c'est utile) et informatives. Réponds toujours dans la langue de l'utilisateur.";

app.post("/api/chat", async (req, res) => {
  try {
    const { messages, code } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Le champ 'messages' est requis." });
    }

    const isPro = PRO_ACCESS_CODE && code && code === PRO_ACCESS_CODE;

    if (!isPro) {
      const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
      const count = checkAndIncrement(ip);
      if (count > FREE_DAILY_LIMIT) {
        return res.status(429).json({
          error: `Limite quotidienne gratuite atteinte (${FREE_DAILY_LIMIT} messages/jour). Passe en Nova AI Pro pour un accès illimité.`,
        });
      }
    }

    const contents = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:streamGenerateContent?alt=sse&key=${GEMINI_KEY}`;

    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        generationConfig: { maxOutputTokens: 2048, temperature: 0.7 },
      }),
    });

    if (!geminiResponse.ok || !geminiResponse.body) {
      const errData = await geminiResponse.json().catch(() => ({}));
      console.error("Erreur API Gemini:", errData);
      return res.status(geminiResponse.status).json({ error: "Erreur de l'API Gemini." });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const reader = geminiResponse.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        try {
          const json = JSON.parse(payload);
          const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
          }
        } catch (e) { /* ligne partielle, on ignore */ }
      }
    }
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Erreur serveur." });
    } else {
      res.end();
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Nova AI backend en écoute sur le port ${PORT}`));
