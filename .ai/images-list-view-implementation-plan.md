# Plan implementacji widoku Lista obrazów

## 1. Przegląd

Widok **Lista obrazów** umożliwia zalogowanemu użytkownikowi przeglądanie swoich obrazów zmian skórnych, wybór obrazu do edycji (przejście do Szczegóły obrazu) oraz inicjację uploadu nowego obrazu („Dodaj obraz”). Stanowi pierwszy ekran po zalogowaniu (opcjonalnie dostępny także pod `/`). Wyświetlane są tylko obrazy należące do bieżącego użytkownika (`created_by`); API filtruje je po stronie serwera. Widok zawiera listę lub siatkę kart obrazów (miniatura, skala width_mm, data utworzenia), paginację, przycisk „Dodaj obraz” oraz pusty stan, gdy użytkownik nie ma jeszcze żadnych obrazów. Zgodnie z US-002 i mapą podróży: po kliknięciu w obraz użytkownik przechodzi do Szczegóły obrazu; po kliknięciu „Dodaj obraz” uruchamiany jest flow Upload (modal lub strona `/images/new`).

## 2. Routing widoku

- **Ścieżka główna:** `/images`
- **Ścieżka alternatywna:** `/` po zalogowaniu może wyświetlać ten sam widok (lista obrazów) lub przekierowywać na `/images`.
- Widok wymaga uwierzytelnienia. Przy braku sesji/tokenu middleware przekierowuje na `/login`. Przy odpowiedzi 401 z API (np. przy pobieraniu listy) aplikacja wylogowuje użytkownika i przekierowuje na logowanie z komunikatem „Sesja wygasła”.

## 3. Struktura komponentów

```
ImagesListPage (strona Astro)
  └── Layout (nagłówek: Wyloguj, tytuł)
        └── ImagesList (komponent React, client:load)
              ├── Toolbar (przycisk „Dodaj obraz”)
              ├── ImagesGrid lub ImagesList (lista/siatka kart)
              │     └── ImageCard (× N) — miniatura, width_mm, data, akcja „Otwórz”
              ├── Pagination (strona, rozmiar strony, total)
              └── EmptyState (gdy items.length === 0)
```

- **ImagesListPage** – strona Astro dla `/images`, layout z nagłówkiem (Wyloguj, ewentualnie breadcrumb), osadza komponent React `ImagesList`.
- **ImagesList** – kontener React: pobiera dane z API, zarządza paginacją i stanem (lista, loading, błąd), renderuje toolbar, siatkę kart, paginację i pusty stan.
- **ImageCard** – karta pojedynczego obrazu: miniatura (lub placeholder), width_mm, created_at, przycisk/link „Otwórz” → `/images/{id}`.
- **Pagination** – komponent nawigacji stron (page, page_size, total); przyciski/select zmiany strony i ewentualnie rozmiaru strony.
- **EmptyState** – komunikat „Brak obrazów – wgraj pierwszy” z przyciskiem/linkiem do uploadu.

## 4. Szczegóły komponentów

### ImagesListPage (strona Astro)

- **Opis:** Strona obsługująca trasę `/images`. Renderuje layout (nagłówek z Wyloguj, tytuł „Obrazy” lub „Lista obrazów”) oraz komponent listy. Nie zawiera logiki pobierania danych – to robi `ImagesList`.
- **Główne elementy:** `Layout.astro`, nagłówek (opcjonalnie z linkiem Wyloguj prowadzącym do wylogowania i przekierowania na `/login`), slot z `ImagesList` (client:load).
- **Obsługiwane interakcje:** Brak bezpośrednich zdarzeń; nawigacja Wyloguj może być w layoutcie lub w komponencie React.
- **Walidacja:** Brak.
- **Typy:** Brak własnych typów.
- **Propsy:** Opcjonalnie `title` dla strony.

### ImagesList (komponent React)

- **Opis:** Główny komponent widoku. Przy montowaniu i przy zmianie parametrów paginacji/sortowania wywołuje `GET /api/images` z query (page, page_size, sort, order). Przechowuje stan: items, total, page, page_size, loading, errorMessage. Renderuje toolbar z przyciskiem „Dodaj obraz”, siatkę kart (`ImageCard`), paginację i pusty stan. Przycisk „Dodaj obraz” otwiera modal uploadu lub nawiguje do `/images/new` (zgodnie z decyzją UX).
- **Główne elementy:** `div` lub `section`, toolbar (Button „Dodaj obraz”), kontener siatki (grid/flex) z `ImageCard`, komponent `Pagination`, komponent `EmptyState`, obszar na błąd (Alert) i stan ładowania (skeleton lub spinner).
- **Obsługiwane zdarzenia:** Zmiana strony lub rozmiaru strony (onPageChange, onPageSizeChange) → ponowne żądanie API z nowymi parametrami. Kliknięcie „Dodaj obraz” → otwarcie modalu lub nawigacja. Reakcja na 401 → callback wylogowania / przekierowanie (można w globalnym interceptorze).
- **Walidacja:** Brak walidacji formularzy; parametry query (page ≥ 1, page_size 1–100) są walidowane przez API. Frontend może ograniczyć page_size do sensownych wartości (np. 20, 50, 100).
- **Typy:** `ImageDto`, `ImageListResponseDto`, `ImageListQueryCommand`. Stan wewnętrzny: `{ items: ImageDto[], total: number, page: number, page_size: number, loading: boolean, errorMessage: string | null }`.
- **Propsy:** Opcjonalnie: `initialPage?: number`, `initialPageSize?: number` (np. z query string); `onLogout?: () => void`; `uploadPath?: string` (np. `/images/new` lub null dla modalu).

### ImageCard (komponent React)

- **Opis:** Karta jednego obrazu z listy. Wyświetla miniatura (obraz z URL lub placeholder), skala width_mm, data utworzenia (created_at w czytelnym formacie). Kliknięcie w kartę lub przycisk „Otwórz” prowadzi do `/images/{id}` (Szczegóły obrazu). Miniatura: jeśli backend udostępnia URL do pliku (np. endpoint GET /api/images/{id}/file lub URL z storage_path), użyć go jako `src`; w przeciwnym razie placeholder (ikona obrazu, tekst „Obraz”).
- **Główne elementy:** `article` lub `div` (karta), `img` (miniatura lub placeholder), teksty: width_mm (np. „Szerokość: 20 mm”), data (sformatowana), przycisk lub link „Otwórz” (href=`/images/${id}`).
- **Obsługiwane zdarzenia:** `onClick` karty lub linku → nawigacja do `/images/{id}`. Opcjonalnie: menu kontekstowe (Usuń) – jeśli w scope MVP.
- **Walidacja:** Brak; wyświetlane dane pochodzą z API.
- **Typy:** `ImageDto` (id, storage_path, width_mm, created_by, created_at).
- **Propsy:** `image: ImageDto`; opcjonalnie `imageUrl?: string` (gotowy URL do miniatury, jeśli generowany przez rodzica); `onClick?: (id: number) => void` (alternatywa dla linku).

### Pagination (komponent React)

- **Opis:** Nawigacja paginacji: aktualna strona, liczba stron (z total i page_size), przyciski Poprzednia / Następna lub numery stron; opcjonalnie select rozmiaru strony (10, 20, 50, 100). Emituje zdarzenia zmiany page i page_size.
- **Główne elementy:** przyciski lub linki „Poprzednia”, „Następna”, ewentualnie numery stron; opcjonalnie Select (page_size).
- **Obsługiwane zdarzenia:** onPageChange(page), onPageSizeChange(page_size).
- **Walidacja:** Nie przechodzić poniżej strony 1 ani powyżej max strony (Math.ceil(total / page_size)).
- **Typy:** Wymaga: page (number), page_size (number), total (number). Opcjonalnie maxVisiblePages.
- **Propsy:** `page: number`, `page_size: number`, `total: number`, `onPageChange: (page: number) => void`, `onPageSizeChange?: (page_size: number) => void`.

### EmptyState (komponent React)

- **Opis:** Wyświetlany, gdy `items.length === 0` i nie ma błędu (np. użytkownik nie ma jeszcze obrazów). Komunikat zachęcający do uploadu oraz przycisk/link „Dodaj obraz”.
- **Główne elementy:** ikona lub ilustracja, tekst (np. „Brak obrazów – wgraj pierwszy”), przycisk/link „Dodaj obraz”.
- **Obsługiwane zdarzenia:** onClick „Dodaj obraz” → to samo co w toolbarze (modal lub nawigacja).
- **Walidacja:** Brak.
- **Typy:** Brak.
- **Propsy:** `onAddImage?: () => void` lub brak (link z href).

## 5. Typy

- **ImageDto** (już w `src/types.ts`): `ImageEntityDto` – `{ id, storage_path, width_mm, created_by, created_at }`.
- **ImageListResponseDto**: `PagedResultDto<ImageDto>` – `{ items: ImageDto[], total: number, page: number, page_size: number }`.
- **ImageListQueryCommand**: `{ page?: number, page_size?: number, sort?: "created_at" | "id", order?: "asc" | "desc" }` – parametry query do GET /api/images.
- **ViewModel listy (stan w ImagesList):**  
  - `items: ImageDto[]` – lista z odpowiedzi;  
  - `total: number`, `page: number`, `page_size: number` – paginacja;  
  - `loading: boolean` – stan ładowania;  
  - `errorMessage: string | null` – komunikat błędu (401, 404, sieć).

Nie są wymagane nowe typy globalne w `src/types.ts`; wykorzystywane są istniejące DTO i Command.

**Uwaga o miniaturach:** API zwraca `storage_path` (np. `"uploads/xxx.png"`). Aby wyświetlić miniatura, frontend potrzebuje URL do pliku. Możliwe opcje: (1) backend udostępnia endpoint np. `GET /api/images/{id}/file` zwracający plik; (2) aplikacja serwuje pliki statyczne z katalogu odpowiadającego `storage_path`; (3) placeholder bez miniatury w MVP. W planie przyjąć opcję zależną od backendu i w komponencie obsłużyć brak URL (placeholder).

## 6. Zarządzanie stanem

- **Stan w ImagesList:** Wystarczy lokalny stan React: `items`, `total`, `page`, `page_size`, `loading`, `errorMessage`. Przy zmianie `page` lub `page_size` (np. z Pagination) wykonywane jest ponowne żądanie GET /api/images z aktualnymi parametrami.
- **Query string (opcjonalnie):** Stan paginacji można zsynchronizować z URL (np. `/images?page=2&page_size=20`), aby odświeżenie strony i „wstecz” zachowywały kontekst. Wymaga odczytu query w Astro/React i zapisu przy zmianie strony.
- **Brak globalnego storeu** dla listy obrazów w MVP; po wejściu w Szczegóły obrazu dane pojedynczego obrazu są pobierane na stronie szczegółów.
- **Opcjonalny hook:** `useImagesList(query: ImageListQueryCommand)` – zwraca `{ items, total, page, page_size, loading, error, setPage, setPageSize, refetch }`. Ułatwia wyniesienie logiki pobierania i testy.

## 7. Integracja API

- **Endpoint:** `GET /api/images`
- **Query:** `ImageListQueryCommand` – `page` (domyślnie 1), `page_size` (domyślnie 20, max 100), `sort` (created_at | id), `order` (asc | desc). Wszystkie parametry opcjonalne.
- **Nagłówki:** Sesja (cookie) lub `Authorization: Bearer <token>` – zgodnie z implementacją auth w aplikacji. `credentials: 'include'` przy cross-origin.
- **Odpowiedź 200:** `ImageListResponseDto` – `{ items: ImageDto[], total, page, page_size }`. Frontend zapisuje wynik w stanie, renderuje karty i paginację.
- **Błędy:**  
  - **401 Unauthorized:** Brak lub nieprawidłowa sesja. Globalny interceptor powinien wylogować i przekierować na `/login` z komunikatem „Sesja wygasła”. W komponencie można dodatkowo wyświetlić komunikat.  
  - **Błąd sieci / 5xx:** Ustawienie `errorMessage` i wyświetlenie (np. „Błąd ładowania listy. Spróbuj ponownie.”) z przyciskiem „Odśwież”.
- **Miniatura:** Jeśli backend udostępnia dostęp do pliku obrazu (np. `GET /api/images/{id}/file` lub URL bazowy + storage_path), użyć go w `ImageCard` jako `src` dla `img`. W przeciwnym razie wyświetlać placeholder.

## 8. Interakcje użytkownika

- **Kliknięcie w kartę obrazu / „Otwórz”:** Nawigacja do `/images/{id}` (Szczegóły obrazu). Implementacja: link `<a href={/images/${image.id}}>` lub `router.push()` / `window.location`.
- **Zmiana strony (Pagination):** Wywołanie `setPage(newPage)` lub aktualizacja query → ponowne żądanie GET /api/images z `page=newPage`. Przycisk „Następna” nieaktywny, gdy `page * page_size >= total`.
- **Zmiana rozmiaru strony (opcjonalnie):** Select page_size → żądanie z `page=1` i nowym `page_size` (reset do pierwszej strony).
- **Kliknięcie „Dodaj obraz”:** Otwarcie modalu uploadu (jeśli wybrano modal) lub nawigacja do `/images/new`. Po udanym uploadzie w modalu: zamknięcie modalu, odświeżenie listy (refetch) lub przekierowanie na `/images/{newId}` (zgodnie z ui-plan: po uploadzie przekierowanie na Szczegóły obrazu, zakładka Maski – wtedy refetch listy może nie być konieczny przy powrocie).
- **Wylogowanie (nagłówek):** Kliknięcie „Wyloguj” → wywołanie POST /api/auth/logout (jeśli cookie) lub usunięcie tokena + przekierowanie na `/login`.
- **Dostępność:** Nawigacja klawiaturowa po kartach i przyciskach (Tab); karty jako linki mają czytelny tekst (np. „Otwórz obraz, 20 mm, 30.01.2026”); paginacja z etykietami (aria-label).

## 9. Warunki i walidacja

- **API:** Zwraca tylko obrazy `created_by` = bieżący użytkownik. Parametry query: page ≥ 1, page_size 1–100; sort: created_at | id; order: asc | desc.
- **Frontend:** Przed wysłaniem żądania można znormalizować page (≥ 1) i page_size (np. 10, 20, 50, 100). Przy pustej liście (`items.length === 0` i total === 0) wyświetlić EmptyState zamiast pustej siatki. Przy błędzie (401, 5xx) wyświetlić komunikat i opcję odświeżenia; 401 obsłużyć globalnie (wylogowanie).

## 10. Obsługa błędów

- **401:** Przekierowanie na `/login` z komunikatem „Sesja wygasła” (np. w globalnym interceptorze odpowiedzi). Na stronie listy można pokazać krótki komunikat przed przekierowaniem.
- **Błąd sieci / timeout / 5xx:** Ustawienie `errorMessage`, wyświetlenie Alertu z tekstem i przyciskiem „Odśwież” (refetch). Stan loading = false.
- **Pusta lista (200, items.length === 0):** Nie błąd – wyświetlenie EmptyState.
- **404:** Dla GET /api/images raczej nie występuje; gdyby użytkownik wszedł na nieprawidłowy query, API zwraca 200 z pustą listą. Obsługa 404 pozostaje dla innych widoków (np. Szczegóły obrazu).

## 11. Kroki implementacji

1. **Trasa i strona Astro:** Utworzyć `src/pages/images/index.astro` (ścieżka `/images`). Użyć Layout z nagłówkiem (tytuł „Obrazy”, link Wyloguj). Osadzić komponent `ImagesList` z dyrektywą `client:load`.
2. **Komponent ImagesList:** Utworzyć `src/components/images/ImagesList.tsx` (lub w `src/components/`). Zaimplementować stan (items, total, page, page_size, loading, errorMessage) oraz efekt pobierania danych (useEffect z zależnościami page, page_size, sort, order). Wywołać GET /api/images z query; przy 200 ustawić items, total, page, page_size; przy błędzie ustawić errorMessage. Renderować: przy loading – skeleton lub spinner; przy error – Alert + przycisk Odśwież; przy items.length === 0 – EmptyState; w przeciwnym razie siatkę ImageCard + Pagination. Toolbar z przyciskiem „Dodaj obraz”.
3. **Komponent ImageCard:** Utworzyć `src/components/images/ImageCard.tsx`. Przyjmuje `image: ImageDto`. Wyświetla miniatura (img z URL lub placeholder), width_mm, sformatowaną datę created_at, link do `/images/${image.id}` z tekstem „Otwórz”. Opcjonalnie: budowa URL miniatury (np. z konfiguracji API base URL + endpoint pliku).
4. **Komponent Pagination:** Utworzyć lub użyć komponentu z Shadcn (jeśli dostępny) lub własny. Props: page, page_size, total, onPageChange, opcjonalnie onPageSizeChange. Przyciski Poprzednia/Następna; wyłączenie gdy page === 1 lub page >= lastPage.
5. **Komponent EmptyState:** Prosty blok z ikoną/tekstem „Brak obrazów – wgraj pierwszy” oraz przyciskiem/linkiem „Dodaj obraz” (ta sama akcja co w toolbarze).
6. **Integracja „Dodaj obraz”:** Zdecydować: modal (formularz uploadu w modalu) czy strona `/images/new`. W tym kroku dodać nawigację do `/images/new` lub otwarcie modalu; sam flow uploadu realizowany w osobnym widoku (Upload) – w tym planie tylko inicjacja.
7. **Synchronizacja z URL (opcjonalnie):** Odczytywać page (i page_size) z query string w ImagesList; przy zmianie strony aktualizować URL (history.pushState lub router). Przy wejściu na `/images?page=2` załadować drugą stronę.
8. **Obsługa 401:** W kliencie HTTP (fetch wrapper lub Axios) dodać interceptor: przy 401 wywołać callback wylogowania (usunięcie tokena/sesji) i przekierowanie na `/login?message=session_expired` (lub odpowiedni komunikat). Upewnić się, że ImagesList po refetch nie blokuje UI podczas przekierowania.
9. **Wylogowanie w nagłówku:** W Layout lub w osobnym komponencie nagłówka dodać przycisk „Wyloguj” (POST /api/auth/logout lub usunięcie tokena + redirect na /login). Na stronie /images nagłówek może być częścią Layout lub przekazany do ImagesList.
10. **Testy ręczne:** Sprawdzenie ładowania listy (z danymi i bez), paginacji, pustego stanu, błędu sieci, przekierowania po 401, nawigacji do Szczegóły obrazu po kliknięciu w kartę, działania przycisku „Dodaj obraz”.
11. **Dokumentacja:** Zaktualizować listę widoków w dokumentacji (.ai lub README): widok Lista obrazów zaimplementowany według planu; pozostałe widoki (Upload, Szczegóły obrazu – zakładki) – osobne plany.
