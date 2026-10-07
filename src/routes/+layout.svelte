<script lang="ts">
	let { children } = $props();
</script>

<svelte:head>
	<title>Tomatle</title>
	<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🍅</text></svg>" />
</svelte:head>

{@render children()}

<style>
	:global(:root) {
		color-scheme: light dark;
		--fg: #111;
		--bg: #fff;
		--muted: #888;
		--track: #ddd;
	}
	@media (prefers-color-scheme: dark) {
		:global(:root) {
			--fg: #eee;
			--bg: #111;
			--track: #333;
		}
	}
	:global(body) {
		margin: 0;
		font: 16px/1.4 system-ui, sans-serif;
		color: var(--fg);
		background: var(--bg);
	}
</style>
