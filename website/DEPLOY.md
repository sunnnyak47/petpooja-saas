# Deploying the MSRM marketing site (website/)

The marketing site is a **static Astro build** and deploys as its **own Vercel project**,
separate from the ERP frontend (the repo-root `vercel.json` belongs to the app, not this site).
`website/vercel.json` in this directory configures the static build.

## 1. Create the Vercel project

1. Vercel → **Add New → Project** → import this Git repository.
2. **Root Directory:** set to `website` (Edit → type `website`). This is the critical step —
   it makes Vercel pick up `website/vercel.json` and ignore the repo-root config.
3. Framework preset: **Astro** (auto-detected; `vercel.json` pins it anyway).
   Build command `npm run build`, output `dist/` — both already set in `vercel.json`.
4. Add the environment variables below **before** the first deploy, then deploy.

## 2. Environment variables (Project → Settings → Environment Variables)

| Variable | Production value | Notes |
| --- | --- | --- |
| `PUBLIC_LEADS_ENDPOINT` | `https://petpooja-saas.onrender.com/api/leads` | Where the demo form POSTs leads. **Never** set a `localhost` value on Vercel — Astro inlines `PUBLIC_*` vars into the static bundle at build time, so a localhost value would ship to visitors and silently break the form. If unset, the code already falls back to this same production URL (`src/data/site.ts`), so unset is also safe. The localhost override is for local dev only (a git-ignored `website/.env.local`). |
| `PUBLIC_GA_ID` | your GA4 Measurement ID, e.g. `G-XXXXXXXXXX` | Enables Google Analytics 4. See “Analytics” below. |

Scope both to **Production** (and Preview if you want analytics/leads on preview builds).
Because these are build-time values, changing one requires a **redeploy** to take effect.

## 3. Analytics (GA4)

GA4 is wired in `src/layouts/Layout.astro` and is **entirely gated on `PUBLIC_GA_ID`**:

- Env var **unset** → no gtag script is rendered at all. Zero tracking, zero requests
  to Google. This is the state in local dev and in any environment without the var.
- Env var **set** → the gtag loader + config snippet render on every page.

To activate: create a GA4 property (admin.google.com/analytics), copy the `G-…`
Measurement ID, set `PUBLIC_GA_ID` on the Vercel project, redeploy, then verify a
page_view arrives in GA4 Realtime.

## 4. Attach the domain (getmsrm.com.au)

1. Project → **Settings → Domains** → add `getmsrm.com.au` and `www.getmsrm.com.au`
   (redirect `www` → apex, or the reverse — pick one canonical form; the site’s
   canonical/OG tags assume `https://getmsrm.com.au`, per `astro.config.mjs` `site`).
2. At your .au registrar, point DNS as Vercel instructs: apex `A` → `76.76.21.21`,
   `www` `CNAME` → `cname.vercel-dns.com` (Vercel shows the current values).
3. Wait for DNS + automatic SSL, then confirm `https://getmsrm.com.au` serves the site
   and `/sitemap-index.xml` resolves.

## 5. Pre-launch checklist (manual, owner action required)

- [ ] **Fill in ABN and phone** in `src/data/site.ts` (`SUPPORT.abn`, `SUPPORT.phone`).
      Both intentionally ship blank: a blank `abn` hides the ABN from the footer
      copyright line, and a blank `phone` hides call CTAs — so nothing fake is shown.
      An Australian business publishing terms/pricing should display its ABN.
- [ ] **Legal review:** `/privacy` and `/terms` are professional **templates** and are
      banner-marked as such. Have an Australian solicitor review them, set a real
      “Last updated” date, fill the governing-law state/territory in the terms, then
      remove the review banners.
- [ ] Replace the illustrative case studies in `src/data/site.ts` (`CASE_STUDIES`)
      with real customers, and re-verify competitor pricing rows (`COMPARISONS`).
- [ ] Confirm the demo form works end-to-end in production (submits to
      `https://petpooja-saas.onrender.com/api/leads` and the lead appears in the app).

## Local development

```bash
cd website
npm install
npm run dev        # http://localhost:4321
```

Optional `website/.env.local` (git-ignored, never committed, never used by Vercel):

```
PUBLIC_LEADS_ENDPOINT=http://localhost:5001/api/leads
```

Leave `PUBLIC_GA_ID` unset locally so dev traffic is never tracked.
