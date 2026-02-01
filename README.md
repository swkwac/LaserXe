# 10x Astro Starter

A modern, opinionated starter template for building fast, accessible, and AI-friendly web applications.

## Tech Stack

- [Astro](https://astro.build/) v5.5.5 - Modern web framework for building fast, content-focused websites
- [React](https://react.dev/) v19.0.0 - UI library for building interactive components
- [TypeScript](https://www.typescriptlang.org/) v5 - Type-safe JavaScript
- [Tailwind CSS](https://tailwindcss.com/) v4.0.17 - Utility-first CSS framework

## Prerequisites

- Node.js v22.14.0 (as specified in `.nvmrc`)
- npm (comes with Node.js)

## Getting Started

1. Clone the repository:

```bash
git clone https://github.com/przeprogramowani/10x-astro-starter.git
cd 10x-astro-starter
```

2. Install dependencies:

```bash
npm install
```

3. Run the development server:

```bash
npm run dev
```

4. Build for production:

```bash
npm run build
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues

## Project Structure

```md
.
├── src/
│   ├── layouts/    # Astro layouts
│   ├── pages/      # Astro pages
│   │   └── api/    # API endpoints
│   ├── components/ # UI components (Astro & React)
│   └── assets/     # Static assets
├── public/         # Public assets
```

## AI Development Support

This project is configured with AI development tools to enhance the development experience, providing guidelines for:

- Project structure
- Coding practices
- Frontend development
- Styling with Tailwind
- Accessibility best practices
- Astro and React guidelines

### Cursor IDE

The project includes AI rules in `.cursor/rules/` directory that help Cursor IDE understand the project structure and provide better code suggestions.

### GitHub Copilot

AI instructions for GitHub Copilot are available in `.github/copilot-instructions.md`

### Windsurf

The `.windsurfrules` file contains AI configuration for Windsurf.

## Contributing

Please follow the AI guidelines and coding practices defined in the AI configuration files when contributing to this project.

## Backend API (FastAPI)

1. Install Python dependencies:

```bash
pip install -r backend/requirements.txt
```

2. Configure auth in `.env` (example in `.env.example`):
   - `AUTH_SECRET_KEY` (required for cookie auth)
   - `AUTH_COOKIE_NAME`, `AUTH_COOKIE_SECURE`, `AUTH_COOKIE_SAMESITE`
   - `AUTH_COOKIE_MAX_AGE_SECONDS`

3. Run migrations and seed:

```bash
python backend/scripts/run_migrations.py
```

4. Start backend:

```bash
uvicorn backend.main:app --reload --port 8000
```

5. Run backend tests:

```bash
pytest backend/tests
```

## Grid algorithms (LaserXe)

- **Prosty** – XY grid, 800 µm spacing (configurable 0.3–2 mm). Points only inside masks.
- **Zaawansowany (beta)** – coverage target, diameters every 5°, automatic spacing. See `.ai/instrukcja-uzytkowania.md` (Krok 6) for details.

## Export formats (LaserXe)

- **Spots CSV** (`GET /api/iterations/{id}/spots?format=csv`): The file may start with comment lines `# algorithm_mode=simple` and `# grid_spacing_mm=0.8`. Parsers that expect only numeric/data rows should skip lines starting with `#`.
- **JSON export** (`GET /api/iterations/{id}/export?format=json`): Includes `metadata.algorithm_mode` and `metadata.grid_spacing_mm` for reproducibility.

## E2E tests (Playwright)

With backend on :8000 and frontend on :4321:

```bash
npm run e2e
```

## License

MIT
