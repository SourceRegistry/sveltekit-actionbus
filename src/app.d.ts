// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces

declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}

		interface ActionEvents {
			'project:${string}': {
				'task.updated': { id: string; title: string };
				'task.deleted': { id: string };
			};
			'user:${string}:notifications': {
				'notification.created': { id: string; message: string };
			};
		}
	}
}

export {};
