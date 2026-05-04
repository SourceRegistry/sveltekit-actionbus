import { createActionBus } from '$lib/server/index.js';

export const demoActionBus = createActionBus({
	path: '/actionbus',
	authorize: ({ channel }) => channel === 'project:demo'
});
