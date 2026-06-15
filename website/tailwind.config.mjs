/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,md,mdx}'],
  theme: {
    extend: {
      colors: {
        // Brand tokens — matched to the app's UI: accent blue #2563eb, slate neutrals.
        // Keeps the marketing site visually consistent with the product.
        brand: {
          50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe',
          400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8', 900: '#1e3a8a',
        },
        ink: { DEFAULT: '#0f172a', soft: '#334155', mute: '#64748b' },
        line: '#e2e8f0',
        surface: { DEFAULT: '#ffffff', alt: '#f8fafc', dark: '#0f172a' },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      maxWidth: { container: '1180px' },
      boxShadow: {
        card: '0 1px 2px rgba(11,18,32,.04), 0 8px 24px -12px rgba(11,18,32,.12)',
        lift: '0 10px 40px -12px rgba(11,18,32,.22)',
      },
      borderRadius: { xl2: '1.25rem' },
    },
  },
  plugins: [],
};
