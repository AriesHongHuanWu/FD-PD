/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ["./index.html", "./js/**/*.js"],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
            },
            animation: {
                'pulse-red': 'pulse-red 2s infinite',
            },
            keyframes: {
                'pulse-red': {
                    '0%, 100%': { boxShadow: '0 0 0 0 rgba(239, 68, 68, 0.7)' },
                    '70%': { boxShadow: '0 0 0 10px rgba(239, 68, 68, 0)' },
                }
            }
        },
    },
    plugins: [],
}
