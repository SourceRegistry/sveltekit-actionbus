<script lang="ts" module>
	import type { Snippet } from 'svelte';
	import type { Readable } from 'svelte/store';
	import {
		type ActionBusState,
		type ActionBusError,
		type ActionChannel,
		type ActionMessage,
		type ActionReducerMap
	} from '$lib/protocol.js';

	export type ActionSubscriptionSnippet<Channels extends readonly string[]> = Snippet<
		[
			{
				channels: Channels;
				state: Readable<ActionBusState>;
				events: Readable<ActionMessage<Channels[number]>[]>;
				errors: Readable<ActionBusError<Channels[number]>[]>;
				eventStore: <State>(
					initial: State,
					reducers: ActionReducerMap<State, Channels>
				) => Readable<State>;
				close: () => void;
			}
		]
	>;

	export type ActionSubscriptionProps<Channels extends readonly ActionChannel[]> = {
		channels: Channels;
		children?: ActionSubscriptionSnippet<Channels>;
	};
</script>

<script lang="ts" generics="Channels extends readonly ActionChannel[]">
	import { subscribe } from './ActionBus.svelte';

	let { channels, children }: ActionSubscriptionProps<Channels> = $props();
	// svelte-ignore state_referenced_locally
	const subscription = subscribe(...channels);
</script>

{@render children?.(subscription)}
