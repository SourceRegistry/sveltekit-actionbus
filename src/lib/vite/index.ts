import type { Plugin, PluginOption } from 'vite';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { websockets } from '@sourceregistry/sveltekit-websockets/vite';
import {
	generateActionMetadata,
	VIRTUAL_MODULE_ID,
	RESOLVED_VIRTUAL_ID
} from './generate-event-names.js';

export interface ActionBusPluginOptions {
	/** Path to `app.d.ts` relative to project root. Defaults to `src/app.d.ts`. */
	appDtsPath?: string;
	/** Options forwarded to the internal websocket plugin. */
	websockets?: Parameters<typeof websockets>[0];
}

/**
 * Unified Vite plugin for sveltekit-actionbus.
 * Combines ActionBus metadata generation (virtual module) with websocket server support.
 *
 * @example
 * // Consumer's vite.config.ts
 * import { actionbus } from 'sveltekit-actionbus/vite';
 *
 * export default defineConfig({
 *   plugins: [sveltekit(), actionbus()]
 * });
 *
 * // In your app — validation is automatic, no props needed:
 * <ActionBus url="/ws" />
 */
export function actionbus(options: ActionBusPluginOptions = {}): PluginOption[] {
	const { appDtsPath: appDtsPathOption, websockets: websocketsOpts } = options;

	let cachedSourceCode = '';

	function getAppDtsPath(): string {
		const root = process.cwd();
		const appDtsPath = appDtsPathOption
			? path.resolve(root, appDtsPathOption)
			: path.resolve(root, 'src', 'app.d.ts');

		if (!fs.existsSync(appDtsPath)) {
			throw new Error(
				`[sveltekit-actionbus] Cannot find app.d.ts at "${appDtsPath}". ` +
					'Ensure App.ActionEvents is declared in your app.d.ts, or pass ' +
					'`appDtsPath` option to the plugin.'
			);
		}

		return appDtsPath;
	}

	function generateAndCache(): void {
		const result = generateActionMetadata(getAppDtsPath());
		cachedSourceCode = result.sourceCode;
	}

	const metadataPlugin: Plugin = {
		name: 'sveltekit-actionbus',

		/* ------------------------------------------------------------------ */
		/*  Virtual module: virtual:sveltekit-actionbus/events                 */
		/* ------------------------------------------------------------------ */

		resolveId(id) {
			if (id === VIRTUAL_MODULE_ID) {
				return RESOLVED_VIRTUAL_ID;
			}
		},

		load(id) {
			if (id === RESOLVED_VIRTUAL_ID) {
				return cachedSourceCode;
			}
		},

		/* ------------------------------------------------------------------ */
		/*  Regeneration on app.d.ts change                                    */
		/* ------------------------------------------------------------------ */

		buildStart() {
			try {
				generateAndCache();
			} catch {
				/* suppress */
			}
		},

		watchChange(file) {
			if (file.endsWith('app.d.ts')) {
				try {
					generateAndCache();
				} catch {
					/* suppress */
				}
			}
		},

		configureServer(server) {
			const watcher = fs.watch(getAppDtsPath(), { persistent: true }, () => {
				try {
					generateAndCache();
					server.ws.send({ type: 'full-reload' });
				} catch {
					/* suppress */
				}
			});

			return () => {
				watcher.close();
			};
		}
	};

	return [metadataPlugin, websockets(websocketsOpts)];
}

// Also re-export websocket plugin for convenience
export { websockets };
