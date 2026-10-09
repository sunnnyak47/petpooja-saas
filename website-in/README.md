# MSRM Marketing Website — India

Astro marketing site for the MSRM restaurant-management platform, **India edition**.
Separate from the app (`/frontend`) and from the Australia site (`/website`). Static,
SEO-first, fast.

> **Branding:** this site is branded **MSRM**, *not* "Petpooja". "Petpooja" is an
> established Indian restaurant-POS company; launching under that name would collide
> with their trademark. See `DEPLOY.md` → "Owner decisions".

## Run
```bash
cd website-in
npm install
npm run dev      # http://localhost:4321
npm run build    # → dist/
npm run preview
```

## Structure
- `src/data/site.ts` — single source of truth: nav, features, plans (₹), region content, comparisons. **Edit here.**
- `src/layouts/Layout.astro` — shell (head/SEO: canonical, OG, JSON-LD, sitemap, en-IN).
- `src/components/` — Header, Footer, CTA, Icon, Shot, ScrollFX, HeroAssemble (3D), `sections/`.
- `src/scripts/heroScene.ts` — the only file that imports `three` (scroll-driven 3D hero).
- `src/pages/` — Home, features + features/[slug] (7), why-msrm, how-it-works, solutions + solutions/[slug] (5), pricing, integrations, migration, payments, hardware, security, about, demo, blog + blog/[slug] (3), case-studies, privacy, terms.
- `src/styles/global.css` — brand tokens + component classes.
- `public/screenshots/` — product screenshots (the ₹/INR app screens).

## India specifics
- Currency ₹/INR throughout; plans Starter ₹999, Growth ₹1999, Chain custom.
- Integrations: Zomato & Swiggy (via POS-partner middleware), UPI / Razorpay, Tally, GST / GSTR-1 / GSTR-3B.
- Comparisons use **capability categories**, never named competitor brands (trademark + misleading-claim risk).
- Privacy/Terms are **templates** (DPDP Act 2023 aware), banner-marked for lawyer review.

## TODO before launch
- Confirm the domain in `astro.config.mjs` (`site`), `public/robots.txt`, and `SITE.domain`/`SITE.email` in `site.ts` (placeholder: `msrm.in`).
- Confirm/replace the app URL in `SITE.appUrl`.
- Confirm pricing (₹999 / ₹1999 / custom) and add GST treatment.
- Replace illustrative case studies / testimonials with real, verified customers.
- Have an Indian lawyer review Privacy & Terms; add Grievance Officer + governing entity/GSTIN.
- Wire the demo form (`PUBLIC_LEADS_ENDPOINT`) to the backend `/api/leads` or a CRM.
- See `DEPLOY.md` for deployment.
