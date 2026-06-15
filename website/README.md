# MSRM Marketing Website

Astro marketing site for the MSRM restaurant-management platform. Separate from the app
(`/frontend`). Static, SEO-first, fast.

## Run
```bash
cd website
npm install
npm run dev      # http://localhost:4321
npm run build    # → dist/
npm run preview
```

## Structure
- `src/data/site.ts` — single source of truth: nav, features, plans, region content. **Edit here.**
- `src/layouts/Layout.astro` — shell (head/SEO, Header, Footer).
- `src/components/` — Header (with 🇮🇳/🇦🇺 region toggle), Footer, CTA, Icon.
- `src/pages/` — Home, features, features/[slug] (7 module pages), pricing, demo, solutions, integrations, about, privacy, terms.
- `src/styles/global.css` — brand tokens + component classes.

## Region toggle
`<html data-region>` is set client-side (header buttons, persisted to localStorage).
Region-specific copy uses `.r-in` / `.r-au` spans (CSS shows the active one).

## TODO before launch
- Set real domain in `astro.config.mjs` (`site`) + `SITE.appUrl` / `SITE.email` in `site.ts`.
- Replace `(product screenshot)` placeholders with real app screenshots.
- Wire the demo form (`src/pages/demo.astro`) to your backend `/api/leads` or a CRM.
- Replace placeholder Privacy/Terms with reviewed legal copy.
- Deploy on Vercel (root = `website/`, framework = Astro).
