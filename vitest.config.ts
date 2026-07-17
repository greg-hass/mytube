/// <reference types="vitest" />
import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: './src/test/setup.ts',
        css: false,
        exclude: [...configDefaults.exclude, 'tests/e2e/**'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json-summary'],
            reportsDirectory: 'output/coverage',
            thresholds: {
                statements: 68,
                branches: 60,
                functions: 68,
                lines: 70,
            },
        },
    },
});
