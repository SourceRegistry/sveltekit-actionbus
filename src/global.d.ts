declare module 'virtual:sveltekit-actionbus/events' {
	import type { ActionBusMetadata, Action } from '$lib/protocol.js';

	export const ACTIONBUS_METADATA: ActionBusMetadata;
	export const ACTION_CHANNELS: ActionBusMetadata['channels'];

	export function findActionChannel(
		channel: string
	): ActionBusMetadata['channels'][number] | undefined;
	export function isValidActionChannel(channel: unknown): channel is string;
	export function isValidActionEventForChannel(channel: string, event: unknown): event is Action;
}
