// @ts-check
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';

// Marketing site for MSRM (India). Static, SEO-first, fast. Deployed separately
// from the app. NOTE: branded "MSRM" (not "Petpooja") to avoid colliding with an
// established Indian restaurant-POS trademark — see DEPLOY.md / owner decisions.
export default defineConfig({
  site: 'https://msrm.in', // India marketing domain — placeholder, confirm before launch
  integrations: [tailwind(), sitemap()],
});
