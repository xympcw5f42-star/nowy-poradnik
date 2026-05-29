// Cloudflare Worker — Asystent zakupowy farbyjachtowe.pl
// ========================================================
// SETUP (jednorazowo, w terminalu):
//
//   1. npm install -g wrangler
//   2. wrangler login
//   3. wrangler vectorize create produkty --dimensions=1024 --metric=cosine
//   4. wrangler deploy
//   5. wrangler secret put ANTHROPIC_API_KEY    ← klucz z console.anthropic.com
//   6. wrangler secret put REINDEX_SECRET       ← dowolne hasło, np. "tajnehaslo123"
//
//   Pierwsze indeksowanie produktów (po wdrożeniu):
//   curl -X POST https://<twoj-worker>.workers.dev/reindex \
//        -H "Authorization: Bearer tajnehaslo123"
//
//   Potem indeksowanie uruchamia się automatycznie co noc o 3:00.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const SYSTEM_PROMPT = `Jesteś asystentem zakupowym sklepu farbyjachtowe.pl — specjalistycznego sklepu z farbami, lakierami i preparatami do jachtów i łodzi motorowych.

ZASADY:
- Odpowiadaj TYLKO po polsku, konkretnie i rzeczowo
- Pomagaj w doborze produktów do malowania, konserwacji i napraw łodzi
- Jeśli pytanie absolutnie nie dotyczy łodzi, jachtów ani produktów morskich, grzecznie odmów i wróć do tematu
- NIGDY nie wymyślaj produktów — używaj wyłącznie produktów z dostarczonej listy
- Jeśli nie znasz odpowiedzi lub brak pasującego produktu, napisz: "Nie jestem pewien — skontaktuj się ze sklepem bezpośrednio na farbyjachtowe.pl"
- Zawsze dołącz link gdy polecasz konkretny produkt
- Bądź praktyczny: klienci chcą wiedzieć co kupić i jak zastosować

FORMAT odpowiedzi gdy polecasz produkty:
**[Nazwa produktu]** — [dlaczego pasuje, jak zastosować]
🔗 [pełny link do produktu]

Jeśli polecasz kilka produktów, wymień je w kolejności stosowania.`;

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);

    if (url.pathname === '/chat' && request.method === 'POST') {
      return handleChat(request, env);
    }

    if (url.pathname === '/reindex' && request.method === 'POST') {
      const auth = request.headers.get('Authorization');
      if (auth !== `Bearer ${env.REINDEX_SECRET}`) {
        return new Response('Unauthorized', { status: 401 });
      }
      ctx.waitUntil(reindexProducts(env));
      return jsonResponse({ ok: true, message: 'Indeksowanie uruchomione w tle. Sprawdź logi Workera.' });
    }

    return new Response('Not found', { status: 404 });
  },

  // Codziennie o 3:00 w nocy (konfiguracja w wrangler.toml)
  async scheduled(event, env, ctx) {
    ctx.waitUntil(reindexProducts(env));
  }
};

// ─── OBSŁUGA CZATU ───────────────────────────────────────────────────────────

async function handleChat(request, env) {
  try {
    const body = await request.json();
    const message = body?.message?.trim();
    if (!message) return jsonResponse({ error: 'Brak wiadomości' }, 400);

    // 1. Embed pytania użytkownika (wielojęzykowy model od Cloudflare AI)
    const queryVec = await embed(message, env);

    // 2. Szukaj pasujących produktów w bazie wektorowej
    const results = await env.VECTORIZE.query(queryVec, {
      topK: 8,
      returnMetadata: 'all'
    });

    const products = results.matches
      .filter(m => m.score > 0.38)
      .map(m => m.metadata);

    // 3. Zbuduj kontekst z produktów
    const context = products.length > 0
      ? products.map(p =>
          `Produkt: ${p.name}\nKategoria: ${p.category}\nOpis: ${p.description}\nCena: ${p.price ? p.price + ' PLN' : 'sprawdź na stronie'}\nLink: ${p.url}`
        ).join('\n\n---\n\n')
      : 'Brak produktów pasujących do zapytania w katalogu sklepu.';

    // 4. Opcjonalna historia rozmowy (ostatnie 6 wiadomości)
    const history = (body.history || []).slice(-6).map(h => ({
      role: h.role,
      content: h.content
    }));

    // 5. Wywołaj Claude Haiku
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
        system: SYSTEM_PROMPT + '\n\n═══ PRODUKTY Z KATALOGU (na podstawie wyszukiwania) ═══\n\n' + context,
        messages: [
          ...history,
          { role: 'user', content: message }
        ]
      })
    });

    if (!anthropicRes.ok) {
      const err = await anthropicRes.text();
      console.error('Anthropic API error:', err);
      return jsonResponse({ error: 'Błąd API asystenta' }, 500);
    }

    const data = await anthropicRes.json();
    const reply = data.content?.[0]?.text || 'Brak odpowiedzi od asystenta.';

    return jsonResponse({ reply });

  } catch (err) {
    console.error('handleChat error:', err);
    return jsonResponse({ error: 'Błąd serwera' }, 500);
  }
}

// ─── INDEKSOWANIE KATALOGU ────────────────────────────────────────────────────

async function reindexProducts(env) {
  console.log('[reindex] Start indeksowania produktów...');

  try {
    const feedRes = await fetch(env.FEED_URL, {
      headers: { 'User-Agent': 'farbyjachtowe-asystent/1.0' }
    });
    if (!feedRes.ok) throw new Error(`Feed zwrócił HTTP ${feedRes.status}`);

    const xml = await feedRes.text();
    const products = parseXML(xml);

    if (products.length === 0) {
      console.error('[reindex] BŁĄD: Brak produktów w feedzie! Sprawdź URL feedu XML.');
      return;
    }

    console.log(`[reindex] Znaleziono ${products.length} produktów. Indeksuję...`);

    const BATCH = 20;
    let indexed = 0;

    for (let i = 0; i < products.length; i += BATCH) {
      const batch = products.slice(i, i + BATCH);

      const texts = batch.map(p =>
        `${p.name}. Kategoria: ${p.category}. ${p.description}`.slice(0, 600)
      );

      const aiRes = await env.AI.run('@cf/baai/bge-m3', { texts });
      const embeddings = aiRes.data;

      const vectors = batch.map((p, j) => ({
        id: `p-${p.id || (i + j)}`,
        values: embeddings[j],
        metadata: {
          name: p.name,
          category: p.category || 'Ogólne',
          description: (p.description || '').slice(0, 500),
          price: p.price || '',
          url: p.url,
        }
      }));

      await env.VECTORIZE.upsert(vectors);
      indexed += batch.length;
      console.log(`[reindex] ${indexed}/${products.length}`);

      // Przerwa między partiami
      await new Promise(r => setTimeout(r, 300));
    }

    console.log(`[reindex] Zakończono! Zaindeksowano ${indexed} produktów.`);

  } catch (err) {
    console.error('[reindex] Błąd:', err);
  }
}

// ─── PARSER XML ──────────────────────────────────────────────────────────────

function parseXML(xml) {
  const products = [];

  // Format Ceneo ShopGold: <o id="..." url="..." price="...">...</o>
  const offerRe = /<o\b([^>]*)>([\s\S]*?)<\/o>/gi;
  let m;
  while ((m = offerRe.exec(xml)) !== null) {
    const attrs = m[1];
    const body = m[2];
    const url   = getAttr(attrs, 'url');
    const name  = getTag(body, 'name');
    if (!name || !url) continue;
    products.push({
      id:          getAttr(attrs, 'id'),
      url,
      price:       getAttr(attrs, 'price'),
      name,
      category:    getTag(body, 'cat') || getTag(body, 'category') || '',
      description: stripHTML(getTag(body, 'desc') || getTag(body, 'description') || ''),
    });
  }

  // Format Google Merchant: <item>...</item>
  if (products.length === 0) {
    const itemRe = /<item>([\s\S]*?)<\/item>/gi;
    while ((m = itemRe.exec(xml)) !== null) {
      const body = m[1];
      const name = getTag(body, 'g:title') || getTag(body, 'title');
      const url  = getTag(body, 'link') || getTag(body, 'g:link');
      if (!name || !url) continue;
      products.push({
        id:          getTag(body, 'g:id') || getTag(body, 'id') || url,
        url,
        price:       (getTag(body, 'g:price') || getTag(body, 'price') || '').replace(/[^0-9.,]/g, ''),
        name,
        category:    getTag(body, 'g:product_type') || getTag(body, 'g:google_product_category') || '',
        description: stripHTML(getTag(body, 'description') || getTag(body, 'g:description') || ''),
      });
    }
  }

  return products;
}

function getAttr(str, name) {
  const m = str.match(new RegExp(`${name}="([^"]*)"`, 'i'));
  return m ? m[1] : '';
}

function getTag(html, tag) {
  const m = html.match(
    new RegExp(`<${tag}[^>]*>(?:<![\\[CDATA\\[)?([\s\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i')
  );
  if (m) return m[1].trim();
  // Spróbuj bez CDATA
  const m2 = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return m2 ? m2[1].trim() : '';
}

function stripHTML(str) {
  return str.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

async function embed(text, env) {
  const res = await env.AI.run('@cf/baai/bge-m3', { texts: [text] });
  return res.data[0];
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS }
  });
}
