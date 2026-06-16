// Cloudflare Worker — Asystent zakupowy farbyjachtowe.pl
// Katalog 805 produktów + poradniki techniczne w system promptcie z prompt caching.
//
// DEPLOY:
//   wrangler deploy
//   wrangler secret put ANTHROPIC_API_KEY

import { PRODUCT_CATALOG } from './products.js';
import { GUIDES } from './guides.js';

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
- Polecaj WYŁĄCZNIE produkty z katalogu poniżej — NIGDY nie wymyślaj produktów których tam nie ma
- Jeśli żaden produkt nie pasuje lub klient chce porozmawiać z człowiekiem, podaj dane kontaktowe:
  📞 913 508 560 | ✉️ sklep@farbyjachtowe.pl
- Dane kontaktowe podaj też zawsze gdy nie jesteś pewien odpowiedzi
- Jeśli klient nie podał materiału łodzi i ma to znaczenie — dopytaj
- Doradzaj praktycznie: kolejność aplikacji, liczba warstw, przygotowanie powierzchni
- Przy odpowiedzi na pytania techniczne korzystaj z poradników poniżej

ZASADY TECHNICZNE (bezwzględne — nigdy nie naruszaj):
- Na farbę jednoskładnikową NIE kładziemy farby dwuskładnikowej
- Podkład pod linię wody na surowy laminat/drewno/aluminium/metal: zawsze dwuskładnikowy epoksydowy
- Podkład pod linię wody na istniejącą powłokę: przekładkowy jednoskładnikowy
- Zawsze pytaj o stan podłoża (surowe czy istniejąca powłoka) jeśli klient tego nie podał
- Jeśli klient chce położyć produkt dwuskładnikowy na jednoskładnikowy — ostrzeż go i zaproponuj właściwe rozwiązanie

PRIORYTETY PRODUCENTÓW (proponuj w tej kolejności gdy kilka produktów pasuje):
1. Seajet — najwyższy priorytet
2. Epifanes
3. Marlin
4. West System
5. Sika
Jeśli żaden z priorytetowych producentów nie ma odpowiedniego produktu, polecaj najlepiej pasujący z katalogu.

FORMAT gdy polecasz produkt:
**[dokładna nazwa z katalogu]** — [do czego i jak stosować] | [cena] PLN
🔗 [dokładny URL z katalogu]

Przy kilku produktach wymień w kolejności aplikacji (podkład → nawierzchnia → antifouling itp.).

════════════════════════════════════════════════════════════
PORADNIKI TECHNICZNE
════════════════════════════════════════════════════════════
${GUIDES}

════════════════════════════════════════════════════════════
KATALOG PRODUKTÓW
Format: [NR_KAT] Nazwa | Cena PLN | URL
  ↳ Opis
════════════════════════════════════════════════════════════
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
    if (url.pathname === '/admin') {
      return handleAdmin(url, env);
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
        max_tokens: 2048,
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

    // Zapisz rozmowę do KV (jeśli namespace jest skonfigurowany)
    if (env.CONVERSATIONS) {
      const sessionId = typeof body.sessionId === 'string' ? body.sessionId.slice(0, 36) : 'unknown';
      const ts = new Date().toISOString();
      const key = `msg:${ts}:${sessionId.slice(0, 8)}`;
      await env.CONVERSATIONS.put(key, JSON.stringify({
        ts, sessionId,
        user: message,
        bot: reply,
      }), { expirationTtl: 60 * 60 * 24 * 90 }); // przechowuj 90 dni
    }

    return jsonResponse({ reply });

  } catch (err) {
    console.error('handleChat error:', err);
    return jsonResponse({ error: 'Błąd serwera' }, 500);
  }
}

async function handleAdmin(url, env) {
  if (!env.CONVERSATIONS) {
    return new Response('KV nie jest skonfigurowane.', { status: 503 });
  }
  if (url.searchParams.get('key') !== env.ADMIN_KEY) {
    return new Response('Unauthorized', { status: 401 });
  }

  const list = await env.CONVERSATIONS.list({ prefix: 'msg:', limit: 500 });
  const keys = list.keys.reverse(); // najnowsze pierwsze

  const items = await Promise.all(
    keys.map(async k => {
      const v = await env.CONVERSATIONS.get(k.name);
      return v ? JSON.parse(v) : null;
    })
  );

  // Grupuj według sessionId
  const sessions = new Map();
  for (const item of items.filter(Boolean)) {
    const sid = item.sessionId || 'unknown';
    if (!sessions.has(sid)) sessions.set(sid, []);
    sessions.get(sid).push(item);
  }

  const rows = [...sessions.entries()].map(([sid, msgs]) => {
    const first = msgs[msgs.length - 1];
    const last = msgs[0];
    const date = new Date(last.ts).toLocaleString('pl-PL');
    const count = msgs.length;
    const preview = msgs[msgs.length - 1].user.slice(0, 80);
    const detail = msgs.map(m =>
      `<div class="msg u"><b>Klient:</b> ${esc(m.user)}</div>` +
      `<div class="msg b"><b>Asystent:</b> ${esc(m.bot)}</div>`
    ).join('');
    return `
      <details>
        <summary><span class="date">${date}</span> — ${esc(preview)}${count > 1 ? ` <em>(${count} wiad.)</em>` : ''}</summary>
        <div class="conv">${detail}</div>
      </details>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="pl"><head><meta charset="UTF-8">
<title>Rozmowy — farbyjachtowe.pl</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 860px; margin: 40px auto; padding: 0 20px; background: #f4f8fc; color: #1a2e3b; }
  h1 { color: #0d2d5e; border-bottom: 2px solid #f7941d; padding-bottom: 10px; }
  details { background: #fff; border-radius: 10px; margin: 10px 0; box-shadow: 0 2px 8px rgba(0,0,0,.08); overflow: hidden; }
  summary { padding: 14px 18px; cursor: pointer; list-style: none; font-size: 14px; }
  summary::-webkit-details-marker { display: none; }
  summary:hover { background: #f0f7ff; }
  .date { color: #1a5fa8; font-weight: 700; margin-right: 8px; }
  em { color: #888; font-size: 12px; }
  .conv { padding: 0 18px 14px; border-top: 1px solid #e4eef8; }
  .msg { padding: 8px 12px; border-radius: 8px; margin: 8px 0; font-size: 13px; line-height: 1.5; white-space: pre-wrap; }
  .u { background: #f0f7ff; border-left: 3px solid #1a5fa8; }
  .b { background: #fff8f0; border-left: 3px solid #f7941d; }
  p.info { color: #666; font-size: 13px; }
</style></head><body>
<h1>💬 Rozmowy z asystentem</h1>
<p class="info">Łącznie sesji: <strong>${sessions.size}</strong> · Wiadomości: <strong>${items.filter(Boolean).length}</strong> · Ostatnie 90 dni</p>
${rows || '<p>Brak rozmów.</p>'}
</body></html>`;

  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}
