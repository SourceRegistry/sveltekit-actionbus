import { demoActionBus } from '$lib/server/demo-actionbus.js';

export const load = () => {
	return {
		tasks: [{ id: 'demo-task', title: 'Open this page in two tabs' }]
	};
};

export const actions = {
	broadcast: async ({ request }) => {
		const form = await request.formData();
		const title = String(form.get('title') || '').trim();

		demoActionBus.broadcast('project:demo', {
			type: 'task.updated',
			payload: {
				id: 'demo-task',
				title: title || `Updated at ${new Date().toLocaleTimeString()}`
			}
		});

		demoActionBus.broadcast('user:test:notifications', {
			type: 'notification.created',
			payload: {
				id: '10',
				message: 'test'
			}
		});

		return { ok: true };
	}
};
