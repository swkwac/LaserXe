# Plan implementacji widoku Logowanie

## 1. Przegląd

Widok **Logowanie** jest bramą do aplikacji laserme 2.0a (LaserXe). Umożliwia uwierzytelnienie użytkownika klinicznego (lekarza) oraz wejście w tryb demo. Bez zalogowania użytkownik nie ma dostępu do planów klinicznych ani do głównego workflow (lista obrazów, szczegóły obrazu, maski, plan, animacja). Widok składa się z formularza (login, hasło), przycisku „Zaloguj”, przycisku/linku „Tryb demo” oraz obszaru na komunikaty błędów. Po udanym logowaniu użytkownik jest przekierowywany do listy obrazów (lub strony głównej aplikacji). Zgodnie z PRD i US-001 domyślne dane MVP to login **user**, hasło **123** (wyłącznie na potrzeby MVP/demo).

## 2. Routing widoku

- **Ścieżka główna:** `/login`
- **Ścieżka alternatywna (dla niezalogowanych):** `/` może przekierowywać na `/login`, jeśli aplikacja traktuje stronę główną jako logowanie dla użytkowników niezalogowanych.
- Widok powinien być dostępny bez uwierzytelnienia (publiczny). Po zalogowaniu middleware lub guard powinien przekierować użytkownika z `/login` na `/images` (lub `/`), aby uniknąć ponownego wyświetlania formularza.

## 3. Struktura komponentów

```
LoginPage (strona Astro)
  └── Layout
        └── LoginForm (komponent React, client:load)
              ├── Pole tekstowe: login
              ├── Pole tekstowe: hasło (type="password")
              ├── Przycisk: Zaloguj
              ├── Przycisk / Link: Tryb demo
              └── Obszar komunikatów błędów (Alert / tekst)
```

- **LoginPage** – strona Astro obsługująca trasę `/login`, używająca Layoutu i renderująca komponent React `LoginForm`.
- **LoginForm** – interaktywny komponent React (Shadcn/ui: Input, Label, Button, ewentualnie Alert) realizujący logikę formularza, wywołanie API i obsługę błędów.

## 4. Szczegóły komponentów

### LoginPage (strona Astro)

- **Opis:** Strona Astro odpowiadająca za trasę `/login`. Jej zadaniem jest wyświetlenie layoutu (nagłówek, stopka jeśli potrzebne) oraz osadzenie formularza logowania. Nie zawiera logiki biznesowej – tylko kompozycję i ewentualnie meta (title, opis).
- **Główne elementy:** `Layout.astro` (lub dedykowany layout dla logowania), slot z komponentem `LoginForm` z dyrektywą `client:load`, aby formularz był interaktywny od razu.
- **Obsługiwane interakcje:** Brak bezpośrednich zdarzeń na stronie; interakcje są w `LoginForm`.
- **Obsługiwana walidacja:** Brak walidacji po stronie strony Astro.
- **Typy:** Brak własnych typów; strona może przyjmować opcjonalne query params (np. `redirect`, `message`) do przekazania do `LoginForm`.
- **Propsy:** Opcjonalnie: `title` (np. „Logowanie – LaserXe”), `redirectUrl` (docelowy URL po logowaniu).

### LoginForm (komponent React)

- **Opis:** Formularz logowania z polami login i hasło, przyciskiem „Zaloguj” oraz przyciskiem/linkiem „Tryb demo”. Wykonuje żądanie `POST /api/auth/login`, obsługuje odpowiedzi 200, 401, 422 oraz błędy sieciowe. Po sukcesie zapisuje token/sesję (zgodnie z odpowiedzią API) i przekierowuje użytkownika. Tryb demo ustawia w sesji flagę `is_demo` (jeśli backend to obsługuje) lub nawiguje z parametrem (np. `?demo=1`) – do doprecyzowania z API.
- **Główne elementy:** `form` (element HTML), dwa pola `Input` (lub natywne `input` z etykietami) dla login i hasła, `Button` „Zaloguj”, `Button` lub `Link` „Tryb demo”, element na komunikaty błędów (`Alert` z Shadcn lub `p`/`div` z klasą błędu). Etykiety powiązane z polami (accessibility). Struktura: etykieta + pole + (opcjonalnie) hint dla MVP (np. „Dane demo: user / 123”).
- **Obsługiwane zdarzenia:** `onSubmit` formularza (preventDefault, wywołanie API), `onClick` „Tryb demo” (wywołanie endpointu demo lub nawigacja), zmiana pól (`onChange`) – sterowane komponentami (controlled).
- **Warunki walidacji:** Przed wysłaniem żądania: pola login i hasło niepuste (opcjonalna walidacja po stronie klienta; API i tak zwróci 422 przy pustych). Przycisk „Zaloguj” może być wyłączony (disabled), gdy `login.trim() === ''` lub `password === ''`. Podczas wysyłki (`isSubmitting`) przycisk Zaloguj w stanie loading i wyłączony, aby uniknąć podwójnego wysłania.
- **Typy:** `AuthLoginCommand` (request body: login, password), `AuthLoginResponseDto` (odpowiedź: token + user lub user), `AuthUserDto` (id, login). ViewModel lokalny: `{ login: string, password: string, errorMessage: string | null, isSubmitting: boolean }` (lub osobne useState).
- **Propsy:** Opcjonalne: `redirectUrl?: string` (docelowy URL po udanym logowaniu, np. `/images`), `onSuccess?: (user: AuthUserDto) => void` (callback po sukcesie, np. do aktualizacji kontekstu auth). Jeśli aplikacja używa kontekstu React dla użytkownika, `LoginForm` może wywołać callback lub zaktualizować kontekst po 200.

## 5. Typy

- **AuthLoginCommand** (już w `src/types.ts`): `{ login: string; password: string }` – body żądania POST /api/auth/login.
- **AuthLoginResponseDto**: `{ token: string; user: AuthUserDto } | { user: AuthUserDto }` – odpowiedź 200; przy tokenie frontend zapisuje token (np. w pamięci lub secure storage) i dołącza go do kolejnych żądań (np. nagłówek `Authorization: Bearer <token>`); przy sesji cookie backend ustawia `Set-Cookie`, przekierowanie wystarczy.
- **AuthUserDto**: `{ id: number; login: string }` – obiekt użytkownika w odpowiedzi.
- **ViewModel formularza (lokalny stan w LoginForm):**
  - `login: string` – wartość pola login.
  - `password: string` – wartość pola hasło.
  - `errorMessage: string | null` – komunikat błędu z API lub sieci (401, 422, network error).
  - `isSubmitting: boolean` – true podczas wysyłki żądania (blokada przycisku, ewentualny wskaźnik ładowania).

Żadne nowe typy globalne w `src/types.ts` nie są wymagane; wykorzystywane są istniejące DTO i Command.

## 6. Zarządzanie stanem

- **Stan lokalny w LoginForm:** Wystarczy stan komponentu React (`useState`) dla pól formularza (`login`, `password`), `errorMessage` oraz `isSubmitting`. Nie jest wymagany globalny store (Redux/Zustand) ani kontekst wyłącznie dla widoku logowania.
- **Po udanym logowaniu:** Jeśli aplikacja przechowuje użytkownika w kontekście (np. `AuthContext`), `LoginForm` po otrzymaniu 200 wywołuje `setUser(response.user)` (lub podobnie) i wykonuje przekierowanie. Token (jeśli zwrócony) zapisywany jest w wybranym miejscu (pamięć, sessionStorage, cookie) zgodnie z polityką bezpieczeństwa; kolejne żądania do `/api` dołączają token w nagłówku.
- **Opcjonalny hook:** `useLoginForm()` – custom hook zwracający `{ login, password, errorMessage, isSubmitting, setLogin, setPassword, handleSubmit, handleDemoClick }`. Ułatwia przeniesienie logiki z komponentu do hooka i ewentualne ponowne użycie lub testy. W minimalnej wersji logika może pozostać bezpośrednio w `LoginForm`.

## 7. Integracja API

- **Endpoint:** `POST /api/auth/login`
- **Typ żądania:** Body JSON zgodny z `AuthLoginCommand`: `{ "login": string, "password": string }`. Nagłówki: `Content-Type: application/json`. Przy sesji cookie: `credentials: 'include'` (jeśli API jest na innej domenie – CORS z credentials).
- **Typ odpowiedzi (200):** `AuthLoginResponseDto` – albo `{ "token": string, "user": AuthUserDto }`, albo `{ "user": AuthUserDto }` z ustawionym ciasteczkiem sesji. Frontend po 200: jeśli jest `token`, zapisuje go i ustawia w konfiguracji klienta HTTP (np. Axios default header); jeśli tylko `user`, uznaje że sesja jest w ciasteczku. Następnie przekierowuje na `redirectUrl` (np. `/images`) lub na stronę główną.
- **Błędy:**  
  - **401 Unauthorized:** Body np. `{ "detail": "Invalid login or password" }`. Frontend ustawia `errorMessage` na treść `detail` lub na stały komunikat „Nieprawidłowy login lub hasło” i wyświetla go w obszarze błędów.  
  - **422 Unprocessable Entity:** Błąd walidacji (brak pól, puste stringi). Frontend wyświetla `detail` z odpowiedzi lub komunikat „Wypełnij login i hasło”.  
  - **Błąd sieci / 5xx:** Ustawienie komunikatu typu „Błąd połączenia. Sprawdź sieć i spróbuj ponownie.” lub „Błąd serwera. Spróbuj później.”
- **Tryb demo:** Jeśli backend udostępnia endpoint typu `POST /api/auth/demo` (lub rozszerzenie loginu o parametr `is_demo`), frontend wywołuje go i po sukcesie przekierowuje (np. na `/images`) z ustawioną w sesji flagą `is_demo`. Jeśli taki endpoint nie istnieje, w planie należy udokumentować przycisk „Tryb demo” i nawigację z parametrem (np. `/images?demo=1`) z adnotacją, że pełna obsługa demo wymaga rozszerzenia API.

## 8. Interakcje użytkownika

- **Wprowadzanie loginu i hasła:** Pola są kontrolowane (controlled). Zmiana wartości aktualizuje stan (`login`, `password`). Etykiety powiązane z polami (id + htmlFor), obsługa Tab i Enter (Enter w formularzu wysyła formularz).
- **Kliknięcie „Zaloguj”:** Wywołanie `handleSubmit`: `preventDefault`, ustawienie `isSubmitting = true`, wyczyszczenie `errorMessage`, wysłanie `POST /api/auth/login` z body `{ login, password }`. Przy 200: zapis tokena/sesji, aktualizacja kontekstu użytkownika (jeśli jest), przekierowanie. Przy 401/422/5xx/sieć: ustawienie `errorMessage`, wyświetlenie komunikatu, `isSubmitting = false`.
- **Kliknięcie „Tryb demo”:** Wywołanie endpointu demo (jeśli dostępny) i przekierowanie z flagą demo; w przeciwnym razie nawigacja do `/images?demo=1` z adnotacją w dokumencacji. Przycisk/link wyraźnie oddzielony od głównego CTA (styl drugorzędny).
- **Dostępność:** Nawigacja klawiaturowa (Tab), powiązanie etykiet z polami, komunikat błędu powiązany z formularzem (aria-describedby lub role="alert").

## 9. Warunki i walidacja

- **Warunki po stronie API (kontrakt):** Login i hasło wymagane, niepuste; w przeciwnym razie 422. Nieprawidłowe dane logowania → 401.
- **Walidacja w komponencie:** Opcjonalnie przed wysłaniem: `login.trim() !== ''` i `password !== ''`. Jeśli nie – ustawienie `errorMessage` (np. „Wypełnij login i hasło”) bez wysyłania żądania lub wyłączenie przycisku „Zaloguj” gdy pola puste. Podczas `isSubmitting` przycisk „Zaloguj” jest wyłączony.
- **Wpływ na stan interfejsu:** Błąd 401/422/5xx ustawia `errorMessage` i wyświetla go pod formularzem; nie następuje przekierowanie. Sukces (200) czyści błąd, ustawia użytkownika/token i powoduje przekierowanie.

## 10. Obsługa błędów

- **401:** Wyświetlenie komunikatu z `detail` odpowiedzi lub stałego tekstu „Nieprawidłowy login lub hasło”. Brak przekierowania; użytkownik może poprawić dane i wysłać ponownie.
- **422:** Wyświetlenie komunikatu walidacji (np. z pola `detail` w formacie Pydantic) lub ogólnego „Wypełnij wszystkie pola poprawnie”.
- **404/500 / błąd sieci:** Komunikat „Błąd połączenia lub serwera. Spróbuj ponownie później.” (lub rozdzielenie: brak sieci vs 5xx w zależności od wymagań).
- **Timeout żądania:** Traktowanie jak błąd sieci; komunikat zachęcający do ponowienia próby.
- W każdym przypadku błędu: `isSubmitting` ustawiane z powrotem na `false`, aby użytkownik mógł ponowić logowanie.

## 11. Kroki implementacji

1. **Utworzenie trasy i strony Astro:** Dodać plik `src/pages/login.astro` (lub `src/pages/login/index.astro`) obsługujący ścieżkę `/login`. Użyć `Layout.astro`, ustawić tytuł strony (np. „Logowanie – LaserXe”) i osadzić placeholder pod formularz.
2. **Komponent LoginForm (React):** Utworzyć komponent w `src/components/` (np. `src/components/LoginForm.tsx` lub w podfolderze `auth`). Zaimplementować stan (login, password, errorMessage, isSubmitting), pola formularza z etykietami, przycisk „Zaloguj” i przycisk/link „Tryb demo”. Użyć komponentów UI z Shadcn (Input, Label, Button) zgodnie z projektem.
3. **Funkcja wysyłki:** Zaimplementować obsługę `onSubmit`: budowa body `AuthLoginCommand`, wywołanie `fetch` lub klienta HTTP (np. Axios) na `POST /api/auth/login` z `Content-Type: application/json` i `credentials: 'include'` jeśli używane są ciasteczka. Obsługa odpowiedzi: 200 (odczyt tokena/user, zapis, przekierowanie), 401 (ustawienie errorMessage), 422 (ustawienie errorMessage), inne (komunikat ogólny).
4. **Integracja z Astro:** W `login.astro` zaimportować `LoginForm` i wyrenderować go z dyrektywą `client:load`, aby formularz był hydratowany i interaktywny. Przekazać opcjonalne propsy (np. `redirectUrl="/images"`).
5. **Zapis tokena/sesji i przekierowanie:** Po 200: jeśli w odpowiedzi jest `token`, zapisać go (np. w sessionStorage lub w konfiguracji klienta API); zaktualizować globalny stan użytkownika (kontekst/store) jeśli istnieje; wykonać przekierowanie (np. `window.location.href = redirectUrl` lub router Astro/React).
6. **Tryb demo:** Zaimplementować obsługę kliknięcia „Tryb demo”: wywołanie endpointu demo (jeśli zdefiniowany w API) lub nawigacja z parametrem; udokumentować wymagany kontrakt API.
7. **Dostępność i UX:** Upewnić się, że etykiety są powiązane z polami (Label + id), komunikat błędu ma role="alert" lub aria-describedby, przycisk Zaloguj ma stan disabled podczas isSubmitting; opcjonalnie krótka informacja o danych demo (user/123) w formie hintu.
8. **Ochrona trasy:** W middleware lub guardzie aplikacji: jeśli użytkownik jest zalogowany i wchodzi na `/login`, przekierować go na `/images` (lub stronę główną). Jeśli nie jest zalogowany i wchodzi na chronione trasy (np. `/images`), przekierować na `/login`. Reakcja na 401 z API (np. globalny intercept): wylogowanie i przekierowanie na `/login` z komunikatem „Sesja wygasła”.
9. **Testy ręczne:** Sprawdzenie logowania z poprawnymi danymi (user/123), błędnymi danymi (401), pustymi polami (422), wyłączenia przycisku podczas wysyłki oraz działania Tryb demo (jeśli zaimplementowane).
10. **Dokumentacja:** Zaktualizować dokumentację routingu (np. w README lub .ai) o ścieżkę `/login` i zachowanie po logowaniu oraz trybie demo.
