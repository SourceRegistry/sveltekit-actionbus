<script lang="ts">
	import { enhance } from '$app/forms';
	import { subscribe } from '$lib/client/ActionBus.svelte';

	let { data } = $props();

	const actionbus = subscribe('project:demo', 'user:test:notifications');
	const project = actionbus.channel('project:demo');

	const connection = actionbus.state;
	const errors = actionbus.errors;
	// svelte-ignore state_referenced_locally
	const tasks = project.eventStore(data.tasks, {
		'task.updated': (tasks, message) => {
			return tasks.map((task) =>
				task.id === message.event.payload.id
					? { ...task, title: message.event.payload.title }
					: task
			);
		},
		'task.deleted': (tasks, message) => {
			return tasks.filter((task) => task.id !== message.event.payload.id);
		}
	});
</script>

<svelte:head>
	<title>SvelteKit ActionBus demo</title>
</svelte:head>

<main class="demo">
	<section class="panel">
		<div>
			<p class="eyebrow">ActionBus demo</p>
			<h1>Typed live updates over one shared socket</h1>
			<p class="intro">
				This route subscribes to <code>project:demo</code>. Submit the form in another tab and this
				page updates through the ActionBus broadcast.
			</p>
		</div>

		<div class="status" data-connected={$connection.connected}>
			<span></span>
			{$connection.connected ? 'Connected' : $connection.reconnecting ? 'Reconnecting' : 'Offline'}
		</div>
	</section>

	{#if $errors.length > 0}
		<section class="errors">
			<h2>Subscription errors</h2>
			{#each $errors as error (error.receivedAt + error.code + error.channel)}
				<p>
					<strong>{error.code}</strong>
					<span>{error.message}</span>
				</p>
			{/each}
		</section>
	{/if}

	<section class="workspace">
		<div class="task-list">
			<h2>Live task</h2>
			{#each $tasks as task (task.id)}
				<article>
					<strong>{task.title}</strong>
					<small>{task.id}</small>
				</article>
			{/each}
		</div>

		<form method="POST" action="?/broadcast" use:enhance>
			<label for="title">Broadcast a new title</label>
			<div>
				<input id="title" name="title" placeholder="Ship the ActionBus demo" />
				<button>Broadcast</button>
			</div>
		</form>
	</section>
</main>

<style>
	.demo {
		min-height: 100svh;
		padding: 48px;
		background: #f7f8fa;
		color: #17202a;
		font-family:
			Inter,
			ui-sans-serif,
			system-ui,
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			sans-serif;
	}

	.panel,
	.workspace {
		width: min(960px, 100%);
		margin: 0 auto;
	}

	.panel {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 24px;
		padding-bottom: 32px;
		border-bottom: 1px solid #d7dde5;
	}

	.eyebrow,
	small,
	label {
		color: #627084;
		font-size: 0.86rem;
		font-weight: 650;
	}

	.eyebrow {
		margin: 0 0 10px;
		text-transform: uppercase;
	}

	h1,
	h2,
	p {
		margin: 0;
	}

	h1 {
		max-width: 720px;
		font-size: clamp(2.2rem, 7vw, 4.7rem);
		line-height: 0.98;
		letter-spacing: 0;
	}

	h2 {
		font-size: 1rem;
	}

	.intro {
		max-width: 620px;
		margin-top: 18px;
		color: #455469;
		line-height: 1.6;
	}

	code {
		border-radius: 4px;
		padding: 2px 5px;
		background: #e8edf4;
	}

	.status {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-width: 132px;
		border: 1px solid #cdd5df;
		border-radius: 6px;
		padding: 8px 10px;
		background: white;
		color: #455469;
		font-size: 0.9rem;
		font-weight: 650;
	}

	.status span {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: #b74f4f;
	}

	.status[data-connected='true'] span {
		background: #25845a;
	}

	.workspace {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(280px, 360px);
		gap: 28px;
		padding-top: 32px;
	}

	.errors {
		width: min(960px, 100%);
		margin: 24px auto 0;
		border: 1px solid #e3b7b7;
		border-radius: 8px;
		background: #fff8f8;
		padding: 16px 18px;
	}

	.errors p {
		display: grid;
		gap: 4px;
		margin-top: 12px;
		color: #7c2f2f;
	}

	.errors span {
		color: #5f4040;
	}

	.task-list,
	form {
		border: 1px solid #d7dde5;
		border-radius: 8px;
		background: white;
		padding: 18px;
	}

	article {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		margin-top: 16px;
		border-top: 1px solid #edf1f5;
		padding-top: 16px;
	}

	form div {
		display: flex;
		gap: 10px;
		margin-top: 10px;
	}

	input {
		min-width: 0;
		flex: 1;
		border: 1px solid #cdd5df;
		border-radius: 6px;
		padding: 10px 12px;
		font: inherit;
	}

	button {
		border: 0;
		border-radius: 6px;
		padding: 10px 14px;
		background: #1f6feb;
		color: white;
		font: inherit;
		font-weight: 700;
	}

	@media (max-width: 760px) {
		.demo {
			padding: 28px 18px;
		}

		.panel,
		.workspace,
		form div {
			display: grid;
			grid-template-columns: 1fr;
		}
	}
</style>
