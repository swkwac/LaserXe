# Plan implementacji widoku Upload obrazu

## 1. Przegląd

Widok **Upload obrazu** umożliwia zalogowanemu użytkownikowi wgranie zdjęcia zmiany skórnej (PNG/JPG) oraz podanie szerokości zmiany w milimetrach (skala `width_mm`). Stanowi krok workflow po wejściu z Listy obrazów (przycisk „Dodaj obraz”). Może być zrealizowany jako **dedykowana strona** `/images/new` lub jako **modal** na stronie Lista obrazów; po udanym uploadzie zawsze następuje przekierowanie na **Szczegóły obrazu** z aktywną zakładką **Maski** (`/images/{id}?tab=masks`), aby użytkownik mógł od razu rysować maski (zgodnie z ui-plan i PRD). Walidacja w UI: tylko pliki PNG/JPG; pole `width_mm` – liczba dodatnia. API zwraca 201 z obiektem obrazu (`ImageDto`); błędy 400 (nieobsługiwany typ pliku), 422 (brak/invalid pola). Zgodnie z US-002 i US-003: system akceptuje PNG/JPG, obraz wyświetla się w obszarze roboczym (po przekierowaniu), skala jest zapisana, metryki w mm.

## 2. Routing widoku

- **Opcja A – strona:** Ścieżka `/images/new`. Strona Astro renderuje formularz uploadu; po sukcesie przekierowanie na `/images/{id}?tab=masks`.
- **Opcja B – modal:** Brak dedykowanej trasy; widok jest modalem otwieranym z Listy obrazów (np. przycisk „Dodaj obraz”). Po sukcesie: zamknięcie modalu i przekierowanie na `/images/{id}?tab=masks` (lub odświeżenie listy + przekierowanie).
- Widok wymaga uwierzytelnienia. Przy 401 (np. przy wysyłce) obsługa jak w pozostałych widokach (wylogowanie, przekierowanie na `/login`).

## 3. Struktura komponentów

```
[Opcja A – strona]
UploadImagePage (strona Astro: /images/new)
  └── Layout
        └── UploadImageForm (React, client:load)
              ├── Input file (akcept: image/png, image/jpeg)
              ├── Input number (width_mm)
              ├── Przycisk „Wgraj” / „Zapisz”
              ├── Podgląd pliku (opcjonalnie)
              └── Obszar komunikatów błędów

[Opcja B – modal]
ImagesListPage (lub Layout)
  └── UploadImageModal (React)
        └── UploadImageForm (jak wyżej) + przycisk Zamknij / overlay
```

- **UploadImagePage** (opcja A) – strona Astro dla `/images/new`, layout + komponent formularza.
- **UploadImageModal** (opcja B) – kontener modalu (Dialog z Shadcn): overlay, tytuł „Dodaj obraz”, slot na formularz, przycisk Zamknij. Otwierany z Listy obrazów.
- **UploadImageForm** – wspólny formularz React: pole pliku, pole `width_mm`, przycisk wysyłki, błędy. Logika wysyłki `POST /api/images` (multipart), przekierowanie po 201.

## 4. Szczegóły komponentów

### UploadImagePage (strona Astro, opcja A)

- **Opis:** Strona dla trasy `/images/new`. Wyświetla layout i formularz uploadu. Po udanym uploadzie przekierowanie realizuje komponent React (router lub `window.location`).
- **Główne elementy:** Layout, nagłówek (np. „Dodaj obraz”, link „Powrót do listy” → `/images`), slot z `UploadImageForm` (client:load).
- **Obsługiwane interakcje:** Brak bezpośrednich zdarzeń na stronie.
- **Walidacja:** Brak po stronie strony.
- **Typy:** Brak.
- **Propsy:** Opcjonalnie `title`.

### UploadImageModal (komponent React, opcja B)

- **Opis:** Modal (Dialog) zawierający formularz uploadu. Przyjmuje propsy `open` i `onOpenChange` (lub `onClose`). Po udanym uploadzie wywołuje `onSuccess?.(image)` i zamyka modal; przekierowanie na `/images/{id}?tab=masks` może być w rodzicu lub w formularzu.
- **Główne elementy:** `Dialog` (Shadcn), tytuł „Dodaj obraz”, zawartość = `UploadImageForm`, przycisk Zamknij (X lub „Anuluj”). Formularz wewnątrz modalu.
- **Obsługiwane zdarzenia:** Zamknięcie (onOpenChange(false), Escape, klik poza), przekazanie zdarzenia sukcesu z formularza do rodzica.
- **Walidacja:** Brak własnej; walidacja w formularzu.
- **Typy:** `ImageDto` (wynik przekazywany w onSuccess).
- **Propsy:** `open: boolean`, `onOpenChange: (open: boolean) => void` lub `onClose: () => void`; opcjonalnie `onSuccess?: (image: ImageDto) => void`.

### UploadImageForm (komponent React)

- **Opis:** Formularz z polem pliku (PNG/JPG) i polem numerycznym `width_mm`. Walidacja po stronie klienta: typ pliku (PNG, JPG), width_mm > 0. Przy wysyłce buduje `FormData` (file, width_mm), wysyła `POST /api/images` z `Content-Type: multipart/form-data`. Przy 201 odczytuje `ImageDto`, przekierowuje na `/images/{id}?tab=masks`. Przy 400/422/sieć ustawia komunikat błędu.
- **Główne elementy:** `form`, `input type="file"` (accept="image/png,image/jpeg" lub .png,.jpg), `input type="number"` (width_mm, min > 0, step np. 0.1), przycisk „Wgraj” / „Zapisz”, opcjonalnie podgląd wybranego pliku (img z Object URL), obszar błędów (Alert lub tekst).
- **Obsługiwane zdarzenia:** `onSubmit` (preventDefault, walidacja, wysyłka), `onChange` pliku (aktualizacja stanu, opcjonalnie podgląd), `onChange` width_mm (controlled). Przycisk wyłączony podczas `isSubmitting`.
- **Warunki walidacji:**  
  - Plik: wymagany; dozwolone typy MIME image/png, image/jpeg (lub rozszerzenia .png, .jpg). W UI: accept="image/png, image/jpeg". Przed wysyłką: sprawdzenie, że wybrano plik i że typ jest dozwolony (file.type lub nazwa).  
  - width_mm: wymagane, liczba, > 0. W UI: min="0.1" (lub dowolna minimalna wartość), step="0.1" lub "1". Przed wysyłką: parseFloat, sprawdzenie > 0.  
  - Przy 400 z API (nieobsługiwany typ): wyświetlenie komunikatu z API (np. „Tylko PNG i JPG są dozwolone”).  
  - Przy 422: wyświetlenie szczegółów walidacji (np. brak pliku, nieprawidłowe width_mm).
- **Typy:** `ImageUploadCommand` (file: File, width_mm: number); odpowiedź 201: `ImageDto`. Stan lokalny: `file: File | null`, `width_mm: string` (lub number), `errorMessage: string | null`, `isSubmitting: boolean`; opcjonalnie `previewUrl: string | null` (Object URL dla podglądu).
- **Propsy:** Opcjonalnie: `onSuccess?: (image: ImageDto) => void` (wywołane po 201, przed przekierowaniem – np. do zamknięcia modalu); `redirectToDetail?: boolean` (domyślnie true – przekierowanie na `/images/{id}?tab=masks`).

## 5. Typy

- **ImageUploadCommand** (już w `src/types.ts`): `{ file: File; width_mm: number }` – dane do wysyłki. W requestcie używane jako pola multipart: `file` (plik), `width_mm` (liczba jako string w FormData lub number – backend może przyjmować oba).
- **ImageDto** (odpowiedź 201): `ImageEntityDto` – `{ id, storage_path, width_mm, created_by, created_at }`. Po 201 frontend zapisuje `id` i wykonuje przekierowanie na `/images/${id}?tab=masks`.
- **ViewModel formularza (stan w UploadImageForm):**  
  - `file: File | null` – wybrany plik;  
  - `width_mm: string` (lub number) – wartość pola (string ułatwia kontrolę pustego pola przed parsowaniem);  
  - `errorMessage: string | null` – błąd z API lub walidacji;  
  - `isSubmitting: boolean` – blokada przycisku podczas wysyłki;  
  - opcjonalnie `previewUrl: string | null` – URL.createObjectURL(file) do podglądu; przy odmontowaniu revokeObjectURL.

Nowe typy globalne w `src/types.ts` nie są wymagane.

## 6. Zarządzanie stanem

- **Stan lokalny w UploadImageForm:** Wystarczy `useState` dla file, width_mm, errorMessage, isSubmitting (i ewentualnie previewUrl). Brak globalnego storeu.
- **Po udanym uploadzie (201):** Wywołanie `onSuccess?.(response)` (np. dla modalu – zamknięcie), następnie przekierowanie: `window.location.href = \`/images/${response.id}?tab=masks\`` lub router nawigacji (Astro/React). Nie trzeba zapisywać obrazu w store – Szczegóły obrazu pobiorą dane przez GET /api/images/{id}.
- **Opcjonalny hook:** `useUploadImageForm()` – zwraca stan i handlery (handleFileChange, handleWidthChange, handleSubmit, reset). Ułatwia testy i ponowne użycie w modalu i na stronie.

## 7. Integracja API

- **Endpoint:** `POST /api/images`
- **Typ żądania:** `multipart/form-data`. Pola:  
  - `file` – plik (File);  
  - `width_mm` – liczba (w FormData zwykle jako string, np. `formData.append('width_mm', String(width_mm))`).  
  Nie ustawiać ręcznie `Content-Type: multipart/form-data` – przeglądarka ustawi z boundary.
- **Nagłówki:** Sesja (cookie) lub `Authorization: Bearer <token>`. `credentials: 'include'` przy cross-origin.
- **Odpowiedź 201:** Body: `ImageDto` – `{ id, storage_path, width_mm, created_by, created_at }`. Frontend: zapisać `id`, wywołać onSuccess jeśli jest, przekierować na `/images/${id}?tab=masks`.
- **Błędy:**  
  - **400:** Body np. `{ "detail": "Only PNG and JPG are allowed" }`. Ustawić errorMessage na treść detail lub stały komunikat po polsku.  
  - **422:** Błąd walidacji (brak pliku, brak width_mm, nieprawidłowa wartość). Wyświetlić detail z odpowiedzi (Pydantic zwraca strukturę z polami).  
  - **401:** Obsługa globalna (wylogowanie, przekierowanie na login).  
  - **Sieć / 5xx:** Komunikat „Błąd połączenia. Spróbuj ponownie.”, isSubmitting = false.

## 8. Interakcje użytkownika

- **Wybór pliku:** Użytkownik klika pole pliku lub obszar „Przeciągnij i upuść” (opcjonalnie). Wybór pliku aktualizuje stan (file); opcjonalnie generowany jest podgląd (Object URL). Walidacja typu po wyborze (PNG/JPG) – przy nieprawidłowym typie komunikat i ewentualne wyczyszczenie wyboru.
- **Wprowadzenie width_mm:** Pole numeryczne (controlled). Walidacja na bieżąco lub przy submit: wartość > 0.
- **Kliknięcie „Wgraj”:** Walidacja (plik wybrany, typ OK, width_mm > 0). Przy błędzie – errorMessage, bez wysyłki. Przy OK: isSubmitting = true, errorMessage = null, budowa FormData, POST /api/images. Przy 201: przekierowanie. Przy błędzie: errorMessage, isSubmitting = false.
- **Zamknięcie modalu (opcja B):** Przycisk „Anuluj” lub „Zamknij”, Escape, klik poza – onOpenChange(false). Opcjonalnie ostrzeżenie przy niezapisanych zmianach (plik wybrany, nie wysłany).
- **Dostępność:** Etykiety dla pola pliku i width_mm, powiązanie z polami (htmlFor, id). Komunikat błędu z role="alert". Przycisk „Wgraj” z aria-busy podczas ładowania.

## 9. Warunki i walidacja

- **API:** Wymaga pliku PNG lub JPG; width_mm (liczba, w praktyce > 0). 400 przy nieobsługiwanym typie; 422 przy braku/invalid polach.
- **Frontend – przed wysyłką:**  
  - Plik: wymagany, typ w (image/png, image/jpeg).  
  - width_mm: wymagane, parseFloat > 0.  
  Przy niespełnieniu: ustawienie errorMessage (np. „Wybierz plik PNG lub JPG” / „Podaj szerokość zmiany w mm (liczba większa od 0)”), brak wysyłki.
- **Wpływ na UI:** Błąd wyświetlany pod formularzem; przy 201 – przekierowanie (brak komunikatu sukcesu na stronie, bo użytkownik trafia od razu na Szczegóły obrazu).

## 10. Obsługa błędów

- **400 (nieobsługiwany typ):** Komunikat z `detail` lub „Tylko pliki PNG i JPG są dozwolone”. isSubmitting = false.
- **422 (walidacja):** Odczyt struktury błędu (np. Pydantic: `detail` jako lista z `loc` i `msg`). Wyświetlenie zrozumiałego komunikatu (np. „Podaj szerokość zmiany w mm”, „Plik jest wymagany”). isSubmitting = false.
- **401:** Globalna obsługa – wylogowanie, przekierowanie na /login.
- **Błąd sieci / timeout / 5xx:** „Błąd połączenia lub serwera. Spróbuj ponownie.” isSubmitting = false.
- **Podgląd (Object URL):** Przy odmontowaniu komponentu lub przy zmianie pliku wywołać `URL.revokeObjectURL(previewUrl)`, aby uniknąć wycieku pamięci.

## 11. Kroki implementacji

1. **Decyzja: strona vs modal.** Wybrać opcję A (strona `/images/new`) lub B (modal na Liście obrazów). W zależności od wyboru: utworzyć `src/pages/images/new.astro` (opcja A) lub tylko komponent `UploadImageModal` + formularz (opcja B).
2. **Komponent UploadImageForm:** Utworzyć `src/components/upload/UploadImageForm.tsx` (lub `src/components/UploadImageForm.tsx`). Stan: file, width_mm, errorMessage, isSubmitting, opcjonalnie previewUrl. Pola: input file (accept="image/png, image/jpeg"), input number (width_mm, min, step). Przycisk „Wgraj”. handleSubmit: walidacja, FormData (append 'file', file; append 'width_mm', width_mm), fetch POST /api/images bez ręcznego Content-Type. Przy 201: onSuccess?.(data), redirect do `/images/${data.id}?tab=masks`. Przy błędzie: setErrorMessage, setSubmitting(false).
3. **Walidacja kliencka:** Przed fetch: sprawdzenie file (istnieje, file.type w ['image/png','image/jpeg']), width_mm = parseFloat; if (!(width_mm > 0)) pokazać błąd i return.
4. **Opcja A – strona:** W `src/pages/images/new.astro` użyć Layout, tytuł „Dodaj obraz”, link „Powrót do listy” (/images), osadzić UploadImageForm (client:load). Middleware: strona /images/new wymaga auth; przy braku sesji przekierowanie na /login.
5. **Opcja B – modal:** Utworzyć `UploadImageModal.tsx`. Użyć Dialog (Shadcn), propsy open, onOpenChange. W środku UploadImageForm z onSuccess: onSuccess(image) → onOpenChange(false); przekierowanie w onSuccess lub w rodzicu. Na Liście obrazów: stan openModal, przycisk „Dodaj obraz” ustawia openModal=true, render <UploadImageModal open={openModal} onOpenChange={setOpenModal} onSuccess={(img) => { setOpenModal(false); navigate(`/images/${img.id}?tab=masks`); }} />.
6. **Podgląd pliku (opcjonalnie):** W UploadImageForm po wyborze pliku: previewUrl = URL.createObjectURL(file), wyświetlić <img src={previewUrl} alt="Podgląd" />. W useEffect cleanup lub przy zmianie pliku: revokeObjectURL(previousPreviewUrl).
7. **Przekierowanie po sukcesie:** W formularzu po 201: `window.location.href = \`/images/${data.id}?tab=masks\`` (działa wszędzie) lub użycie routera aplikacji (np. Astro view transitions lub React Router, jeśli jest).
8. **Komunikaty błędów API:** Parsowanie 422: jeśli body.detail jest tablicą, wyciągnąć pierwszy msg lub złożyć tekst z pól; jeśli body.detail jest stringiem, wyświetlić go. 400: body.detail jako string.
9. **Testy ręczne:** Upload poprawnego PNG/JPG z width_mm > 0 → przekierowanie na Szczegóły obrazu, zakładka Maski. Plik innego typu → 400, komunikat. Puste pole width_mm lub 0 → 422. Anulowanie modalu (opcja B). Dostępność: etykiety, focus, komunikat błędu.
10. **Dokumentacja:** Zaktualizować listę widoków: Upload obrazu – zrealizowany jako strona lub modal; po uploadzie przekierowanie na `/images/{id}?tab=masks`. Uwzględnić w planie widoku „Szczegóły obrazu” (zakładki 4–7), że wejście z uploadu otwiera zakładkę Maski.
