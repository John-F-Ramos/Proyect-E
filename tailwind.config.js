/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./public/**/*.{html,js}"],
  theme: {
    extend: {
      colors: {
        ceutec: {
          red: '#B20000',
          50: '#FDF2F2',
          100: '#FBE5E5',
          200: '#F7CCCC',
          300: '#F0A8A8',
          400: '#E67777',
          500: '#D64B4B',
          600: '#B20000',
          700: '#8B0000',
          800: '#6B0000',
          900: '#4A0000'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
}