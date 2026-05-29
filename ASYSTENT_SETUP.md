# Asystent zakupowy — instrukcja wdrożenia

## Co to jest
Chat widget na stronie poradnika połączony z asystentem AI (Claude Haiku).
Asystent zna **cały katalog 803 produktów** farbyjachtowe.pl i doradza klientom.

## Jak to działa
```
Strona (widget)  →  Cloudflare Worker  →  Claude Haiku
   pytanie          (ukryty klucz API     odpowiedź z
   klienta           + katalog produktów)  polecanymi produktami
```
Katalog produktów jest wbudowany w plik `products.js` (wygenerowany z Twojego eksportu CSV).
Dzięki "prompt caching" katalog wczytuje się raz i kolejne pytania są tanie.

---

## Krok 1 — Konto Anthropic (Claude API)
1. Wejdź na https://console.anthropic.com
2. Załóż konto i dodaj dane rozliczeniowe (karta)
3. **Settings → API Keys → Create Key**
4. Skopiuj klucz (`sk-ant-...`) — zapisz bezpiecznie

**Koszt:** ok. **0,01–0,05 zł za rozmowę** (Haiku + cache katalogu).

## Krok 2 — Konto Cloudflare
Załóż darmowe konto na https://cloudflare.com

## Krok 3 — Narzędzia (jednorazowo)
Zainstaluj Node.js (https://nodejs.org), potem w terminalu:
```bash
npm install -g wrangler
wrangler login
```

## Krok 4 — Wdrożenie
W folderze projektu:
```bash
cd ścieżka/do/nowy-poradnik
wrangler deploy
```
Terminal pokaże URL Workera, np.
`https://asystent-farbyjachtowe.twojekonto.workers.dev`

## Krok 5 — Klucz API
```bash
wrangler secret put ANTHROPIC_API_KEY
```
Wklej klucz z Anthropic i Enter. Potem jeszcze raz `wrangler deploy`.

## Krok 6 — Podłącz widget do strony
W `index.html` znajdź:
```javascript
const CHAT_WORKER_URL = 'WORKER_URL_TUTAJ';
```
Zamień na URL Workera z Kroku 4:
```javascript
const CHAT_WORKER_URL = 'https://asystent-farbyjachtowe.twojekonto.workers.dev';
```

## Krok 7 — Sprawdź format linku wyszukiwarki (ważne!)
Asystent linkuje do produktów przez wyszukiwarkę sklepu.
1. Wejdź na farbyjachtowe.pl i wpisz cokolwiek w wyszukiwarkę
2. Zobacz adres URL wyników, np. `https://www.farbyjachtowe.pl/search.html?text=lakier`
3. W `worker.js` ustaw `SEARCH_URL` zgodnie z tym formatem ({q} = miejsce na zapytanie):
```javascript
const SEARCH_URL = 'https://www.farbyjachtowe.pl/search.html?text={q}';
```
Jeśli zmieniłeś — ponownie `wrangler deploy`.

---

## Gotowe! ✅

---

## Aktualizacja katalogu (gdy dodasz/usuniesz produkty)
1. Wyeksportuj nowy CSV z magazynu w panelu ShopGold
2. Przegeneruj `products.js` (poproś o to ponownie lub uruchom skrypt z README)
3. `wrangler deploy`

## Koszty miesięczne (szacunek)
| Usługa | Koszt |
|--------|-------|
| Cloudflare Workers | Darmowe (100 000 zapytań/dzień) |
| Claude Haiku API | ~0,02–0,05 zł/rozmowę |

Przy 100 rozmowach dziennie ≈ **2–5 zł/dzień**.

## Problemy?
- **Asystent "nie zna" nowego produktu** → zaktualizuj katalog (patrz wyżej) i `wrangler deploy`
- **Linki do produktów nie działają** → popraw `SEARCH_URL` w `worker.js` (Krok 7)
- **Widget pokazuje "nie jest skonfigurowany"** → uzupełnij `CHAT_WORKER_URL` w `index.html` (Krok 6)
