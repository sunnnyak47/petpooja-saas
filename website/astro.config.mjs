// @ts-check
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

// Marketing site for MSRM. Static, SEO-first, fast. Deployed separately from the app.
// (Sitemap can be re-added with a version matched to the Astro release.)
export default defineConfig({
  site: 'https://getmsrm.com', // update once the domain is chosen
  integrations: [tailwind()],
});
