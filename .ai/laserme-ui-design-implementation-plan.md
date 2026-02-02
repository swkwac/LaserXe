# LaserMe UI Design Implementation Plan

This plan aligns the LaserXe web app UI with the LaserMe design assets (SVG graphics from 14.01.2026). The assets define a consistent visual language: brand red, light gray backgrounds, white cards with red borders, pill-shaped buttons, and soft shadows.

---

## Design Tokens (Extracted from SVGs)

| Token | Hex | Usage |
|-------|-----|-------|
| **Primary / Brand** | `#CE0538` | Buttons, icons, accents, borders, header |
| **Background** | `#F5F5F5` | Page background, card outer container |
| **Border gray** | `#B7B7B7` | Outer stroke on containers |
| **White** | `#FFFFFF` | Cards, buttons, inner content |
| **Text primary** | `#000000` or `#242429` | Body text on white |
| **Text accent** | `#CE0538` | Primary labels, selected state |

### Shadows (from SVG filters)

- **Drop shadow (cards/buttons):** `dy: 1–2px`, `blur: 2–2.5px`, `opacity: 0.05–0.38`
- **Inner shadow (containers):** `dy: 2px`, `blur: 1px`, `opacity: 0.25`

### Border radius

- **Pill / large:** `rx: 34–52` (very rounded)
- **Medium:** `rx: 44`
- **Small:** `rx: 34` (circular buttons)

---

## Step-by-Step Implementation Plan

### Phase 1: Design tokens and global styles

#### Step 1.1: Add LaserMe color variables to `global.css`

- Add CSS custom properties for LaserMe palette:
  - `--laserme-primary: #CE0538`
  - `--laserme-primary-hover: #a8042d` (darker for hover)
  - `--laserme-bg: #F5F5F5`
  - `--laserme-border-gray: #B7B7B7`
- Map Shadcn `--primary` to `--laserme-primary` (or create a LaserMe theme variant).
- Map `--background` to `--laserme-bg` for the main app background.
- Map `--border` to `--laserme-border-gray` where appropriate.

#### Step 1.2: Update `@theme inline` in `global.css`

- Ensure `--color-primary` uses the LaserMe red.
- Add `--color-primary-foreground: white` (text on red buttons).
- Add shadow utilities: `--shadow-laserme-card`, `--shadow-laserme-button` (soft drop shadow).

#### Step 1.3: Add LaserMe border radius tokens

- `--radius-pill: 9999px` or `2rem` for fully rounded buttons.
- `--radius-card: 1.5rem` (24px) for card corners (matches rx 34–44 in SVG scale).

---

### Phase 2: Layout and header

#### Step 2.1: Create app header component

- Full-width header bar: `background: #CE0538`, `height: 4rem` (148px in LASERME_1).
- White text for branding.
- Optional: logo area, nav, user menu (match layout from LASERME_1.svg).
- Add to `Layout.astro` or a shared header component.

#### Step 2.2: Update `Layout.astro`

- Set `body` background to `#F5F5F5`.
- Include header above main content.
- Ensure consistent padding and max-width for content area.

---

### Phase 3: Buttons

#### Step 3.1: Update `Button` component (`button.tsx`)

- **Default (primary):** `bg-[#CE0538]`, `text-white`, `border-2 border-[#CE0538]`, `rounded-full` or `rounded-[1rem]`, `shadow` (soft drop shadow).
- **Outline:** `bg-white`, `border-2 border-[#CE0538]`, `text-[#CE0538]`, same rounded style.
- **Secondary / ghost:** `bg-[#F5F5F5]`, `text-[#242429]`, or white with gray border.
- Hover: slightly darker red or lighter background.
- Ensure `primary-foreground` is white for contrast.

#### Step 3.2: Button sizes

- Match height to assets: ~`h-10` (40px) for standard, `h-14` for large pill buttons.
- Padding: `px-6` or `px-8` for pill shape.

---

### Phase 4: Cards and containers

#### Step 4.1: Card styling pattern (from basic.svg, advanced.svg, cancel.svg)

- **Outer container:** `bg-[#F5F5F5]`, `border border-[#B7B7B7]`, `rounded-[2rem]`, inner shadow.
- **Inner content:** `bg-white`, `border-2 border-[#CE0538]`, `rounded-[1.5rem]`, drop shadow.
- Padding: `p-4` to `p-6` inside inner content.

#### Step 4.2: Apply to existing card-like elements

- `rounded-md border border-border bg-card` → replace with LaserMe card pattern.
- Targets: PlanTab form container, MasksTab sections, AuditLogTab filter area, ImageCard, etc.

---

### Phase 5: Forms and inputs

#### Step 5.1: Input styling

- `border-2 border-[#CE0538]` on focus (or `border-[#B7B7B7]` default).
- `rounded-xl` for inputs.
- Background: white.

#### Step 5.2: Labels and select

- Primary labels: `text-[#CE0538]` or `text-[#242429]`.
- Select dropdowns: same border/radius as inputs, white background.

---

### Phase 6: Icons and assets

#### Step 6.1: Copy SVG assets to project

- Create `public/icons/laserme/` or `src/assets/icons/laserme/`.
- Copy relevant SVGs: `Polygon 1.svg`, `Polygon 2.svg` (arrows), `settings.svg`, `back.svg`, `cancel.svg`, `enter.svg`, etc.
- Use as `<img src="..." />` or inline SVG components.

#### Step 6.2: Replace generic icons with LaserMe icons

- Back/arrow: use `Polygon 1` / `Polygon 2` or `back.svg`.
- Settings: use `settings.svg`.
- Cancel, Enter: use provided SVGs where applicable.

---

### Phase 7: Page-specific updates

#### Step 7.1: Login page

- Center card: white, red border, rounded corners, soft shadow.
- Title: `text-[#CE0538]` or black.
- Button: LaserMe primary style.

#### Step 7.2: Images list page

- Header: red bar.
- Image cards: white, red border, rounded, shadow.
- "Otwórz" button: primary style.

#### Step 7.3: Image detail (tabs)

- Tab bar: pill-shaped tabs, active tab with red background or red border.
- Content areas: card pattern.
- Buttons (Odtwórz, Wstrzymaj, Generuj plan, etc.): LaserMe button style.

---

### Phase 8: Error and destructive states

#### Step 8.1: Destructive / error

- Keep `--destructive` distinct from primary (e.g. darker red or different hue) so errors are distinguishable.
- Or use same red with different context (e.g. error message styling).

---

### Phase 9: Responsiveness and polish

#### Step 9.1: Mobile

- Ensure pill buttons and cards scale (smaller radius on mobile if needed).
- Header: compact on small screens.

#### Step 9.2: Dark mode (optional)

- If dark mode is required, define a dark variant of LaserMe palette (darker red, dark gray background).
- Otherwise, keep light-only to match assets.

---

## Summary checklist

- [ ] 1.1 Add LaserMe CSS variables
- [ ] 1.2 Update theme (primary, shadows)
- [ ] 1.3 Add radius tokens
- [ ] 2.1 Create header component (red bar)
- [ ] 2.2 Update Layout.astro (background, header)
- [ ] 3.1 Update Button variants
- [ ] 3.2 Button sizes
- [ ] 4.1 Card pattern (outer + inner)
- [ ] 4.2 Apply to existing cards
- [ ] 5.1 Input styling
- [ ] 5.2 Labels and select
- [ ] 6.1 Copy SVG assets
- [ ] 6.2 Replace icons
- [ ] 7.1 Login page
- [ ] 7.2 Images list
- [ ] 7.3 Image detail tabs
- [ ] 8.1 Error/destructive
- [ ] 9.1 Responsive
- [ ] 9.2 Dark mode (if needed)

---

## Questions before implementation

1. **Scope:** Should we apply LaserMe styling to the entire app, or only to specific pages (e.g. login, images list, image detail)?
2. **Header content:** What should appear in the red header? Logo only, logo + nav, logo + user menu? Is there a LaserMe logo file to use?
3. **Dark mode:** Do you need dark mode support, or is light-only acceptable?
4. **Assets location:** Should SVGs live in `public/` (for direct URLs) or `src/assets/` (for build-time processing)?
5. **Typography:** The SVGs use custom font paths for text. Do you have a preferred font family (e.g. from LaserMe brand guidelines), or should we keep the current system font stack?
