/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Roboto', 'sans-serif'],
                google: ['"Google Sans"', 'Roboto', 'sans-serif'],
            },
            colors: {
                // Material Design 3 inspired colors
                'md-sys-light-primary': '#0061A4',
                'md-sys-light-on-primary': '#FFFFFF',
                'md-sys-light-primary-container': '#D1E4FF',
                'md-sys-light-on-primary-container': '#001D36',
                'md-sys-light-surface': '#FDFCFF',
                'md-sys-light-surface-variant': '#DFE2EB',
                'md-sys-light-on-surface': '#1A1C1E',
                'md-sys-light-on-surface-variant': '#43474E',
                'md-sys-light-outline': '#73777F',
                // Status colors
                'google-green': '#34A853',
                'google-red': '#EA4335',
                'google-yellow': '#FBBC05',
                'google-blue': '#4285F4',
            },
            borderRadius: {
                'xl': '1rem',
                '2xl': '1.5rem', // Material 3 large component radius
                '3xl': '2rem',
            },
            boxShadow: {
                'md-elevation-1': '0px 1px 2px 0px rgba(0, 0, 0, 0.3), 0px 1px 3px 1px rgba(0, 0, 0, 0.15)',
                'md-elevation-3': '0px 1px 3px 0px rgba(0, 0, 0, 0.3), 0px 4px 8px 3px rgba(0, 0, 0, 0.15)',
            }
        },
    },
    plugins: [],
}
