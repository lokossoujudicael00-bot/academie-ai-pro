// Fonction Vercel : le formateur IA (Gemini). La clé reste secrète, côté serveur.
const COURSE = `Tu es le formateur de l’Académie IA Pro. Tu donnes un atelier complet de 2 heures sur l’utilisation de l’IA au travail, seul avec un élève, de A à Z.
Réponds toujours dans la langue de l’élève, avec des phrases courtes et simples, sans jargon.
Règles :
1. Au début, demande son prénom, son métier et ce qu’il veut améliorer dans son travail.
2. Enseigne un seul module à la fois, dans l’ordre. À la fin de chaque module, donne un exercice pratique lié à son métier, attends sa réponse, corrige avec bienveillance, puis passe au module suivant seulement quand il a compris.
3. Donne toujours des exemples concrets de demandes à copier-coller.
4. Messages courts (150 mots maximum), une seule idée et une seule question à la fois.
5. Rappelle ses progrès. Si l’élève revient plus tard, reprends là où la conversation s’est arrêtée.
6. Reste sur le programme ; pour tout autre sujet, ramène poliment au cours.
7. Ne donne jamais de conseil médical, juridique ou financier. N’invente jamais de faits.
Programme :
Module 1 - Les bases (20 min) : poser une demande claire (rôle, contexte, tâche, format attendu).
Module 2 - E-mails, rapports et comptes rendus en 5 minutes (25 min).
Module 3 - Analyser des documents et des tableurs (25 min).
Module 4 - Automatiser une tâche qui se répète (25 min).
Module 5 - Exercices finaux et plan d’action personnel (25 min). Termine par un récapitulatif de ses 5 meilleures demandes et félicite-le.`;

const SALES = `Tu es l’assistant de vente de l’Académie IA Pro. Réponds en français (ou dans la langue du visiteur), en 3 phrases maximum, uniquement sur cette offre : atelier de 2 h pour apprendre à utiliser l’IA au travail, 25 $ au lieu de 49 $, disponible à tout moment dès que le paiement est confirmé, guide PDF inclus, aucun niveau requis. Mini-formation vidéo à 29 $, communauté à 19 $/mois, atelier privé pour équipes sur devis. Paiement : le client envoie sa demande depuis le formulaire, reçoit les instructions de paiement pour son pays, paie, envoie la capture, puis reçoit son code d’accès. N’invente rien ; si tu ne sais pas, invite à écrire sur WhatsApp.`;

const KEY = () => (process.env.GEMINI_API_KEY || "").trim();
const MODEL = () => (process.env.GEMINI_MODEL || "gemini-flash-latest").trim();
// Un code = des lettres/chiffres reliés par des tirets (ex. IA-25US-BF6Z). Le reste du texte est ignoré.
const CODES = () => ((process.env.ACCESS_CODES || "").match(/[A-Za-z0-9]+(?:-[A-Za-z0-9]+)+/g) || []).map(s => s.toLowerCase());

async function callGemini(system, contents, maxTokens) {
  const url = "https://generativelanguage.googleapis.com/v1beta/models/" + MODEL() + ":generateContent";
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": KEY() },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.6 }
    })
  });
  const data = await r.json().catch(() => ({}));
  const parts = (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
  const text = parts.map(p => p.text || "").join("");
  const err = data && data.error && data.error.message;
  return { ok: r.ok && !!text, text, error: err || (r.ok ? "Réponse vide" : "Erreur " + r.status) };
}

async function main(req, res) {
  // Diagnostic : ouvre /api/chat dans le navigateur. Avec ?test=UN_CODE_VALIDE, teste aussi Gemini.
  if (req.method === "GET") {
    const info = { fonction: "ok", cle_gemini_presente: !!KEY(), modele: MODEL(), nombre_de_codes: CODES().length };
    const t = String((req.query && req.query.test) || "").trim().toLowerCase();
    if (t && CODES().includes(t) && KEY()) {
      try {
        const g = await callGemini("Réponds en un mot.", [{ role: "user", parts: [{ text: "Dis bonjour." }] }], 200);
        info.test_gemini = g.ok ? "OK : " + g.text.slice(0, 40) : "ECHEC : " + g.error;
      } catch (e) { info.test_gemini = "ECHEC : service injoignable"; }
    } else if (t) {
      info.test_gemini = "Code de test invalide ou clé manquante";
    }
    return res.status(200).json(info);
  }
  if (req.method !== "POST") return res.status(405).json({ error: "POST uniquement" });
  if (!KEY()) return res.status(500).json({ error: "Clé Gemini manquante" });

  const body = req.body || {};
  const mode = body.mode === "course" ? "course" : "sales";

  if (mode === "course") {
    if (!CODES().includes(String(body.code || "").trim().toLowerCase())) {
      return res.status(401).json({ error: "Code d’accès invalide" });
    }
  }

  const msgs = Array.isArray(body.messages) ? body.messages.slice(-30) : [];
  const contents = msgs
    .filter(m => m && typeof m.text === "string" && m.text.trim())
    .map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.text.slice(0, 2000) }] }));
  if (!contents.length || contents[contents.length - 1].role !== "user") {
    return res.status(400).json({ error: "Message manquant" });
  }

  try {
    const g = await callGemini(mode === "course" ? COURSE : SALES, contents, mode === "course" ? 1500 : 600);
    if (!g.ok) return res.status(502).json({ error: g.error });
    return res.status(200).json({ text: g.text });
  } catch (e) {
    return res.status(502).json({ error: "Service IA indisponible" });
  }
}

// Filet de sécurité : si quelque chose plante, la page de test affiche la vraie cause.
module.exports = async function handler(req, res) {
  try {
    return await main(req, res);
  } catch (e) {
    return res.status(500).json({ error: "Erreur interne : " + String((e && e.message) || e) });
  }
};
