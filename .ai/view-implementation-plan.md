# API Endpoint Implementation Plan: POST /api/auth/login

## 1. Przegląd punktu końcowego
Endpoint służy do uwierzytelnienia użytkownika i zwrócenia sesji lub tokenu. Jest jedynym zasobem pod `/api`, który nie wymaga wcześniejszego uwierzytelnienia. Korzysta z tabeli `users`, porównując `login` i `password_hash`.

## 2. Szczegóły żądania
- Metoda HTTP: `POST`
- Struktura URL: `/api/auth/login`
- Parametry:
  - Wymagane: brak w URL lub query
  - Opcjonalne: brak
- Request Body (JSON):
  - `login`: string, wymagane, niepuste
  - `password`: string, wymagane, niepuste

## 3. Wykorzystywane typy
- DTO:
  - `AuthUserDto` (odpowiedź)
  - `AuthLoginResponseDto` (odpowiedź)
  - `UserEntityDto` (mapowanie rekordu z `users`)
- Command modele:
  - `AuthLoginCommand` (request body)

Wyjaśnienie dla osoby znającej Pythona: typy w `src/types.ts` to odpowiednik Pythonowych klas Pydantic/dataclasses używanych do walidacji i kontraktu API. Różnica jest taka, że w TypeScript są statyczne (kompilator), a w Pythonie walidacja dzieje się w runtime (np. Pydantic).

## 4. Szczegóły odpowiedzi
- **200 OK** (sukces):
  - Body (token lub cookie):
    - Token: `{ "token": "string", "user": { "id": number, "login": string } }`
    - Cookie: `{ "user": { "id": number, "login": string } }` + `Set-Cookie`
- **422 Unprocessable Entity**:
  - Nieprawidłowe dane wejściowe (brak pól, puste stringi, nie-JSON).
- **401 Unauthorized**:
  - Błędne dane logowania (login lub hasło).
- **500 Internal Server Error**:
  - Błędy nieoczekiwane (DB, hash, sesja).

## 5. Przepływ danych
1. Kontroler API odbiera `AuthLoginCommand`.
2. Walidacja wejścia (np. Pydantic w FastAPI) – odrzucenie pustych wartości.
3. Serwis uwierzytelnienia:
   - Pobiera użytkownika po `login` z tabeli `users`.
   - Porównuje `password` z `password_hash` (np. bcrypt/passlib).
4. Po sukcesie:
   - Generuje token lub tworzy sesję (cookie httpOnly).
5. Zwraca `AuthLoginResponseDto`.

## 6. Względy bezpieczeństwa
- Uwierzytelnienie: endpoint dostępny publicznie, pozostałe `/api` wymagają tokenu/sesji.
- Hash haseł: porównanie przez bibliotekę (bcrypt/passlib), nigdy plain-text.
- Brak rozróżnienia błędu login/hasło w odpowiedzi (jeden komunikat).
- Rate limiting dla prób logowania (ochrona brute-force).
- Ciasteczka: `httpOnly`, `secure`, `sameSite` + ochrona CSRF.
- Logowanie błędów: do logów aplikacji, bez zapisu w DB (brak tabeli błędów w MVP).

## 7. Obsługa błędów
- **422**: brak `login`/`password`, puste stringi, niepoprawny JSON.
- **401**: użytkownik nie istnieje lub hasło nie pasuje.
- **500**: błąd bazy, błąd haszowania, błąd ustawienia sesji/tokenu.

## 8. Rozważania dotyczące wydajności
- Indeks/unikalność na `users.login` (już w planie DB).
- Minimalna ilość danych zwracanych (tylko `id`, `login`).
- Opcjonalny cache na metadane użytkownika po udanym logowaniu (ostrożnie).

## 9. Etapy wdrożenia
1. Zdefiniuj schemat wejścia w backendzie (odpowiednik `AuthLoginCommand`).
2. Dodaj serwis `AuthService`:
   - `get_user_by_login(login)`
   - `verify_password(password, password_hash)`
   - `create_session_or_token(user)`
3. Utwórz handler `/api/auth/login`:
   - walidacja,
   - wywołanie serwisu,
   - mapowanie do `AuthLoginResponseDto`.
4. Dodaj middleware sprawdzające sesję/token dla innych endpointów `/api`.
5. Dodaj testy:
   - poprawne logowanie,
   - błędne dane,
   - brak pól.
6. Dodaj bezpieczne ustawienia cookie/tokenu (z konfiguracji środowiska).
*** End Patch أمر
