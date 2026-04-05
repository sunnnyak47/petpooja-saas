/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: { 400: '#f97066', 500: '#f04438', 600: '#d92d20' },
        surface: { 700: '#3f3f46', 800: '#27272a', 900: '#18181b' },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      animation: { 'pulse-slow': 'pulse 3s ease-in-out infinite' },
    },
  },
  plugins: [],
};
