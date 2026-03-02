/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ["./public/**/*.{html,js}"],
    theme: {
        extend: {
            colors: {
                ceutec: {
                    red: '#B20000', // Rojo CEUTEC
                    dark: '#1a1a1a',
                    light: '#f5f5f5'
                }
            }
        },
    },
    plugins: [],
}
