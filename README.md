# Nova AI — mise en ligne 100% gratuite

Deux morceaux :
1. **`nova-ai.html`** — l'interface (déjà prête).
2. **`server.js`** — le backend qui contient ta clé API et parle au modèle (via **Groq**, gratuit).

Groq héberge des modèles open-source (Llama 3.3 70B) et offre un accès API gratuit
avec des quotas généreux (des dizaines de milliers de tokens/jour selon le modèle,
largement suffisant pour un usage personnel ou petit public). Pas de carte bancaire requise.

## Étapes

### 1. Récupère une clé API Groq (gratuite)
1. Va sur https://console.groq.com
2. Crée un compte (email ou Google)
3. Va dans "API Keys" → "Create API Key"
4. Copie la clé (tu ne la reverras plus après)

### 2. Déploie le backend (gratuit, sur Render)
1. Crée un compte sur https://render.com
2. "New +" → "Web Service" → connecte le dossier **`nova-ai-backend`** (celui qui contient `server.js` et `package.json`) : crée d'abord un dépôt GitHub, mets-y le contenu de ce dossier, puis connecte ce dépôt à Render
3. Build command : `npm install`
4. Start command : `npm start`
5. Plan : **Free**
6. Dans "Environment", ajoute la variable :
   - `GROQ_API_KEY` = ta clé Groq
7. Déploie. Tu obtiens une URL du type `https://nova-ai-backend.onrender.com`

   ⚠️ Sur le plan gratuit de Render, le serveur "s'endort" après 15 min d'inactivité
   et met ~30-50 secondes à se réveiller au premier message après une pause. C'est
   normal et gratuit — si tu veux éviter ce délai, il faudra un plan payant plus tard.

### 3. Connecte le front au backend
Ouvre `nova-ai.html`, trouve la ligne :
```js
window.NOVA_BACKEND_URL = "";
```
Remplace par :
```js
window.NOVA_BACKEND_URL = "https://nova-ai-backend.onrender.com/api/chat";
```

### 4. Publie le front (gratuit)
Le fichier `nova-ai.html` est autonome — héberge-le n'importe où, gratuitement :
- **Netlify Drop** (glisser-déposer, aucun compte requis) : https://app.netlify.com/drop
- **GitHub Pages**
- **Vercel**

## Résumé des coûts
| Élément | Coût |
|---|---|
| Modèle IA (Groq, Llama 3.3) | Gratuit, quotas quotidiens |
| Backend (Render, plan Free) | Gratuit, s'endort après inactivité |
| Front (Netlify/GitHub Pages) | Gratuit |

Si l'usage public dépasse les quotas gratuits de Groq, les requêtes en trop
renverront une erreur temporaire (à gérer côté interface, ou passer à un plan payant plus tard).
