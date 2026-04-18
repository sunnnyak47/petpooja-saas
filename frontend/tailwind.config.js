/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fef3f2', 100: '#fee4e2', 200: '#ffcdc9',
          300: '#fda29b', 400: 'var(--accent)', 500: 'var(--accent)',
          600: 'var(--accent-hover)', 700: '#b42318', 800: '#912018', 900: '#7a271a',
        },
        surface: {
          50: '#fafafa', 100: 'var(--text-primary)', 200: 'var(--text-primary)',
          300: 'var(--text-secondary)', 400: 'var(--text-secondary)', 500: 'var(--text-secondary)',
          600: 'var(--border)', 700: 'var(--bg-hover)', 800: 'var(--bg-card)', 900: 'var(--bg-primary)',
        },
        success: { 400: '#4ade80', 500: 'var(--success)', 600: 'var(--success)' },
        warning: { 400: '#facc15', 500: 'var(--warning)', 600: 'var(--warning)' },
        info: { 400: '#60a5fa', 500: 'var(--accent)', 600: '#2563eb' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      boxShadow: {
        glass: '0 8px 32px rgba(0,0,0,0.08)',
        'glass-lg': '0 16px 48px rgba(0,0,0,0.12)',
        glow: '0 0 24px rgba(240,68,56,0.15)',
      },
      animation: {
        'slide-in': 'slideIn 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
        'bounce-subtle': 'bounceSubtle 0.5s ease',
      },
      keyframes: {
        slideIn: { from: { transform: 'translateX(100%)', opacity: 0 }, to: { transform: 'translateX(0)', opacity: 1 } },
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        bounceSubtle: { '0%,100%': { transform: 'scale(1)' }, '50%': { transform: 'scale(1.05)' } },
      },
    },
  },
  plugins: [],
};
