# Dokument wymagań produktu (PRD) – laserme 2.0a

**Wersja dokumentu:** 1.0  
**Data:** 2026-01-30  
**Status:** MVP (Minimum Viable Product)

---

## 0. Słownik pojęć (Glossary)

| Pojęcie | Definicja |
|--------|-----------|
| **Apertura** | Okrągłe pole zabiegowe o średnicy ok. 25 mm; odniesienie do filtrowania małych masek (procent powierzchni maski względem apertury). |
| **Union mask** | Jedna logiczna maska powstała z połączenia wszystkich zaakceptowanych masek użytkownika (po odrzuceniu masek &lt;3% apertury). |
| **Spot** | Pojedynczy impuls laserowy; w modelu – okrąg o stałej średnicy (parametr techniczny, np. 300 µm), bez nakładania się na inne spoty. |
| **% pokrycia** | Procent powierzchni maski (lub danej maski w trybie wielomaskowym) pokrytej sumą pól spotów; zakres w MVP: 3–20%. |
| **Overlap** | Nakładanie się pól spotów; w MVP niedopuszczalne (dopuszczalne tylko stykanie się granic). |
| **Iteracja** | Jedna wersja planu zabiegowego; każda zmiana parametru wejściowego tworzy nową iterację (z parent_id). |
| **Globalny punkt odniesienia** | Punkt w 2D (mm) używany do wyznaczania średnic siatki; z fallbackiem, gdy wypadnie poza maską. |
| **Średnica (w kontekście siatki)** | Linia przechodząca przez środek pola zabiegowego, obrócona o kąt theta; punkty leżą wzdłuż takich średnic, co 5°. |
| **Sekwencja emisji** | Kolejność spotów zgodna z kinematyką: ruch liniowy wzdłuż średnicy → krok obrotowy (np. 5°) → kolejna średnica; maski przeplatane. |
| **Tryb demo** | Wersja z watermarkiem, bez możliwości akceptacji klinicznej; do testów i prezentacji. |
| **Tryb debug/advanced** | Widok zaawansowany (np. siatka, logi); dostępny tylko poza wersją kliniczną (flaga środowiskowa). |

---

## 1. Przegląd produktu

Produkt **laserme 2.0a** jest kliniczno-technicznym modułem planowania emisji spotów zabiegowych na podstawie obrazu zmiany skórnej. System stanowi jeden z kluczowych komponentów większej platformy terapeutycznej, której docelowym celem jest sterowanie urządzeniem emitującym impulsy laserowe poprzez układ mechaniczny (**oś liniowa + oś obrotowa**).

W wersji MVP produkt realizuje **zamknięty, liniowy workflow**: od wgrania zdjęcia zmiany skórnej, przez zdefiniowanie skali i maski obszaru zabiegowego, po wygenerowanie siatki spotów oraz ich sekwencji emisji prezentowanej w formie animacji poglądowej. Wynikiem jest **plan zabiegowy**, który może zostać zaakceptowany klinicznie lub odrzucony i wygenerowany ponownie w kolejnej iteracji.

System jest projektowany z myślą o **przyszłej certyfikacji medycznej**, dlatego od początku uwzględnia pełne logowanie, wersjonowanie iteracji oraz deterministyczność algorytmów.

**Źródła wymagań:** niniejszy PRD, plik „tipy do prd.txt” (decyzje i rekomendacje), folder „examples” (algorytm, formaty CSV, przykłady masek i animacji).

## 2. Problem użytkownika
Lekarz wykonujący zabieg laserowy musi dziś ręcznie lub półautomatycznie planować rozmieszczenie impulsów zabiegowych, co:
- jest czasochłonne,
- obarczone ryzykiem nierównomiernego pokrycia,
- utrudnia powtarzalność zabiegów,
- nie daje jednoznacznej wizualnej walidacji planu przed zabiegiem.

Dodatkowo, w przypadku bardziej złożonych zmian skórnych (nieregularny kształt, wiele obszarów), brak jest narzędzi umożliwiających precyzyjne zaplanowanie sekwencji ruchu urządzenia w sposób zgodny z jego kinematyką.

laserme 2.0a rozwiązuje ten problem poprzez:
- formalne, matematyczne planowanie siatki spotów,
- wizualną symulację sekwencji emisji,
- walidację poprawności planu przed jego kliniczną akceptacją.

### 2.1. Kontekst kinematyki (z examples / algorytmu)

Siatka **nie jest rastrem w układzie XY** (kartezjańskim), lecz oparta jest na dwóch osiach:
- **Oś liniowa** – ruch wózka (carriage) wzdłuż linii przechodzącej przez środek pola zabiegowego; wzdłuż tej linii następuje emisja spotów.
- **Oś obrotowa** – obrót o stały kąt (w MVP: **5°**), optymalizacja pod kątem ograniczeń silnika obrotowego (wolniejszy, większe obciążenie).

**Sekwencja ruchu:** ruch liniowy (emisja wzdłuż linii) → krok obrotowy (np. 5°) → ruch liniowy z powrotem (emisja) → obrót → itd. Kierunek obrotu: **zgodnie z ruchem wskazówek zegara**. Wózek startuje po stronie prawej; kierunek ruchu liniowego na początku: od prawej do lewej, potem dostosowany do aktualnego kąta obrotu.

---

## 3. Wymagania funkcjonalne
3.1. Wejście danych
- System umożliwia upload obrazu (PNG/JPG) przedstawiającego zmianę skórną.
- Użytkownik ręcznie podaje skalę obrazu poprzez określenie szerokości zmiany w milimetrach.

3.2. Maski obszaru zabiegowego
- Użytkownik może rysować **jedną lub wiele masek** w postaci edytowalnych wielokątów (np. różne kolory: biała, zielona, niebieska – dla czytelności wykresu).
- Maski o powierzchni **mniejszej niż 3% apertury** są automatycznie odrzucane.
- **Tryb pojedynczej maski:** pozostałe maski można traktować jako union mask z jednym % pokrycia.
- **Tryb wielomaskowy (rozszerzenie):** każda maska może mieć **osobny % pokrycia** (np. 20% / 10% / 5%); punkty generowane są per maska, sekwencja emisji **przeplata** punkty z wszystkich masek (zgodnie z examples: zmiana skórna 5, 7, 8).

3.3. Parametry planowania
- Użytkownik definiuje docelowy **procent pokrycia** obszaru maski (zakres **3–20%**); w trybie wielomaskowym – osobno dla każdej maski.
- **Średnica spotu** jest parametrem technicznym systemu (nieedytowalnym w MVP; np. 300 µm).

3.4. Generacja siatki spotów
- Punkty generowane są bez overlapu; dopuszczalne jest stykanie się granic spotów.
- Rozmieszczenie punktów jest możliwie równomierne.
- Punkty generowane są wzdłuż globalnych średnic oddalonych co 5°.
- Globalny punkt odniesienia wyznaczany jest w 2D (mm), z mechanizmem fallback.

3.5. Planowanie sekwencji emisji
- Kolejność emisji odpowiada ruchowi mechanicznemu: **ruch liniowy wzdłuż średnicy** (emisja spotów) → **krok obrotowy** (np. 5°) → kolejna średnica; kierunek obrotu **zgodnie z ruchem wskazówek zegara**.
- Punkty z różnych masek są **przeplatane** w jednej sekwencji (np. na danej średnicy: najpierw punkty z maski A, potem B, potem C – zgodnie z położeniem geometrycznym).
- Sekwencja jest deterministyczna dla tych samych danych wejściowych.

3.6. Walidacja i komunikaty
- System wykrywa overlap oraz punkty poza maską.
- Jeśli >5% punktów narusza reguły, plan jest blokowany, a system proponuje korekty.
- Raportowane jest osiągnięte vs. zadane pokrycie.

3.7. Wizualizacja
- **Overlay punktów** na obrazie zmiany skórnej (z odpowiednią przezroczystością obrazu dla czytelności).
- **Gradient kolejności emisji** (np. kolor punktu zależny od indeksu w sekwencji).
- **Wykres / siatka:** widoczne osie (x, y) oraz linie średnic co 5° (np. linie przerywane), aby widać było, że punkty leżą wzdłuż tych osi; bez niepotrzebnych linii łączących punkty (mogą pogarszać czytelność).
- **Animacja sekwencji** (play/pause/reset), poglądowa:
  - Czerwona kropka reprezentuje wózek z głowicą laserową; ruch **płynny**, bez skoków (symulacja realistycznego ruchu).
  - W momencie emisji: krótkie zatrzymanie + „flash” (wizualne podświetlenie emisji).
  - Obrót (zmiana kąta) zajmuje czas – nie jest natychmiastowy.
  - Domyślna długość animacji np. 5 s (parametr konfigurowalny poza MVP).
- **Podsumowanie liczbowe** i **legenda** (np. kolory masek, zakres gradientu).
- W trybie wielomaskowym: wykres z różnymi maskami i ich spotami **łatwo rozróżnialnymi** (czytelna legenda, kolory).

3.8. Iteracje i akceptacja
- Akceptacja planu blokuje go jako finalny.
- Zmiana dowolnego parametru generuje nową iterację.
- Iteracje są wersjonowane (iteration_id, parent_id).

3.9. Eksport i logowanie
- Eksport obrazu z overlayem (PNG/JPG).
- Eksport danych strukturalnych (JSON).
- Logowanie wszystkich iteracji, parametrów i fallbacków.

3.10. Tryby systemowe
- Tryb demo z watermarkiem i bez możliwości akceptacji klinicznej.
- Tryb debug/advanced dostępny wyłącznie poza wersją kliniczną.

## 4. Granice produktu
- MVP nie obejmuje automatycznej segmentacji zmian skórnych.
- MVP nie steruje rzeczywistym urządzeniem ani silnikami.
- Animacja nie jest odwzorowaniem czasu rzeczywistego.
- Brak integracji z systemami HIS/EMR.
- Brak formalnej walidacji regulacyjnej (CE/MDR) w MVP.

## 5. Historyjki użytkowników

US-001
Tytuł: Uwierzytelnienie użytkownika klinicznego
Opis: Jako lekarz chcę zalogować się do systemu, aby mieć dostęp do funkcji klinicznych.
Kryteria akceptacji:
- Dostęp do aplikacji jest chroniony **ekranem logowania**; bez zalogowania użytkownik nie ma dostępu do planów klinicznych ani do głównego workflow.
- Poprawne dane logowania umożliwiają dostęp.
- **Domyślne dane logowania w MVP:** login: **user**, hasło: **123** (wyłącznie na potrzeby MVP/demo; przed wdrożeniem produkcyjnym należy zmienić hasło lub wdrożyć silniejsze uwierzytelnienie).

US-002
Tytuł: Upload obrazu zmiany skórnej
Opis: Jako lekarz chcę wgrać zdjęcie zmiany skórnej, aby rozpocząć planowanie.
Kryteria akceptacji:
- System akceptuje PNG/JPG.
- Obraz wyświetla się w obszarze roboczym.

US-003
Tytuł: Definicja skali obrazu
Opis: Jako lekarz chcę podać szerokość zmiany w mm, aby system mógł skalować obliczenia.
Kryteria akceptacji:
- Skala jest zapisana.
- Wszystkie metryki są liczone w mm.

US-004
Tytuł: Rysowanie maski
Opis: Jako lekarz chcę narysować maskę obszaru zabiegowego.
Kryteria akceptacji:
- Maska jest edytowalna.
- Można dodać wiele masek.

US-005
Tytuł: Filtrowanie małych masek
Opis: Jako system chcę odrzucać maski <3% apertury.
Kryteria akceptacji:
- Maski <3% nie są uwzględniane.

US-006
Tytuł: Ustawienie procentu pokrycia
Opis: Jako lekarz chcę ustawić % pokrycia obszaru.
Kryteria akceptacji:
- Zakres 3–20%.
- Zmiana powoduje przeliczenie planu.

US-007
Tytuł: Generacja siatki spotów
Opis: Jako lekarz chcę wygenerować siatkę spotów zgodnie z parametrami.
Kryteria akceptacji:
- Brak overlapu.
- ≥95% punktów w masce.

US-008
Tytuł: Walidacja planu
Opis: Jako lekarz chcę wiedzieć, czy plan jest poprawny klinicznie.
Kryteria akceptacji:
- System zgłasza błędy.
- Plan z błędami nie może być zaakceptowany.

US-009
Tytuł: Animacja sekwencji emisji
Opis: Jako lekarz chcę zobaczyć animację kolejności emisji.
Kryteria akceptacji:
- Dostępne play/pause/reset.

US-010
Tytuł: Akceptacja planu
Opis: Jako lekarz chcę zaakceptować poprawny plan.
Kryteria akceptacji:
- Plan zostaje zablokowany.

US-011
Tytuł: Iteracja planu
Opis: Jako lekarz chcę zmienić parametry i wygenerować nową wersję.
Kryteria akceptacji:
- Tworzona jest nowa iteracja.
- Historia jest zachowana.

US-012
Tytuł: Eksport wyników
Opis: Jako lekarz chcę wyeksportować plan.
Kryteria akceptacji:
- Dostępny PNG/JPG i JSON.

US-013
Tytuł: Tryb demo
Opis: Jako użytkownik chcę przetestować system bez ryzyka klinicznego.
Kryteria akceptacji:
- Watermark.
- Brak akceptacji planu.

## 6. Metryki sukcesu
- **≥95%** punktów wewnątrz maski.
- **0%** overlapu spotów.
- Różnica między **zadanym a osiągniętym pokryciem** raportowana (transparentność).
- **Deterministyczne** wyniki dla tych samych danych wejściowych.
- Pozytywna ocena **czytelności wizualizacji** przez lekarzy.

---

## 7. Decyzje projektowe (z tipy do prd)

1. Docelowym użytkownikiem systemu jest **lekarz**; produkt ma charakter kliniczno-techniczny.
2. MVP realizuje **liniowy flow:** upload obrazu → podanie skali (szerokość zmiany w mm) → rysowanie maski → generacja siatki → animacja → akceptacja / nowa iteracja.
3. **% pokrycia** definiowany przez użytkownika (3–20%) oznacza procent powierzchni maski pokrytej sumą pól spotów.
4. Spoty **nie mogą się nakładać**; dopuszczalne jest **stykanie się granic**; rozmieszczenie ma być możliwie **równomierne**.
5. **Średnica spotu** jest stała i traktowana jako parametr techniczny urządzenia (powiązany z powierzchnią kliniczną spotu w mm²).
6. Użytkownik **ręcznie rysuje maskę** w postaci edytowalnego wielokąta; w przyszłości możliwa automatyczna segmentacja.
7. Obsługiwane są **wiele masek**; filtrowane są maski &lt;3% apertury; pozostałe mogą tworzyć union mask lub (w trybie wielomaskowym) mieć osobny % pokrycia.
8. Punkty generowane są **per maska**, ale **wzdłuż globalnych średnic** oddalonych co 5°, wspólnych dla całego pola zabiegowego.
9. **Globalny punkt odniesienia** liczony jest w 2D w mm po skalowaniu; przewidziany **fallback**, jeśli wypada poza maską.
10. **Kolejność emisji** odpowiada ruchowi mechaniki: ruch liniowy wzdłuż średnicy → krok obrotowy → kolejna średnica; maski są **przeplatane**.
11. Animacja w MVP jest **poglądowa** (sekwencja, nie czas rzeczywisty) z kontrolami play/pause/reset.
12. UI prezentuje overlay punktów, legendę/wykres oraz krótkie **podsumowanie liczbowe** przed akceptacją.
13. **Kryteria blokujące:** &gt;5% punktów poza maską lub overlap; w takich przypadkach system **proponuje korektę**.
14. **Akceptacja planu** powoduje jego **zablokowanie** (final/locked); dalsze zmiany tworzą **nową iterację**.
15. Każda **zmiana parametru wejściowego** powoduje **pełne przeliczenie** downstream, z zachowaniem historii iteracji.
16. **Logowanie** obejmuje wszystkie iteracje (accepted/rejected), parametry wejściowe, metryki i fallbacki.
17. **Eksport** w MVP: obraz z overlayem (PNG/JPG) oraz dane strukturalne (JSON, CSV).
18. **Wersjonowanie iteracji:** iteration_id, parent_id.
19. **Tryb demo:** dane przykładowe, watermark, **bez** możliwości akceptacji klinicznej.
20. **Tryb debug/advanced** istnieje wyłącznie poza wersją kliniczną (flaga środowiskowa).

---

## 8. Rekomendacje (z tipy do prd)

1. **Jednoznaczna definicja matematyczna** % pokrycia i zasad braku overlapu (dokumentacja techniczna).
2. **Wydzielenie parametrów sprzętowych** (średnica spotu, krok obrotowy 5°) jako jawnych, ale niekoniecznie edytowalnych w MVP.
3. **Separacja etapów:** generacja punktów vs. planowanie kolejności emisji (modułowość).
4. **Przeliczanie wszystkich metryk** w jednostkach rzeczywistych (mm, mm²).
5. **Transparentne komunikaty** o degradacji jakości (coverage osiągnięte vs. zadane).
6. **Globalna, spójna semantyka wizualna** (kolory masek, gradient kolejności).
7. **Stabilny kontrakt wejścia/wyjścia:** obraz + parametry → punkty + animacja + metadane (CSV/JSON).
8. **Logowanie i wersjonowanie** jako fundament pod walidację i certyfikację.
9. **Pełna invalidacja downstream** przy zmianach wejściowych (brak częściowego „patchowania”).
10. **Wczesne uwzględnienie** trybu demo i debug w PRD (zrealizowane).

---

## 9. Specyfikacja danych i eksportu (na podstawie examples)

### 9.1. Eksport sekwencji emisji – CSV (pojedyncza maska / union)

Format pliku: **CSV**, nagłówek w pierwszej linii. Kolumny:

| Kolumna   | Typ     | Opis |
|-----------|--------|------|
| `index`   | int    | Kolejny numer punktu w sekwencji emisji (0-based). |
| `theta_deg` | float | Kąt obrotu w stopniach (0, 5, 10, …). |
| `t_mm`    | float | Pozycja wzdłuż osi liniowej w mm (w układzie średnicy). |
| `x_mm`    | float | Współrzędna X w mm (układ kartezjański obrazu). |
| `y_mm`    | float | Współrzędna Y w mm (układ kartezjański obrazu). |

Przykład (fragment): `examples/zmiana skorna 6/lesion6_theta5deg_motion_20mmwidth.csv`.

### 9.2. Eksport sekwencji emisji – CSV (wiele masek, różne % pokrycia)

Rozszerzenie dla **wielomaskowego** planu. Dodatkowe kolumny:

| Kolumna        | Typ   | Opis |
|----------------|-------|------|
| `mask`         | string | Identyfikator maski (np. kolor: `white`, `blue`, `green`). |
| `component_id` | int  | Numer składowej/obszaru danej maski (np. 1, 2). |
| `theta_k`      | int  | Indeks kąta (0, 1, 2, … dla 0°, 5°, 10°, …). |

Przykład: `examples/zmiana skorna 8/v1/lesion8_triplemask_theta5deg_motion_20mm_multicomp.csv`.

### 9.3. Eksport danych strukturalnych – JSON (MVP)

Struktura JSON powinna obejmować m.in.:

- **Metadane:** wersja formatu, iteration_id, parent_id, data wygenerowania, parametry wejściowe (skala mm, % pokrycia, średnica spotu, krok kąta).
- **Maski:** lista wielokątów (współrzędne w mm lub pikselach + skala).
- **Punkty:** lista spotów (x_mm, y_mm, theta_deg, t_mm, index w sekwencji; opcjonalnie mask_id / component_id).
- **Metryki:** osiągnięte vs. zadane pokrycie, liczba punktów, liczba punktów poza maską / overlap (jeśli 0, to brak naruszeń).
- **Walidacja:** flaga plan_valid, komunikaty błędów (jeśli plan zablokowany).

Szczegółowy schema JSON – w osobnym dokumencie technicznym (np. OpenAPI / JSON Schema).

---

## 10. Wymagania niefunkcjonalne (NFR)

- **Deterministyczność:** dla tych samych danych wejściowych (obraz, skala, maski, parametry) wynik (siatka, sekwencja) musi być identyczny.
- **Wydajność:** generacja siatki i sekwencji w czasie akceptowalnym dla użytkownika (&lt; kilkanaście sekund dla typowego rozmiaru obrazu i liczby punktów).
- **Skalowalność obrazu:** obsługa typowych rozdzielczości (np. do 4K); skala w mm określana ręcznie.
- **Logowanie:** wszystkie iteracje (accepted/rejected), parametry, metryki, fallbacki – do późniejszej analizy i audytu (np. pliki logów lub baza).
- **Bezpieczeństwo:** w MVP brak integracji z HIS/EMR; uwierzytelnienie użytkownika klinicznego (US-001) – zakres (np. lokalne konto vs. SSO) do ustalenia.
- **Użyteczność:** interfejs zrozumiały dla lekarza; legenda i podsumowanie liczbowe przed akceptacją; czytelna wizualizacja wielomaskowa (wykres z różnymi kolorami masek).

---

## 11. Ryzyka i otwarte kwestie

### 11.1. Ryzyka

- **Skalowanie obrazu:** błędne podanie szerokości zmiany w mm prowadzi do punktów „poza” zamierzonym obszarem; w examples zgłaszano problemy ze skalowaniem – wymagana walidacja i ewentualnie wskazówki dla użytkownika (np. narzędzie do pomiaru na obrazie).
- **Kierunek obrotu / oś:** w trakcie prac zgłaszano błędy (oś odbita względem Y, punkty na złym kącie) – algorytm i testy muszą weryfikować **zgodność z ruchem wskazówek zegara** i poprawność osi.
- **Wielomaskowość:** wiele masek z różnym % pokrycia zwiększa złożoność (przeplatanie sekwencji, czytelność wykresu); wymagane testy na przykładach typu zmiana skórna 5, 7, 8.

### 11.2. Otwarte kwestie (unresolved)

1. **Formalne testy regresji i dataset referencyjny** – świadomie poza MVP; do zaplanowania w kolejnej fazie.
2. **Architektura backendowa i przechowywanie danych** długoterminowo (baza, pliki, chmura) – do ustalenia.
3. **Przyszła strategia automatycznej segmentacji** i jej walidacja kliniczna – po MVP.
4. **Wymagania regulacyjne (CE/MDR)** – odłożone na kolejny etap; PRD nie obejmuje formalnej certyfikacji w MVP.

---

## 12. Załącznik – odniesienia do examples

| Zasób | Opis |
|-------|------|
| `examples/succesful point and animation algorythm.txt` | Historia decyzji algorytmu: kinematyka (liniowa + obrotowa), 5°, clockwise, ruch wózka, animacja 5 s, wielomaskowość, skalowanie. |
| `examples/zmiana skorna 1..8` | Obrazy zmian skórnych (z maskami i bez), wykresy siatki (`*_graph*.png`), animacje (`*_fluent*.gif`, `*_realistic_motion*.gif`), pliki CSV sekwencji. |
| `examples/zmiana skorna 5, 7, 8` | Przykłady **wielomaskowe** z różnym % pokrycia; format CSV z kolumnami `mask`, `component_id`, `theta_k`. |
| `examples/zmiana skorna 6` | Skala 20 mm (szerokość zmiany); pliki z sufiksem `_20mmwidth`. |
| `examples/zmiana skorna 8/v2, v3` | Iteracje poprawione (kierunek obrotu, skalowanie, czytelność wykresu). |

Dokument PRD powinien być spójny z powyższymi przykładami i formatami eksportu.

---

## 13. Stos technologiczny

Informacje na temat stosu technologicznego (języki programowania, frameworki, baza danych, uwierzytelnienie, CI/CD, hosting) są opisane w osobnym dokumencie: **[tech-stack.md](tech-stack.md)**. PRD odnosi się wyłącznie do wymagań produktu; szczegóły techniczne pozostają w tech-stack.md.

