/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#1c1c1c',
        surface: '#242424',
        foreground: '#f3f2ef',
        muted: '#a8a29e',
        accent: {
          DEFAULT: '#ff7b4a',
          light: '#ff915e',
          dark: '#cc653b',
        },
      },
      fontFamily: {
        serif: ['Georgia', 'Times New Roman', 'serif'],
      },
      // Dynamic viewport height for Capacitor, fallback to 100vh for PWA
      height: {
        screen: ['100vh', '100dvh'],
      },
      minHeight: {
        screen: ['100vh', '100dvh'],
      },
      // Safe area spacing utilities
      spacing: {
        'safe-top': 'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-left': 'env(safe-area-inset-left)',
        'safe-right': 'env(safe-area-inset-right)',
      },
    },
  },
  plugins: [],
}
