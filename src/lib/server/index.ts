import type { IncomingMessage } from 'node:http';
import {
	websockets,
	type ReferencedWebSocket,
	type WebSocketEndpointConfig
} from '@sourceregistry/sveltekit-websockets/server';
import {
	isKnownActionChannel,
	isKnownActionEventForChannel,
	isRecord,
	type Action,
	type ActionBusMetadata,
	type ActionChannel,
	type ActionEventForChannel
} from '$lib/protocol.js';
import { ACTIONBUS_METADATA } from 'virtual:sveltekit-actionbus/events';

export type ActionBusAuthorizeInput<Channel extends string = string> = {
	channel: Channel;
	request: IncomingMessage | undefined;
	socket: ReferencedWebSocket;
};

export type ActionBusServerOptions = {
	path: string;
	authorize?: (input: ActionBusAuthorizeInput) => boolean | Promise<boolean>;
	websocket?: Omit<WebSocketEndpointConfig, 'disposer' | 'path'>;
	metadata?: ActionBusMetadata;
};

export type ActionBusServer = {
	path: string;
	broadcast: <Channel extends ActionChannel>(
		channel: Channel,
		event: ActionEventForChannel<Channel>
	) => void;
	destroy: () => void;
};

type ClientProtocolMessage =
	| { kind: 'subscribe'; channels: string[] }
	| { kind: 'unsubscribe'; channels: string[] };

type ServerProtocolMessage =
	| { kind: 'event'; channel: string; event: Action }
	| { kind: 'error'; code: string; message: string; channel?: string };

export function createActionBus(options: ActionBusServerOptions): ActionBusServer {
	const metadata = options.metadata ?? ACTIONBUS_METADATA;
	const memberships = new WeakMap<ReferencedWebSocket, Set<string>>();
	const requests = new WeakMap<ReferencedWebSocket, IncomingMessage | undefined>();
	const pendingRequests: IncomingMessage[] = [];
	const controller = websockets.continuous(options.path, {
		useConnectionKeys: false,
		...options.websocket
	});

	controller.beforeUpgrade = async ({ req, accept }) => {
		pendingRequests.push(req);
		await accept();
	};

	controller.on('connect', (socket) => {
		const request = pendingRequests.shift();
		requests.set(socket, request);
		memberships.set(socket, new Set());

		socket.on('message', (data) => {
			void handleSocketMessage(socket, String(data));
		});
	});

	controller.on('disconnect', (socket) => {
		memberships.delete(socket);
		requests.delete(socket);
	});

	async function handleSocketMessage(socket: ReferencedWebSocket, data: string): Promise<void> {
		let message: unknown;
		try {
			message = JSON.parse(data);
		} catch {
			send(socket, { kind: 'error', code: 'invalid_json', message: 'Invalid JSON message.' });
			return;
		}

		if (!isClientProtocolMessage(message)) {
			send(socket, {
				kind: 'error',
				code: 'invalid_message',
				message: 'Invalid ActionBus message.'
			});
			return;
		}

		if (message.kind === 'subscribe') {
			await subscribeSocket(socket, message.channels);
			return;
		}

		unsubscribeSocket(socket, message.channels);
	}

	async function subscribeSocket(socket: ReferencedWebSocket, channels: string[]): Promise<void> {
		const membership = memberships.get(socket);
		if (!membership) return;

		for (const channel of channels) {
			if (!isKnownActionChannel(metadata, channel)) {
				send(socket, {
					kind: 'error',
					code: 'unknown_channel',
					message: `Unknown ActionBus channel "${channel}".`,
					channel
				});
				continue;
			}

			const authorized =
				(await options.authorize?.({
					channel,
					request: requests.get(socket),
					socket
				})) ?? true;

			if (!authorized) {
				send(socket, {
					kind: 'error',
					code: 'unauthorized_channel',
					message: `Not authorized to subscribe to "${channel}".`,
					channel
				});
				continue;
			}

			membership.add(channel);
		}
	}

	function unsubscribeSocket(socket: ReferencedWebSocket, channels: string[]): void {
		const membership = memberships.get(socket);
		if (!membership) return;

		for (const channel of channels) {
			membership.delete(channel);
		}
	}

	return {
		path: options.path,
		broadcast(channel, event) {
			const action = event as Action;
			const eventType = action.type;
			if (!isKnownActionChannel(metadata, channel)) {
				throw new Error(`[sveltekit-actionbus] Unknown action channel "${channel}".`);
			}

			if (!isKnownActionEventForChannel(metadata, channel, action)) {
				throw new Error(
					`[sveltekit-actionbus] Event "${eventType}" is not valid for channel "${channel}".`
				);
			}

			const payload: ServerProtocolMessage = {
				kind: 'event',
				channel,
				event: action
			};

			controller.broadcast(JSON.stringify(payload), {
				filter: (socket) => memberships.get(socket)?.has(channel) ?? false
			});
		},
		destroy() {
			controller.destroy();
		}
	};
}

function send(socket: ReferencedWebSocket, message: ServerProtocolMessage): void {
	socket.send(JSON.stringify(message));
}

function isClientProtocolMessage(value: unknown): value is ClientProtocolMessage {
	if (!isRecord(value) || (value.kind !== 'subscribe' && value.kind !== 'unsubscribe')) {
		return false;
	}

	return (
		Array.isArray(value.channels) && value.channels.every((channel) => typeof channel === 'string')
	);
}

export { isKnownActionChannel, isKnownActionEventForChannel };
