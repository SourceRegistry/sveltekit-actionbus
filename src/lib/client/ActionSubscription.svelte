<script lang="ts" module>
	import type { Snippet } from 'svelte';
	import { type ActionChannel } from '$lib/protocol.js';
	import type { ActionSubscription } from './ActionBus.svelte';

	export type ActionSubscriptionSnippet<Channels extends readonly string[]> = Snippet<
		[ActionSubscription<Channels>]
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
