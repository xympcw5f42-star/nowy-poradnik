# Asystent zakupowy — instrukcja wdrożenia

## Co to jest
Chat widget na stronie poradnika połączony z asystentem AI (Claude Haiku).
Asystent zna cały katalog farbyjachtowe.pl i odpowiada na pytania klientów.

---

## Krok 1 — Konto Anthropic (Claude API)

1. Wejdź na https://console.anthropic.com
2. Załóż konto i uzupełnij dane rozliczeniowe (karta kredytowa)
3. Idź do **Settings → API Keys → Create Key**
4. Skopiuj klucz (zaczyna się od `sk-ant-...`) — zapisz go bezpiecznie

**Koszt:** płacisz tylko za faktyczne użycie. Model Haiku to ok. **0,01–0,05 zł za rozmowę**.

---

## Krok 2 — Konto Cloudflare

1. Wejdź na https://cloudflare.com i załóż darmowe konto
2. Nie musisz nic konfigurować na razie

---

## Krok 3 — Instalacja narzędzi (jednorazowo, na komputerze)

Potrzebujesz Node.js (https://nodejs.org) i terminala (PowerShell na Windows, Terminal na Mac).

```bash
npm install -g wrangler
wrangler login
```

Po `wrangler login` otworzy się przeglądarka — zaloguj się do Cloudflare.

---

## Krok 4 — Wejdź do folderu projektu

```bash
cd ścieżka/do/nowy-poradnik
```

---

## Krok 5 — Utwórz bazę wektorową

```bash
wrangler vectorize create produkty --dimensions=1024 --metric=cosine
```

---

## Krok 6 — Znajdź URL feedu XML w ShopGold

W panelu admina farbyjachtowe.pl:
- Idź do **Integracje → Porównywarki cen → Ceneo**
- Włącz eksport jeśli nie jest włączony
- Skopiuj URL pliku XML (np. `https://www.farbyjachtowe.pl/ceneo.xml`)

Otwórz plik `wrangler.toml` i w sekcji `[vars]` ustaw prawidłowy URL:
```toml
FEED_URL = "https://www.farbyjachtowe.pl/twoj-feed.xml"
```

---

## Krok 7 — Ustaw sekrety (klucze API)

```bash
wrangler secret put ANTHROPIC_API_KEY
```
Wklej klucz z konsoli Anthropic i wciśnij Enter.

```bash
wrangler secret put REINDEX_SECRET
```
Wpisz dowolne hasło (np. `mojeTajneHaslo2024`) — zapamiętaj je na później.

---

## Krok 8 — Wdróż Worker

```bash
wrangler deploy
```

Po wdrożeniu terminal pokaże URL Workera, np.:
`https://asystent-farbyjachtowe.twojekonto.workers.dev`

---

## Krok 9 — Pierwsze indeksowanie produktów

```bash
curl -X POST https://asystent-farbyjachtowe.twojekonto.workers.dev/reindex \
     -H "Authorization: Bearer mojeTajneHaslo2024"
```

Zastąp URL i hasło swoimi wartościami. Indeksowanie działa w tle — trwa kilka minut.
Możesz sprawdzić postęp w: https://dash.cloudflare.com → Workers → Twój Worker → Logs

---

## Krok 10 — Podłącz Widget do Strony

Otwórz `index.html` i znajdź linię:
```javascript
const CHAT_WORKER_URL = 'WORKER_URL_TUTAJ';
```

Zamień `WORKER_URL_TUTAJ` na URL Workera z Kroku 8:
```javascript
const CHAT_WORKER_URL = 'https://asystent-farbyjachtowe.twojekonto.workers.dev';
```

---

## Gotowe!

Asystent będzie:
- Odpowiadał na pytania klientów o produktach ze sklepu
- Automatycznie aktualizował katalog każdej nocy o 3:00
- Podawał linki do konkretnych produktów

---

## Koszty miesięczne (szacunek)

| Usługa | Koszt |
|--------|-------|
| Cloudflare Workers | Darmowe (100 000 req/dzień) |
| Cloudflare Vectorize | Darmowe (do 30 000 zapytań/miesiąc) |
| Cloudflare AI (embeddingi) | Darmowe (10 000 req neuronowych/dzień) |
| Claude Haiku API | ~0,02–0,05 zł/rozmowę |

Przy 100 rozmowach dziennie = ok. **2–5 zł/dzień** za API.

---

## Problemy?

- **Feed XML nie działa** → sprawdź URL w ShopGold admin; niektóre feedywymagają tokenu w URL
- **Asystent nie zna produktu** → uruchom reindex (Krok 9) po dodaniu nowych produktów
- **Błąd 401 na /reindex** → sprawdź czy REINDEX_SECRET się zgadza
