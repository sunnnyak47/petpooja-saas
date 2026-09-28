# Deploying the MSRM India website (`website-in/`)

Static Astro site. Deploys independently of the app and of the Australia site (`website/`).

## Vercel (recommended)
1. New Project → import this repo.
2. **Root Directory:** `website-in`
3. Framework preset: **Astro** (auto-detected; `vercel.json` also pins it).
   - Build command: `npm run build`
   - Output directory: `dist`
   - Install command: `npm install`
4. Environment variables (Project → Settings → Environment Variables):
   - `PUBLIC_LEADS_ENDPOINT` — where the demo form POSTs leads
     (default `https://petpooja-saas.onrender.com/api/leads`).
   - `PUBLIC_GA_ID` — optional Google Analytics ID (analytics stay off if unset).
5. Add the custom domain once confirmed (placeholder: `msrm.in`) and update:
   - `astro.config.mjs` → `site`
   - `public/robots.txt` → `Sitemap:` URL
   - `src/data/site.ts` → `SITE.domain`, `SITE.email`

## Any static host
`npm run build` emits a fully static `dist/`. Upload it to Netlify, Cloudflare Pages,
S3+CloudFront, Nginx, etc. No server runtime is required.

## Local build check
```bash
cd website-in
npm install
npm run build
npm run preview
```

---

## Owner decisions before launch
1. **Brand name (IMPORTANT).** This site is branded **MSRM**, deliberately *not* "Petpooja",
   because "Petpooja" is an established Indian restaurant-POS company and launching under that
   name would collide with their trademark. Decide the final India brand (MSRM or another) and
   apply it consistently before going live.
2. **Domain.** `msrm.in` is a placeholder — register/confirm the real domain and wire it in the
   three places listed above.
3. **Legal review.** Privacy & Terms are DPDP-Act-aware **templates**. An Indian lawyer must review
   them and you must add the Grievance Officer, governing legal entity and GSTIN.
4. **Pricing.** Confirm ₹999 / ₹1999 / custom and the GST treatment shown on `/pricing`.
5. **Proof.** Replace illustrative case studies and testimonials with real, verified customers.
6. **Integrations.** Confirm the certified Zomato/Swiggy POS-partner middleware and payment/Tally
   connections before making integration claims public.
