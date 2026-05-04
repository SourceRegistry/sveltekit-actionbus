<script lang="ts">
	import ActionBus from '$lib/client/ActionBus.svelte';

	let { children } = $props();
</script>

<ActionBus url="/actionbus">
	{@render children()}
</ActionBus>
