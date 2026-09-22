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
        glow: '0 0 0 1px rgba(37,99,235,.15), 0 18px 50px -18px rgba(37,99,235,.35)',
      },
      borderRadius: { xl2: '1.25rem' },
      keyframes: {
        'reveal-up': { '0%': { opacity: '0', transform: 'translateY(16px)' }, '100%': { opacity: '1', transform: 'none' } },
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
      },
      animation: {
        'reveal-up': 'reveal-up .6s cubic-bezier(.22,1,.36,1) both',
        float: 'float 6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
