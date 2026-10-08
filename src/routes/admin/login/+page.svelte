<script lang="ts">
	import { supabase } from '#lib/supabase.js';

	let email = $state('');
	let password = $state('');
	let error = $state<string | null>(null);
	let loading = $state(false);

	async function signIn(e: Event) {
		e.preventDefault();
		loading = true;
		error = null;
		const { error: err } = await supabase.auth.signInWithPassword({ email, password });
		if (err) {
			error = err.message;
			loading = false;
		}
		// On success, onAuthStateChange in the admin layout handles the redirect
	}
</script>

<svelte:head>
	<title>Tomatle · Admin</title>
</svelte:head>

<form onsubmit={signIn}>
	<input type="email" bind:value={email} placeholder="Email" autocomplete="email" required />
	<input
		type="password"
		bind:value={password}
		placeholder="Password"
		autocomplete="current-password"
		required
	/>
	<button disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
	{#if error}<p>{error}</p>{/if}
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
		color: var(--on-accent);
		background: var(--accent);
		border: 0;
		cursor: pointer;
	}
	button:disabled {
		opacity: 0.5;
	}
	p {
		margin: 0;
		color: #d33;
	}
</style>
