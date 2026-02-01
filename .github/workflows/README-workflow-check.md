# Jak sprawdzić workflow CI/CD (PR verification)

## 1. Na GitHubie (główny sposób)

Workflow uruchamia się **tylko po wypchnięciu** do repozytorium na GitHubie.

### Krok A: Wypchnij zmiany

```powershell
git add .github/workflows/pullreqverification.yaml
git commit -m "ci: add PR verification workflow"
git push origin master
```

### Krok B: Otwórz zakładkę Actions

1. Wejdź na **GitHub** → Twoje repozytorium **LaserXe**.
2. Kliknij **Actions** (górny pasek).
3. Po lewej wybierz workflow **"PR verification"** (jeśli jest na liście).
4. Zobaczysz listę **uruchomień** (runs). Najnowsze będzie z Twojego `push` do `master`.

### Krok C: Sprawdź wynik

- **Zielony ptaszek** – wszystkie joby (Frontend, Backend, E2e) zakończyły się sukcesem.
- **Czerwony X** – któryś job się wywalił; kliknij run → kliknij job (np. "Frontend") i zobacz logi kroków.

### Test przez Pull Request

1. Utwórz branch: `git checkout -b test-ci`
2. Zrób małą zmianę (np. komentarz w pliku), commit, push: `git push origin test-ci`
3. Na GitHubie utwórz **Pull Request** z `test-ci` → `master`.
4. W PR zobaczysz sekcję **Checks** – tam uruchomi się "PR verification"; poczekaj na zielony/czerwony wynik.

---

## 2. Lokalnie – symulacja (bez GitHub Actions)

Możesz **ręcznie** odpalić te same polecenia co w workflow – to nie uruchomi samego Actions, ale sprawdzi, że skrypty się nie wywalą.

W **PowerShell** w katalogu projektu (LaserXe):

```powershell
# Frontend (lint, test, build)
npm ci
npm run lint
npm run test:run
npm run build
```

W drugim terminalu (lub po powrocie do głównego katalogu):

```powershell
# Backend (pytest)
cd backend
pip install -r requirements.txt
pytest -v
cd ..
```

E2E lokalnie (wymaga działającego backendu i frontendu – np. w osobnych terminalach `uvicorn` i `npm run dev` / `npm run preview`) – opcjonalnie:

```powershell
npx playwright install
npm run e2e
```

---

## 3. Walidacja YAML (opcjonalnie)

Sprawdzenie, czy plik workflow ma poprawną składnię YAML:

- **Online:** wklej zawartość `.github/workflows/pullreqverification.yaml` na [yamllint.com](https://www.yamllint.com/) lub podobny walidator.
- **W terminalu** (jeśli masz `yamllint` lub `actionlint`):
  - `yamllint .github/workflows/pullreqverification.yaml`
  - `actionlint .github/workflows/pullreqverification.yaml` (specjalnie pod GitHub Actions)

---

## Podsumowanie

| Sposób              | Co sprawdza                          | Kiedy użyć                    |
|--------------------|---------------------------------------|-------------------------------|
| **GitHub Actions** | Faktyczne uruchomienie na GitHubie    | Zawsze – to właściwy test CI  |
| **Lokalna symulacja** | Lint, testy, build, pytest          | Szybka weryfikacja przed push |
| **Walidacja YAML** | Składnia pliku workflow              | Przy edycji workflow          |

Żeby **naprawdę** sprawdzić CI/CD, zrób **push** (albo PR) i zobacz wynik w zakładce **Actions** na GitHubie.
