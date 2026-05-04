<script lang="ts" module>
	import { getContext, onDestroy, type Snippet } from 'svelte';
	import { readable, writable, type Readable } from 'svelte/store';
	import {
		createInitialActionBusState,
		isKnownActionChannel,
		isKnownActionEventForChannel,
		isRecord,
		type Action,
		type ActionBusError,
		type ActionBusMetadata,
		type ActionBusState,
		type ActionChannel,
		type ActionMessage,
		type ActionReducerMap
	} from '$lib/protocol.js';
	import { ACTIONBUS_METADATA } from 'virtual:sveltekit-actionbus/events';

	type ClientProtocolMessage =
		| { kind: 'subscribe'; channels: string[] }
		| { kind: 'unsubscribe'; channels: string[] };

	type ServerProtocolMessage =
		| { kind: 'event'; channel: string; event: Action }
		| { kind: 'error'; code: string; message: string; channel?: string };

	type ActionBusListener = (message: ActionMessage<string>) => void;
	type ActionBusErrorListener = (error: ActionBusError<string>) => void;

	export type ActionBusProps = {
		url: string | URL;
		protocols?: string | string[];
		reconnect?: boolean;
		reconnectDelay?: number;
		children?: Snippet;
	};

	export type ActionSubscription<Channels extends readonly string[]> = {
		channels: Channels;
		state: Readable<ActionBusState>;
		events: Readable<ActionMessage<Channels[number]>[]>;
		errors: Readable<ActionBusError<Channels[number]>[]>;
		eventStore: <State>(
			initial: State,
			reducers: ActionReducerMap<State, Channels>
		) => Readable<State>;
		close: () => void;
	};

	export type ActionBusController = {
		state: Readable<ActionBusState>;
		connect: () => void;
		destroy: () => void;
		retain: (channels: readonly string[]) => void;
		release: (channels: readonly string[]) => void;
		listen: (channels: readonly string[], listener: ActionBusListener) => () => void;
		listenErrors: (channels: readonly string[], listener: ActionBusErrorListener) => () => void;
	};

	export const ACTIONBUS_CONTEXT = Symbol.for('sveltekit-actionbus');

	export function subscribe<const Channels extends readonly ActionChannel[]>(
		...channels: Channels
	): ActionSubscription<Channels> {
		const controller = getContext<ActionBusController | undefined>(ACTIONBUS_CONTEXT);
		if (!controller) {
			throw new Error(
				'[sveltekit-actionbus] subscribe() must be called under an <ActionBus> provider.'
			);
		}

		let closed = false;
		controller.retain(channels);

		const close = () => {
			if (closed) return;
			closed = true;
			controller.release(channels);
		};

		onDestroy(close);

		return {
			channels,
			state: controller.state,
			events: readable<ActionMessage<Channels[number]>[]>([], (set, update) => {
				const stop = controller.listen(channels, (message) => {
					update((messages) => [...messages, message as ActionMessage<Channels[number]>]);
				});

				return () => {
					stop();
					set([]);
				};
			}),
			errors: readable<ActionBusError<Channels[number]>[]>([], (set, update) => {
				const stop = controller.listenErrors(channels, (error) => {
					update((errors) => [...errors, error as ActionBusError<Channels[number]>]);
				});

				return () => {
					stop();
					set([]);
				};
			}),
			eventStore<State>(initial: State, reducers: ActionReducerMap<State, Channels>) {
				return readable<State>(initial, (set, update) => {
					const stop = controller.listen(channels, (message) => {
						const event = message.event as Action;
						const reducer = reducers[event.type as keyof typeof reducers] as
							| ((state: State, message: ActionMessage<Channels[number]>) => State)
							| undefined;

						if (reducer) {
							update((state) => reducer(state, message as ActionMessage<Channels[number]>));
						}
					});

					return () => {
						stop();
						set(initial);
					};
				});
			},
			close
		};
	}

	export function createActionBusController(options: {
		url: string | URL;
		protocols?: string | string[];
		reconnect: boolean;
		reconnectDelay: number;
		metadata?: ActionBusMetadata;
	}): ActionBusController {
		const metadata = options.metadata ?? ACTIONBUS_METADATA;
		const stateStore = writable<ActionBusState>(createInitialActionBusState());
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const refCounts = new Map<string, number>();
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const listeners = new Set<{ channels: Set<string>; listener: ActionBusListener }>();
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const errorListeners = new Set<{
			channels: Set<string>;
			listener: ActionBusErrorListener;
		}>();
		let socket: WebSocket | undefined;
		let destroyed = false;
		let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
		let hasConnected = false;

		function send(message: ClientProtocolMessage): void {
			if (socket?.readyState !== WebSocket.OPEN) return;
			socket.send(JSON.stringify(message));
		}

		function setConnected(connected: boolean): void {
			stateStore.update((current) => ({
				...current,
				connected,
				reconnecting: !connected && !destroyed,
				lastError: connected ? null : current.lastError,
				lastReconnectAt:
					connected && hasConnected ? new Date().toISOString() : current.lastReconnectAt
			}));
			if (connected) hasConnected = true;
		}

		function setTransportError(error: string): void {
			stateStore.update((current) => ({
				...current,
				connected: false,
				reconnecting: !destroyed,
				lastError: error
			}));
		}

		function setProtocolError(error: string): void {
			stateStore.update((current) => ({
				...current,
				lastError: error
			}));
		}

		function scheduleReconnect(): void {
			if (destroyed || !options.reconnect || reconnectTimer) return;
			reconnectTimer = setTimeout(() => {
				reconnectTimer = undefined;
				connect();
			}, options.reconnectDelay);
		}

		function connect(): void {
			if (
				destroyed ||
				socket?.readyState === WebSocket.OPEN ||
				socket?.readyState === WebSocket.CONNECTING
			) {
				return;
			}

			const nextSocket = new WebSocket(resolveWebSocketUrl(options.url), options.protocols);
			socket = nextSocket;

			nextSocket.addEventListener('open', () => {
				setConnected(true);
				const channels = [...refCounts.keys()];
				if (channels.length > 0) send({ kind: 'subscribe', channels });
			});

			nextSocket.addEventListener('message', (event: MessageEvent<string>) => {
				handleMessage(metadata, event.data);
			});

			nextSocket.addEventListener('close', () => {
				if (socket === nextSocket) socket = undefined;
				setConnected(false);
				scheduleReconnect();
			});

			nextSocket.addEventListener('error', () => {
				setTransportError('WebSocket error');
			});
		}

		function handleMessage(metadata: ActionBusMetadata, data: unknown): void {
			if (typeof data !== 'string') return;

			let message: unknown;
			try {
				message = JSON.parse(data);
			} catch {
				return;
			}

			if (!isServerProtocolMessage(metadata, message)) return;

			if (message.kind === 'error') {
				setProtocolError(`${message.code}: ${message.message}`);
				const error: ActionBusError<string> = {
					code: message.code,
					message: message.message,
					channel: message.channel,
					receivedAt: new Date().toISOString()
				};

				for (const entry of errorListeners) {
					if (!error.channel || entry.channels.has(error.channel)) {
						entry.listener(error);
					}
				}
				return;
			}

			stateStore.update((current) => ({
				...current,
				lastEventAt: new Date().toISOString()
			}));

			const actionMessage: ActionMessage<string> = {
				channel: message.channel,
				event: message.event as never
			};

			for (const entry of listeners) {
				if (entry.channels.has(message.channel)) {
					entry.listener(actionMessage);
				}
			}
		}

		return {
			state: { subscribe: stateStore.subscribe },
			connect,
			destroy() {
				destroyed = true;
				if (reconnectTimer) clearTimeout(reconnectTimer);
				socket?.close(1000, 'ActionBus destroyed');
				socket = undefined;
				refCounts.clear();
				listeners.clear();
				errorListeners.clear();
				setConnected(false);
			},
			retain(channels) {
				const newChannels: string[] = [];
				for (const channel of channels) {
					if (!isKnownActionChannel(metadata, channel)) {
						throw new Error(`[sveltekit-actionbus] Unknown action channel "${channel}".`);
					}

					const count = refCounts.get(channel) ?? 0;
					refCounts.set(channel, count + 1);
					if (count === 0) newChannels.push(channel);
				}

				if (newChannels.length > 0) send({ kind: 'subscribe', channels: newChannels });
			},
			release(channels) {
				const removedChannels: string[] = [];
				for (const channel of channels) {
					const count = refCounts.get(channel) ?? 0;
					if (count <= 1) {
						refCounts.delete(channel);
						removedChannels.push(channel);
					} else {
						refCounts.set(channel, count - 1);
					}
				}

				if (removedChannels.length > 0) {
					send({ kind: 'unsubscribe', channels: removedChannels });
				}
			},
			listen(channels, listener) {
				const entry = {
					channels: new Set(channels),
					listener
				};
				listeners.add(entry);
				return () => {
					listeners.delete(entry);
				};
			},
			listenErrors(channels, listener) {
				const entry = {
					channels: new Set(channels),
					listener
				};
				errorListeners.add(entry);
				return () => {
					errorListeners.delete(entry);
				};
			}
		};
	}

	function resolveWebSocketUrl(url: string | URL): string {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const resolved = new URL(url, globalThis.location?.href);
		if (resolved.protocol === 'http:') resolved.protocol = 'ws:';
		if (resolved.protocol === 'https:') resolved.protocol = 'wss:';
		return resolved.toString();
	}

	function isServerProtocolMessage(
		metadata: ActionBusMetadata,
		value: unknown
	): value is ServerProtocolMessage {
		if (!isRecord(value) || typeof value.kind !== 'string') return false;

		if (value.kind === 'error') {
			return (
				typeof value.code === 'string' &&
				typeof value.message === 'string' &&
				(value.channel === undefined || typeof value.channel === 'string')
			);
		}

		if (value.kind === 'event') {
			return (
				typeof value.channel === 'string' &&
				isKnownActionEventForChannel(metadata, value.channel, value.event)
			);
		}

		return false;
	}
</script>

<script lang="ts">
	import { onMount, setContext } from 'svelte';

	let {
		url,
		protocols,
		reconnect = true,
		reconnectDelay = 1000,
		children
	}: ActionBusProps = $props();

	// svelte-ignore state_referenced_locally
	const controller = createActionBusController({
		url,
		protocols,
		reconnect,
		reconnectDelay
	});

	setContext(ACTIONBUS_CONTEXT, controller);

	onMount(() => {
		controller.connect();
		return () => controller.destroy();
	});
</script>

{@render children?.()}
