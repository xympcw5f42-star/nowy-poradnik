# Asystent zakupowy — instrukcja wdrożenia

## Jak to działa
```
Strona (widget)
     ↓ pytanie
Cloudflare Worker
     ↓ szukaj trafnych produktów
Cloudflare AI Search (beta)  ← crawluje farbyjachtowe.pl automatycznie
     ↓ fragmenty stron sklepu (opisy, ceny, linki)
Claude Haiku (Anthropic)
     ↓ odpowiedź po polsku
Strona (widget)
```

AI Search samo crawluje i indeksuje sklep — asystent zna pełne opisy produktów
i ceny ze strony, nie tylko nazwy. Indeks odświeża się automatycznie.

---

## Krok 1 — Konto Anthropic (Claude API)
1. Wejdź na https://console.anthropic.com
2. Załóż konto i dodaj kartę kredytową
3. **Settings → API Keys → Create Key**
4. Skopiuj klucz (`sk-ant-...`) — zapisz go bezpiecznie

**Koszt:** ok. 0,03–0,08 zł za rozmowę (Haiku, bez cache katalogu bo kontekst jest dynamiczny).

## Krok 2 — Konto Cloudflare
Załóż darmowe konto na https://cloudflare.com

## Krok 3 — Narzędzia (jednorazowo)
Zainstaluj Node.js (https://nodejs.org), potem:
```bash
npm install -g wrangler
wrangler login
```

## Krok 4 — Utwórz instancję AI Search
```bash
wrangler ai-search create
```
Kreator zapyta:
- **Name:** `farbyjachtowe`
- **Source:** `website`
- **URL:** `https://www.farbyjachtowe.pl`

Cloudflare zaczyna crawlować sklep automatycznie (10–30 min pierwsze indeksowanie).
Postęp: Cloudflare Dashboard → AI Search → farbyjachtowe → Status

## Krok 5 — Wdrożenie Workera
```bash
cd ścieżka/do/nowy-poradnik
wrangler deploy
```
Terminal pokaże URL, np.: `https://asystent-farbyjachtowe.twojekonto.workers.dev`

## Krok 6 — Klucz API
```bash
wrangler secret put ANTHROPIC_API_KEY
```
Wklej klucz z Anthropic i Enter. Potem ponownie:
```bash
wrangler deploy
```

## Krok 7 — Podłącz widget do strony
W `index.html` znajdź:
```javascript
const CHAT_WORKER_URL = 'WORKER_URL_TUTAJ';
```
Zamień na URL z Kroku 5:
```javascript
const CHAT_WORKER_URL = 'https://asystent-farbyjachtowe.twojekonto.workers.dev';
```

---

## Gotowe! ✅

---

## Koszty miesięczne (szacunek)
| Usługa | Koszt |
|--------|-------|
| Cloudflare Workers | Darmowe (100 000 req/dzień) |
| Cloudflare AI Search | **Darmowe w beta** |
| Claude Haiku API | ~0,03–0,08 zł/rozmowę |

Przy 100 rozmowach dziennie ≈ 3–8 zł/dzień za API Anthropic.

## Aktualizacja katalogu
AI Search odświeża indeks automatycznie gdy crawluje sklep ponownie.
Ręczne odświeżenie: Cloudflare Dashboard → AI Search → farbyjachtowe → Reindex

## Problemy?
- **Asystent nie zna produktu** → poczekaj aż skończy pierwsze indeksowanie (sprawdź Status)
- **Widget pokazuje "nie skonfigurowany"** → uzupełnij `CHAT_WORKER_URL` w `index.html`
- **Błąd 403 przy crawlowaniu** → sprawdź czy robots.txt sklepu pozwala na `User-agent: Cloudflare-AI-Search`

## Backup: katalog CSV
Plik `products.js` zawiera 803 produkty z eksportu CSV (tylko nazwy, bez opisów).
Możesz go użyć jeśli AI Search z jakiegoś powodu nie zadziała — opisane w worker.js.
