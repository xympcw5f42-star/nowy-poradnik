// Cloudflare Worker — Asystent zakupowy farbyjachtowe.pl
// Katalog 803 produktów jest zawarty w products.js (wygenerowany z eksportu CSV).
// Przy każdym pytaniu: katalog trafia do systemu promptu z prompt caching → Claude Haiku odpowiada.
//
// DEPLOY:
//   wrangler deploy
//   wrangler secret put ANTHROPIC_API_KEY
//   wrangler deploy

import { PRODUCT_CATALOG } from './products.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const SYSTEM_PROMPT = `Jesteś asystentem zakupowym sklepu farbyjachtowe.pl — specjalistycznego sklepu z farbami, lakierami i preparatami do jachtów i łodzi motorowych.

TWOJE ZADANIE:
Pomagasz klientom dobrać odpowiednie produkty do malowania, konserwacji i napraw łodzi (laminat, drewno, aluminium, stal, gelcoat).

ZASADY:
- Odpowiadaj TYLKO po polsku, konkretnie i rzeczowo
- Polecaj WYŁĄCZNIE produkty z listy poniżej — NIGDY nie wymyślaj nazw których tam nie ma
- Jeśli żaden produkt nie pasuje: "Nie mam pewności — skontaktuj się ze sklepem na farbyjachtowe.pl"
- Jeśli klient nie podał materiału łodzi i ma to znaczenie — dopytaj
- Doradzaj praktycznie: kolejność aplikacji, liczba warstw, przygotowanie powierzchni
FORMAT gdy polecasz produkt (zawsze podaj link):
**[dokładna nazwa z listy]** — [do czego i jak stosować]
🔗 https://www.farbyjachtowe.pl/szukaj.html/szukaj=[NUMER_KATALOGOWY]

Przykład: jeśli numer katalogowy to EPRO-001/1000, link to:
🔗 https://www.farbyjachtowe.pl/szukaj.html/szukaj=EPRO-001/1000

Przy kilku produktach wymień w kolejności aplikacji.

═══════════════════════════════════════════════════════
KATALOG PRODUKTÓW (NUMER_KATALOGOWY | Nazwa)
═══════════════════════════════════════════════════════
${PRODUCT_CATALOG}`;

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);
    if (url.pathname === '/chat' && request.method === 'POST') {
      return handleChat(request, env);
    }

    return new Response('Asystent farbyjachtowe.pl', { status: 200, headers: CORS });
  }
};

async function handleChat(request, env) {
  try {
    const body = await request.json();
    const message = body?.message?.trim();
    if (!message) return jsonResponse({ error: 'Brak wiadomości' }, 400);
    if (message.length > 500) return jsonResponse({ error: 'Wiadomość za długa' }, 400);

    const history = (Array.isArray(body.history) ? body.history : [])
      .slice(-6)
      .filter(h => h?.role && typeof h?.content === 'string')
      .map(h => ({ role: h.role, content: h.content }));

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: [
          {
            type: 'text',
            text: SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' }
          }
        ],
        messages: [...history, { role: 'user', content: message }],
      }),
    });

    if (!anthropicRes.ok) {
      const err = await anthropicRes.text();
      console.error('Anthropic error:', anthropicRes.status, err);
      return jsonResponse({ error: 'Błąd API asystenta' }, 502);
    }

    const data = await anthropicRes.json();
    const reply = data.content?.[0]?.text || 'Brak odpowiedzi.';

    return jsonResponse({ reply });

  } catch (err) {
    console.error('handleChat error:', err);
    return jsonResponse({ error: 'Błąd serwera' }, 500);
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}
