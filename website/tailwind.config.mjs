/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,md,mdx}'],
  theme: {
    extend: {
      colors: {
        // Brand tokens — confident, food-friendly teal accent + clean neutrals.
        // Professional (no purple gradients / emoji), consistent with the app.
        brand: {
          50: '#ecfdf8', 100: '#d1fae8', 200: '#a7f3d4',
          400: '#34d3a6', 500: '#10b894', 600: '#0f766e', 700: '#0c5e58', 900: '#063b38',
        },
        ink: { DEFAULT: '#0b1220', soft: '#334155', mute: '#64748b' },
        line: '#e5e9f0',
        surface: { DEFAULT: '#ffffff', alt: '#f7faf9', dark: '#0b1220' },
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
