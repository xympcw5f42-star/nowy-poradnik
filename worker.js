// Cloudflare Worker — Asystent zakupowy farbyjachtowe.pl
// ========================================================
// Architektura: cały katalog produktów (803 pozycje) jest wgrany do system
// promptu z prompt caching. Bez bazy wektorowej i indeksowania — prosto i tanio.
//
// SETUP (jednorazowo, w terminalu):
//
//   1. npm install -g wrangler
//   2. wrangler login
//   3. wrangler deploy
//   4. wrangler secret put ANTHROPIC_API_KEY   ← klucz z console.anthropic.com
//
// Aktualizacja katalogu: wyeksportuj nowy CSV z ShopGold, przegeneruj
// products.js i ponownie `wrangler deploy`.

import { PRODUCT_CATALOG } from './products.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Format linku do wyszukiwarki sklepu.
// SPRAWDŹ: wpisz cokolwiek w wyszukiwarkę na farbyjachtowe.pl i zobacz adres URL.
// Najczęściej w ShopGold jest to ?szukaj=... lub ?text=...
// {q} zostanie zastąpione zapytaniem (numerem katalogowym lub nazwą).
const SEARCH_URL = 'https://www.farbyjachtowe.pl/search.html?text={q}';

const SYSTEM_PROMPT = `Jesteś asystentem zakupowym sklepu farbyjachtowe.pl — specjalistycznego sklepu z farbami, lakierami i preparatami do jachtów i łodzi.

TWOJE ZADANIE:
Pomagasz klientom dobrać odpowiednie produkty do malowania, konserwacji i napraw łodzi (laminat, drewno, aluminium, stal, gelcoat).

ZASADY (bezwzględne):
- Odpowiadaj TYLKO po polsku, krótko i konkretnie
- Polecaj WYŁĄCZNIE produkty z listy poniżej. NIGDY nie wymyślaj produktów ani nazw, których nie ma na liście
- Jeśli żaden produkt z listy nie pasuje, powiedz: "Nie mam pewności co do tego produktu — najlepiej skontaktuj się ze sklepem na farbyjachtowe.pl"
- Jeśli pytanie nie dotyczy łodzi/farb/konserwacji, grzecznie odmów i wróć do tematu
- Gdy nie jesteś pewien doboru lub zastosowania, zaznacz to i zaproponuj kontakt ze sklepem
- Doradzaj praktycznie: co kupić, w jakiej kolejności stosować, ile warstw
- Jeśli klient nie podał materiału łodzi (laminat/drewno/metal) i ma to znaczenie — dopytaj

FORMAT gdy polecasz produkt:
**[dokładna nazwa z listy]** — [krótko: do czego i jak stosować]
🔗 [link — wstaw numer katalogowy w miejsce {q} w adresie: ${SEARCH_URL}]

Przy kilku produktach wymień je w kolejności aplikacji (np. podkład → farba nawierzchniowa → antifouling).

═══════════════════════════════════════════════════════
KATALOG PRODUKTÓW (format: NUMER_KATALOGOWY | Nazwa)
═══════════════════════════════════════════════════════
${PRODUCT_CATALOG}`;

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);
    if (url.pathname === '/chat' && request.method === 'POST') {
      return handleChat(request, env);
    }

    return new Response('Asystent farbyjachtowe.pl — endpoint /chat', { status: 200, headers: CORS });
  }
};

async function handleChat(request, env) {
  try {
    const body = await request.json();
    const message = body?.message?.trim();
    if (!message) return jsonResponse({ error: 'Brak wiadomości' }, 400);
    if (message.length > 500) return jsonResponse({ error: 'Wiadomość za długa' }, 400);

    // Historia rozmowy (ostatnie 6 wiadomości, dla kontekstu)
    const history = (Array.isArray(body.history) ? body.history : [])
      .slice(-6)
      .filter(h => h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string')
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
        // Prompt caching: katalog (duży, stały) cache'owany → tanio przy kolejnych pytaniach
        system: [
          {
            type: 'text',
            text: SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' }
          }
        ],
        messages: [
          ...history,
          { role: 'user', content: message }
        ]
      })
    });

    if (!anthropicRes.ok) {
      const err = await anthropicRes.text();
      console.error('Anthropic API error:', anthropicRes.status, err);
      return jsonResponse({ error: 'Błąd API asystenta' }, 502);
    }

    const data = await anthropicRes.json();
    const reply = data.content?.[0]?.text || 'Przepraszam, nie udało się wygenerować odpowiedzi.';

    return jsonResponse({ reply });

  } catch (err) {
    console.error('handleChat error:', err);
    return jsonResponse({ error: 'Błąd serwera' }, 500);
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS }
  });
}
