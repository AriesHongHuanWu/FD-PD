import { defineConfig } from 'vite';

export default defineConfig({
    // Base path './' ensures assets are loaded correctly on GitHub Pages
    // regardless of the repository name.
    base: './',
    build: {
        outDir: 'dist',
        assetsDir: 'assets',
        // Minify for production performance
        minify: 'terser',
        terserOptions: {
            compress: {
                drop_console: true, // Clean up console logs in production
                drop_debugger: true,
            },
        },
    },
    server: {
        open: true,
        port: 3000,
    }
});
