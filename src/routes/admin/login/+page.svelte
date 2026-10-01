<script lang="ts">
	import { enhance } from '$app/forms';

	let { form } = $props();
</script>

<svelte:head>
	<title>RT Game · Admin</title>
</svelte:head>

<form method="POST" use:enhance>
	<input type="email" name="email" placeholder="Email" autocomplete="email" required />
	<input type="password" name="password" placeholder="Password" autocomplete="current-password" required />
	<button>Log in</button>
	{#if form?.error}<p>{form.error}</p>{/if}
</form>

<style>
	form {
		display: flex;
		flex-direction: column;
		gap: 8px;
		max-width: 280px;
		margin: 30vh auto 0;
		padding: 0 16px;
	}
	input,
	button {
		padding: 8px 10px;
		font: inherit;
		color: inherit;
		background: var(--bg);
		border: 1px solid var(--track);
		border-radius: 4px;
	}
	button {
		color: var(--bg);
		background: var(--fg);
		border: 0;
		cursor: pointer;
	}
	p {
		margin: 0;
		color: #d33;
	}
</style>
