import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { actionbus } from './src/lib/vite/index.js';

export default defineConfig({
	plugins: [sveltekit(), actionbus()],
	server: {
		hmr: {
			port: 5175
		}
	},
	test: {
		exclude: ['node_modules/**', 'dist/**', '.svelte-kit/**', 'build/**'],
		coverage: {
			exclude: ['dist/**', '.svelte-kit/**', 'build/**']
		}
	}
});
