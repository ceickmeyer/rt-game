<script lang="ts">
	import { goto } from '$app/navigation';
	import { supabase } from '#lib/supabase.js';

	let { children } = $props();
	let ready = $state(false);

	// Same flow as tutoring-app: no session -> login page, sign in/out -> redirect
	$effect(() => {
		let sub: { unsubscribe(): void } | null = null;

		(async () => {
			const {
				data: { session }
			} = await supabase.auth.getSession();
			if (!session && location.pathname !== '/admin/login') await goto('/admin/login');
			if (session && location.pathname === '/admin/login') await goto('/admin');
			ready = true;

			const {
				data: { subscription }
			} = supabase.auth.onAuthStateChange((event) => {
				if (event === 'SIGNED_OUT') goto('/admin/login');
				else if (event === 'SIGNED_IN' && location.pathname === '/admin/login') goto('/admin');
			});
			sub = subscription;
		})();

		return () => sub?.unsubscribe();
	});
</script>

{#if ready}
	{@render children()}
{/if}
