/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Premium dark palette with a warm backgammon accent.
        night: {
          900: '#0b1020',
          800: '#111834',
          700: '#1a2348',
        },
        accent: {
          DEFAULT: '#f4b23e',
          600: '#e09a1f',
        },
        felt: '#0e5c4a',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glass: '0 8px 32px rgba(0, 0, 0, 0.35)',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
};
