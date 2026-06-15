// Cloudflare Worker — Asystent zakupowy farbyjachtowe.pl
// ========================================================
// Architektura: Cloudflare AI Search (beta) crawluje farbyjachtowe.pl
// i indeksuje pełne strony produktów. Przy każdym pytaniu:
//   1. AI Search → wyszukuje trafne fragmenty stron sklepu
//   2. Claude Haiku → odpowiada po polsku na podstawie znalezionych treści
//
// SETUP (jednorazowo):
//   1. npm install -g wrangler && wrangler login
//   2. wrangler ai-search create          ← interaktywny kreator
//        Name: farbyjachtowe
//        Source: website
//        URL: https://www.farbyjachtowe.pl
//   3. wrangler deploy
//   4. wrangler secret put ANTHROPIC_API_KEY
//   5. wrangler deploy  (ponownie — żeby załadować sekret)
//
// Crawling zaczyna się automatycznie po utworzeniu instancji i trwa ok. 10-30 min.
// Postęp sprawdzisz w: Cloudflare Dashboard → AI Search → farbyjachtowe → Status

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
- Polecaj wyłącznie produkty, które pojawią się w dostarczonych treściach ze sklepu
- NIGDY nie wymyślaj produktów ani cen, których nie ma w podanych treściach
- Jeśli nie znajdziesz odpowiedniego produktu: "Nie mam pewności — skontaktuj się ze sklepem na farbyjachtowe.pl"
- Jeśli klient nie podał materiału łodzi (laminat/drewno/metal) i ma to znaczenie — dopytaj
- Doradzaj praktycznie: kolejność aplikacji, liczba warstw, przygotowanie powierzchni

FORMAT gdy polecasz produkt:
**[Nazwa produktu]** — [do czego i jak stosować, opcjonalnie cena]
🔗 [link do produktu jeśli znalazłeś w treści]

Przy kilku produktach wymień w kolejności aplikacji.`;

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

    // 1. Szukaj trafnych stron w sklepie przez AI Search
    let context = '';
    try {
      const searchResult = await env.SEARCH.search({
        messages: [{ role: 'user', content: message }],
      });

      const chunks = (searchResult.chunks || []).slice(0, 6);
      if (chunks.length > 0) {
        context = chunks
          .map(c => {
            const src = c.item?.key || '';
            return src ? `[${src}]\n${c.content}` : c.content;
          })
          .join('\n\n---\n\n');
      }
    } catch (searchErr) {
      console.error('AI Search error:', searchErr);
      // Kontynuuj bez kontekstu — Claude poinformuje że nie zna odpowiedzi
    }

    // 2. Historia rozmowy (ostatnie 6 wiadomości)
    const history = (Array.isArray(body.history) ? body.history : [])
      .slice(-6)
      .filter(h => h?.role && typeof h?.content === 'string')
      .map(h => ({ role: h.role, content: h.content }));

    // 3. Claude Haiku — odpowiedź po polsku na podstawie znalezionych treści
    const systemText = context
      ? SYSTEM_PROMPT + '\n\n═══ ZNALEZIONE TREŚCI ZE SKLEPU ═══\n\n' + context
      : SYSTEM_PROMPT + '\n\n(Brak wyników wyszukiwania dla tego pytania.)';

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
        system: systemText,
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
