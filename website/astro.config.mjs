// @ts-check
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';

// Marketing site for MSRM (Australia). Static, SEO-first, fast. Deployed separately from the app.
export default defineConfig({
  site: 'https://getmsrm.com.au', // Australian marketing domain — update if the final .au domain differs
  integrations: [tailwind(), sitemap()],
});
