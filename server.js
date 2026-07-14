// Nova AI — serveur backend
// Utilise l'API Groq (gratuite, quotas généreux) pour faire tourner un modèle
// open-source performant (Llama 3.3) derrière Nova AI.

const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const API_KEY = process.env.GROQ_API_KEY; // définie sur ton hébergeur, jamais dans le code

if (!API_KEY) {
  console.warn("⚠️  GROQ_API_KEY n'est pas définie. Ajoute-la dans les variables d'environnement.");
}

app.post("/api/chat", async (req, res) => {
  try {
    const { messages } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Le champ 'messages' est requis." });
    }

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 1000,
        messages: [
          {
            role: "system",
            content:
              "Tu es Nova AI, un assistant conversationnel utile, chaleureux et concis. Réponds dans la langue de l'utilisateur.",
          },
          ...messages,
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Erreur API Groq:", data);
      return res.status(response.status).json({ error: "Erreur de l'API Groq." });
    }

    const reply = data.choices?.[0]?.message?.content?.trim() || "Désolé, je n'ai pas pu générer de réponse.";

    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Nova AI backend en écoute sur le port ${PORT}`));
