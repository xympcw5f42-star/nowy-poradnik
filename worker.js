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

const SYSTEM_PROMPT = `Nazywasz się Izydor i jesteś interaktywnym asystentem sklepu farbyjachtowe.pl — specjalistycznego sklepu z farbami, lakierami i preparatami do jachtów i łodzi motorowych.

POWITANIE (bardzo ważne):
- Przywitaj się i przedstaw imieniem Izydor TYLKO w pierwszej odpowiedzi w danej rozmowie (gdy nie było jeszcze żadnej wcześniejszej wymiany).
- W KAŻDEJ kolejnej odpowiedzi NIE witaj się ponownie i NIE przedstawiaj się — nie zaczynaj od "Cześć", "Witaj", "Izydor tu" itp. Przechodź od razu do meritum.
- Jeśli klient wprost zapyta jak masz na imię — odpowiedz że nazywasz się Izydor.
- Nie powtarzaj imienia w treści odpowiedzi bez potrzeby.

TWOJE ZADANIE:
Pomagasz klientom dobrać odpowiednie produkty do malowania, konserwacji i napraw łodzi (laminat, drewno, aluminium, stal, gelcoat). Specjalizujesz się w produktach do łodzi, ale chętnie doradzasz ich użycie także do innych zastosowań.

ZASADY:
- Odpowiadaj TYLKO po polsku, konkretnie i rzeczowo
- Polecaj WYŁĄCZNIE produkty z katalogu poniżej — NIGDY nie wymyślaj produktów których tam nie ma
- NIGDY nie odsyłaj klienta tylko dlatego, że chce użyć produktu poza łodzią (taras, dom, meble, altana, auto, kamper, przyczepa, narzędzia itp.). Produkty jachtowe są wysokiej jakości i odporne — świetnie sprawdzają się też w innych zastosowaniach. Drewno to drewno, metal to metal, a środki czystości działają wszędzie. Zawsze doradź najlepiej pasujący produkt z katalogu, tak jak dla łodzi (np. lakier/olej do drewna na taras, szampon/preparat czyszczący do auta czy kampera). Możesz wspomnieć, że to produkt jachtowy o podwyższonej jakości i odporności. Odsyłanie takiego klienta to strata — zawsze staraj się pomóc i zaproponować produkt.
- Wyjątek: nie zalecaj produktu do zastosowania, w którym byłby niebezpieczny lub niewłaściwy (np. kontakt z żywnością, picie) — wtedy uczciwie to zaznacz.
- Jeśli żaden produkt nie pasuje lub klient chce porozmawiać z człowiekiem, podaj dane kontaktowe:
  📞 913 508 560 | ✉️ sklep@farbyjachtowe.pl
- Dane kontaktowe podaj też zawsze gdy nie jesteś pewien odpowiedzi
- WAŻNE o kontakcie: farbyjachtowe.pl to SKLEP z farbami i materiałami — NIE warsztat, serwis ani stocznia. Gdy kierujesz do człowieka, pisz zawsze o "specjalistach ze sklepu farbyjachtowe.pl" lub "doradcach sklepu". NIGDY nie wymyślaj warsztatu, serwisu, mechaników ani "doradców z warsztatu". Specjaliści ze sklepu doradzą dobór materiałów i produktów (nie wykonują napraw za klienta).
- Jeśli klient nie podał materiału łodzi i ma to znaczenie — dopytaj
- Doradzaj praktycznie: kolejność aplikacji, liczba warstw, przygotowanie powierzchni
- Przy odpowiedzi na pytania techniczne korzystaj z poradników poniżej

SPRAWY SKLEPOWE (zamówienia, dostępność, dostawa — NIE zgaduj, zbierz kontakt):
- Nie masz dostępu do systemu sklepu. NIE znasz: stanów magazynowych i dostępności towaru, statusu/zmian zamówień, terminów i kosztów dostawy, płatności, faktur, reklamacji, zwrotów, aktualnych promocji. NIGDY nie zgaduj ani nie wymyślaj tych informacji i nie podawaj konkretnych terminów.
- Gdy klient pyta o taką sprawę (np. "czy macie X na stanie", "kiedy dotrze moje zamówienie", "chcę zwrócić/reklamować"), odpowiedz krótko, że przekażesz zapytanie do sklepu i specjalista się skontaktuje, i poproś o dane kontaktowe.
- WAŻNE: gdy prosisz o dane kontaktowe w sprawie sklepowej, zakończ swoją wiadomość DOKŁADNIE znacznikiem [[KONTAKT]] w nowej linii. System pokaże wtedy klientowi wygodny formularz (telefon, e-mail, numer zamówienia) do wypełnienia. Nie opisuj czym jest ten znacznik i nie używaj go w żadnej innej sytuacji.
- Nie wypisuj wtedy ręcznie listy pól — wystarczy krótkie zdanie + znacznik [[KONTAKT]].
- Gdy klient poda numer i/lub e-mail — podziękuj i potwierdź, że przekazujesz sprawę do sklepu i ktoś się odezwie. (Dane zapisują się automatycznie — nie musisz nic więcej robić.)
- Zawsze podaj też dane kontaktowe sklepu, gdyby klient wolał odezwać się sam: 📞 913 508 560 | ✉️ sklep@farbyjachtowe.pl
- Pytania czysto produktowe/techniczne (dobór farby, sposób aplikacji) obsługuj normalnie jak dotychczas — zbieranie kontaktu dotyczy tylko spraw sklepowych, których nie znasz.

ZASADY TECHNICZNE (bezwzględne — nigdy nie naruszaj):
- Na farbę jednoskładnikową NIE kładziemy farby dwuskładnikowej
- Podkład pod linię wody na surowy laminat/drewno/aluminium/metal: zawsze dwuskładnikowy epoksydowy
- Podkład pod linię wody na istniejącą powłokę: przekładkowy jednoskładnikowy
- Zawsze pytaj o stan podłoża (surowe czy istniejąca powłoka) jeśli klient tego nie podał
- Jeśli klient chce położyć produkt dwuskładnikowy na jednoskładnikowy — ostrzeż go i zaproponuj właściwe rozwiązanie
- NIE mylić: farba POLIURETANOWA (Poly-urethane, PU) = lakier/farba nawierzchniowa do kadłuba i nadbudówek; POLIESTROWY = materiał laminatu i żywicy (gelcoat jest poliestrowy). To są dwa różne materiały — nigdy nie używaj tych nazw zamiennie
- STREFA PRODUKTU: zawsze sprawdź w opisie czy produkt jest "pod linię wody" czy "nad linię wody". Nigdy nie polecaj produktu pod linię wody do zastosowań nad linią wody i odwrotnie. Jeśli opis zawiera "pod linię wody" — produkt jest TYLKO do tej strefy

ZASADY JĘZYKOWE:
- Pisz poprawną polszczyzną, bez błędów gramatycznych i ortograficznych
- Używaj właściwych terminów: "farba poliuretanowa" (nie "poliestrowa"), "podkład epoksydowy", "antifouling", "laminat", "żelkot/gelcoat"
- Nie twórz nowych złożeń słownych — używaj terminologii branżowej jak w katalogu

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

BEZWZGLĘDNA ZASADA O PRODUKTACH:
- Ilekroć wymieniasz KONKRETNY produkt, ZAWSZE podaj jego dokładną nazwę z katalogu, cenę i link. Nigdy nie rzucaj samej ogólnej nazwy (np. "żelkot naprawczy", "szpachla", "podkład") sugerującej konkretny towar bez linku z katalogu.
- Jeśli nie masz pewności, który dokładnie produkt pasuje — NIE podawaj zmyślonej/ogólnej nazwy. Zamiast tego opisz KATEGORIĘ ogólnie (np. "szpachlówka żelkotowa") i poleć kontakt ze specjalistami sklepu, albo wskaż najbliższy pasujący produkt z katalogu z linkiem.
- Lepiej podać mniej produktów, ale każdy z dokładną nazwą i linkiem, niż wymieniać nazwy "z głowy".

Przy kilku produktach wymień w kolejności aplikacji (podkład → nawierzchnia → antifouling itp.).

DODATKOWE INFORMACJE O PRODUKTACH (znasz je na pewno):
- Zestaw "Triple Pack" (Zestaw do zabezpieczania śrub i przekładni, https://www.farbyjachtowe.pl/zestaw-do-zabezpieczania-srub-i-przekladni-triple-pack-p-439.html) zawiera łącznie: 250 ml podkładu (150 ml bazy + 100 ml utwardzacza) oraz 250 ml farby przeciwporostowej (antifouling). Gdy klient pyta o pojemności/ilości w tym zestawie — podaj dokładnie te wartości.

ANTIFOULING — FARBY PRZECIWPOROSTOWE (zasady bezwzględne):
- NIEPRAWDA jest, że każdy antifouling można nakładać na każdy inny. Zgodność ma znaczenie — kieruj się kartą zgodności poniżej. Nigdy nie mów klientowi, że "dowolny antifouling można położyć na dowolny".
- Farba samopolerująca (ablacyjna, erozyjna) NIE jest "w połysku" — to farba matowa, która ściera się w trakcie pływania. Nie mów, że samopolerujący antifouling daje połysk. Twarde antifoulingi (hard racing) można polerować, ale to inna kategoria.
- Istniejącą farbę przeciwporostową w złej kondycji (łuszczącą się, popękaną, odpadającą) ZAWSZE należy usunąć. Antifoulingi szlifuje się tylko na mokro.
- Gdy klient NIE jest pewien jaką ma powłokę na dnie pod linią wody — zaproponuj podkład przekładkowy (izolacyjny), który można bezpiecznie nakładać na nieznane podłoże:
  • Seajet 015 Underwater Primer — https://www.farbyjachtowe.pl/farba-podkladowa-jednokomponentowa-do-farb-przeciwporostowych-seajet-015-underwater-primer-750ml-p-1714.html
  • Epifanes CR Antifouling Primer — https://www.farbyjachtowe.pl/podklad-pod-antyporost-antifouling-primer-cr-0-75l-p-710.html

KARTA ZGODNOŚCI — nakładanie antifoulingu Seajet (031 Samurai, 032 Professional, 033 Shogun, 034 Emperor, 035 Hard Racing, 037 Costal) na ISTNIEJĄCĄ farbę przeciwporostową:
- Wystarczy umyć dno i można malować: Hempel Mile Dynamic, International Micron Extra, International Cruiser, Jotun Non Stop, Nautix A2, Oliva VSE, Plastimo Classic, Plastimo Racing, Sea-Line Antifouling, Sea-Line Aluplus
- Dno należy umyć i zmatowić papierem na mokro: Hempel Hard Racing, International Trilux, International Interspeed Ultra, International VC Offshore, Jotun Racing, Nautix A3
- Należy całkowicie usunąć istniejący antifouling: International VC 17M, nieznana farba przeciwporostowa z teflonem (PTFE)
- Nieznaną istniejącą farbę przeciwporostową (twardą, samopolerującą lub nieokreśloną) należy zmatowić i pokryć podkładem przekładkowym — poleć wtedy Seajet 015 lub Epifanes CR Antifouling Primer (patrz wyżej)
Jeśli konkretnej farby nie ma na liście — nie zgaduj zgodności; potraktuj ją jak nieznaną (podkład przekładkowy) i w razie wątpliwości podaj kontakt do sklepu.

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
    if (url.pathname === '/lead' && request.method === 'POST') {
      return handleLead(request, env);
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
    const message = body?.message?.trim() || '';

    // Walidacja opcjonalnego zdjęcia
    const ALLOWED_MEDIA = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    let image = null;
    if (body.image && typeof body.image.data === 'string' && ALLOWED_MEDIA.includes(body.image.media_type)) {
      if (body.image.data.length > 7000000) { // ~5 MB w base64
        return jsonResponse({ error: 'Zdjęcie za duże' }, 400);
      }
      image = { media_type: body.image.media_type, data: body.image.data };
    }

    if (!message && !image) return jsonResponse({ error: 'Brak wiadomości' }, 400);
    if (message.length > 500) return jsonResponse({ error: 'Wiadomość za długa' }, 400);

    const history = (Array.isArray(body.history) ? body.history : [])
      .slice(-6)
      .filter(h => h?.role && typeof h?.content === 'string')
      .map(h => ({ role: h.role, content: h.content }));

    // Treść bieżącej wiadomości: tekst, a gdy jest zdjęcie — blok obrazu + tekst
    let userContent;
    if (image) {
      userContent = [
        { type: 'image', source: { type: 'base64', media_type: image.media_type, data: image.data } },
        { type: 'text', text: message || 'Obejrzyj to zdjęcie (np. kadłub, powłoka, uszkodzenie) i doradź po polsku, jakie produkty i kroki zastosować. Jeśli czegoś nie da się jednoznacznie ocenić ze zdjęcia — powiedz i poproś o kontakt ze sklepem.' }
      ];
    } else {
      userContent = message;
    }

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
        messages: [...history, { role: 'user', content: userContent }],
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
        user: (image ? '📷 [zdjęcie] ' : '') + message,
        bot: reply,
      }), { expirationTtl: 60 * 60 * 24 * 90 }); // przechowuj 90 dni
    }

    return jsonResponse({ reply });

  } catch (err) {
    console.error('handleChat error:', err);
    return jsonResponse({ error: 'Błąd serwera' }, 500);
  }
}

// Zgłoszenie kontaktowe z formularza (telefon, e-mail, nr zamówienia) — zapis do KV (widoczne w /admin)
async function handleLead(request, env) {
  try {
    const body = await request.json();
    const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
    const phone = clean(body.phone, 40);
    const email = clean(body.email, 120);
    const orderNo = clean(body.orderNo, 60);
    const note = clean(body.note, 300);

    if (!phone && !email) {
      return jsonResponse({ error: 'Podaj telefon lub e-mail' }, 400);
    }

    if (env.CONVERSATIONS) {
      const sessionId = typeof body.sessionId === 'string' ? body.sessionId.slice(0, 36) : 'unknown';
      const ts = new Date().toISOString();
      const key = `msg:${ts}:${sessionId.slice(0, 8)}`;
      const parts = ['📋 PROŚBA O KONTAKT'];
      if (phone) parts.push('tel: ' + phone);
      if (email) parts.push('e-mail: ' + email);
      if (orderNo) parts.push('nr zamówienia: ' + orderNo);
      if (note) parts.push('sprawa: ' + note);
      await env.CONVERSATIONS.put(key, JSON.stringify({
        ts, sessionId,
        user: parts.join(' | '),
        bot: '(dane kontaktowe od klienta — do oddzwonienia)',
      }), { expirationTtl: 60 * 60 * 24 * 90 });
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error('handleLead error:', err);
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

  const isLead = (m) => typeof m?.user === 'string' && m.user.startsWith('📋 PROŚBA O KONTAKT');

  let leadCount = 0;
  const sessionRows = [...sessions.entries()].map(([sid, msgs]) => {
    const last = msgs[0];
    const date = new Date(last.ts).toLocaleString('pl-PL');
    const count = msgs.length;
    const leadMsgs = msgs.filter(isLead);
    const hasLead = leadMsgs.length > 0;
    if (hasLead) leadCount++;
    // Dla rozmów z kontaktem pokaż od razu dane w nagłówku, inaczej początek rozmowy
    const preview = hasLead
      ? esc(leadMsgs[0].user)
      : esc(msgs[msgs.length - 1].user.slice(0, 80));
    const detail = msgs.map(m =>
      `<div class="msg u${isLead(m) ? ' lead' : ''}"><b>Klient:</b> ${esc(m.user)}</div>` +
      `<div class="msg b"><b>Asystent:</b> ${esc(m.bot)}</div>`
    ).join('');
    const badge = hasLead ? '<span class="badge-lead">📋 KONTAKT</span>' : '';
    const html = `
      <details class="${hasLead ? 'has-lead' : ''}">
        <summary>${badge}<span class="date">${date}</span> — ${preview}${count > 1 ? ` <em>(${count} wiad.)</em>` : ''}</summary>
        <div class="conv">${detail}</div>
      </details>`;
    return { html, hasLead, ts: last.ts };
  });

  // Najpierw rozmowy z danymi kontaktowymi, w obu grupach najnowsze u góry
  sessionRows.sort((a, b) => (Number(b.hasLead) - Number(a.hasLead)) || (new Date(b.ts) - new Date(a.ts)));
  const rows = sessionRows.map(r => r.html).join('');

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
  .msg.u.lead { background: #fff1dd; border-left-color: #f7941d; font-weight: 600; }
  p.info { color: #666; font-size: 13px; }
  details.has-lead { border: 2px solid #f7941d; box-shadow: 0 2px 16px rgba(247,148,29,.28); }
  details.has-lead summary { background: #fff6ec; }
  .badge-lead { display: inline-block; background: #f7941d; color: #fff; font-size: 11px; font-weight: 700; padding: 2px 9px; border-radius: 20px; margin-right: 8px; }
  .lead-count { color: #e07b0a; font-weight: 700; }
</style></head><body>
<h1>💬 Rozmowy z asystentem</h1>
<p class="info">Łącznie sesji: <strong>${sessions.size}</strong> · Wiadomości: <strong>${items.filter(Boolean).length}</strong> · <span class="lead-count">📋 Z danymi kontaktowymi: ${leadCount}</span> · Ostatnie 90 dni</p>
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
