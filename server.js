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
