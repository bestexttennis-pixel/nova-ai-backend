// BestExt AI — serveur backend
// - Gemini (gratuit) pour le modèle, dans les deux plans
// - Plan gratuit : 40 messages / 5h, par IP
// - Plan Pro : illimité, débloqué automatiquement après paiement Stripe
//   (Stripe Checkout crée une session de paiement ; après succès, l'utilisateur
//   est renvoyé sur le site avec le code Pro directement dans l'URL)

const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const PRO_ACCESS_CODE = process.env.PRO_ACCESS_CODE;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const FRONTEND_URL = process.env.FRONTEND_URL; // ex: https://nova-ai.netlify.app
const PRO_PRICE_CENTS = parseInt(process.env.PRO_PRICE_CENTS || "500", 10); // 500 = 5,00€
const PRO_CURRENCY = process.env.PRO_CURRENCY || "eur";

const FREE_MESSAGE_LIMIT = 40;
const FREE_WINDOW_MS = 5 * 60 * 60 * 1000; // 5 heures

if (!GEMINI_KEY) console.warn("⚠️  GEMINI_API_KEY manquante.");
if (!PRO_ACCESS_CODE) console.warn("⚠️  PRO_ACCESS_CODE manquante — le niveau Pro sera inaccessible.");
if (!STRIPE_SECRET_KEY) console.warn("⚠️  STRIPE_SECRET_KEY manquante — le paiement Pro ne fonctionnera pas.");
if (!FRONTEND_URL) console.warn("⚠️  FRONTEND_URL manquante — les redirections Stripe ne fonctionneront pas.");

// Compteur en mémoire : IP -> { windowStart, count }
const usage = new Map();
function checkAndIncrement(ip) {
  const now = Date.now();
  const entry = usage.get(ip);
  if (!entry || now - entry.windowStart > FREE_WINDOW_MS) {
    usage.set(ip, { windowStart: now, count: 1 });
    return { count: 1, resetInMs: FREE_WINDOW_MS };
  }
  entry.count += 1;
  return { count: entry.count, resetInMs: FREE_WINDOW_MS - (now - entry.windowStart) };
}

const SYSTEM_PROMPT =
  "Tu es BestExt AI, un assistant conversationnel utile et chaleureux. Donne des réponses complètes, bien structurées (utilise des listes à puces, du gras avec ** et des paragraphes courts quand c'est utile) et informatives. Réponds toujours dans la langue de l'utilisateur.";

// ---- Création d'une session de paiement Stripe pour débloquer le Pro ----
app.post("/api/create-checkout-session", async (req, res) => {
  try {
    if (!STRIPE_SECRET_KEY || !FRONTEND_URL) {
      return res.status(500).json({ error: "Paiement non configuré côté serveur." });
    }

    const params = new URLSearchParams();
    params.append("mode", "payment");
    params.append("success_url", `${FRONTEND_URL}?pro=${encodeURIComponent(PRO_ACCESS_CODE)}&paid=1`);
    params.append("cancel_url", FRONTEND_URL);
    params.append("line_items[0][quantity]", "1");
    params.append("line_items[0][price_data][currency]", PRO_CURRENCY);
    params.append("line_items[0][price_data][unit_amount]", String(PRO_PRICE_CENTS));
    params.append("line_items[0][price_data][product_data][name]", "BestExt AI Pro — accès illimité");

    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const session = await stripeRes.json();

    if (!stripeRes.ok) {
      console.error("Erreur Stripe:", session);
      return res.status(500).json({ error: "Impossible de créer la session de paiement." });
    }

    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

app.post("/api/chat", async (req, res) => {
  try {
    const { messages, code, lang } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Le champ 'messages' est requis." });
    }

    const isPro = PRO_ACCESS_CODE && code && code === PRO_ACCESS_CODE;

    const LANG_NAMES = { fr: "français", en: "anglais", es: "espagnol", pt: "portugais", de: "allemand", ar: "arabe" };
    const langInstruction = lang && LANG_NAMES[lang]
      ? ` Réponds impérativement en ${LANG_NAMES[lang]}, quelle que soit la langue utilisée par l'utilisateur.`
      : "";

    if (!isPro) {
      const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
      const { count, resetInMs } = checkAndIncrement(ip);
      if (count > FREE_MESSAGE_LIMIT) {
        const minutes = Math.ceil(resetInMs / 60000);
        return res.status(429).json({
          error: `Limite gratuite atteinte (${FREE_MESSAGE_LIMIT} messages / 5h). Réessaie dans ${minutes} min, ou passe en BestExt AI Pro pour un accès illimité.`,
        });
      }
    }

    const contents = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:streamGenerateContent?alt=sse&key=${GEMINI_KEY}`;

    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT + langInstruction }] },
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
app.listen(PORT, () => console.log(`BestExt AI backend en écoute sur le port ${PORT}`));
