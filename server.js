// Nova AI — serveur backend
// Utilise l'API Groq (gratuite) en mode streaming pour des réponses
// plus rapides à l'affichage (le texte apparaît au fur et à mesure).

const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const API_KEY = process.env.GROQ_API_KEY;

if (!API_KEY) {
  console.warn("⚠️  GROQ_API_KEY n'est pas définie. Ajoute-la dans les variables d'environnement.");
}

app.post("/api/chat", async (req, res) => {
  try {
    const { messages } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Le champ 'messages' est requis." });
    }

    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 2048,
        temperature: 0.7,
        stream: true,
        messages: [
          {
            role: "system",
            content:
              "Tu es Nova AI, un assistant conversationnel utile et chaleureux. Donne des réponses complètes, bien structurées (utilise des listes à puces, du gras avec ** et des paragraphes courts quand c'est utile) et informatives. Réponds toujours dans la langue de l'utilisateur.",
          },
          ...messages,
        ],
      }),
    });

    if (!groqResponse.ok || !groqResponse.body) {
      const errData = await groqResponse.json().catch(() => ({}));
      console.error("Erreur API Groq:", errData);
      return res.status(groqResponse.status).json({ error: "Erreur de l'API Groq." });
    }

    // On relaie le flux SSE de Groq directement au client
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const reader = groqResponse.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }
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
