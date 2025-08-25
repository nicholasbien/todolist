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
    },
  },
  plugins: [],
}
