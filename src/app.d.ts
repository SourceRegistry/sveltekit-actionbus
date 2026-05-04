// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { Action } from '$lib';

declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}

		interface ActionEvents {
			'project:${string}': {
				'task.updated': Action<{ id: string; title: string }>;
				'task.deleted': Action<{ id: string }>;
			};
			'user:${string}:notifications': {
				'notification.created': Action<{ id: string; message: string }>;
			};
		}
	}
}

export {};
