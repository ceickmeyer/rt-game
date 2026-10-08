<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { ALL_DAYS, gameDay, localDay, nextGameDay } from '#lib/day.js';
	import { supabase } from '#lib/supabase.js';

	type Movie = {
		imdb_id: string;
		title: string;
		year: number | null;
		poster: string | null;
		critic: number;
		audience: number;
		votes: number | null;
	};

	const avg = (m: Movie) => (m.critic + m.audience) / 2;
	const gap = (m: Movie) => Math.abs(m.critic - m.audience);

	// Sorting by numbers never shows them; only the spoiler cells do
	const SORTS: Record<string, { label: string; compare?: (a: Movie, b: Movie) => number }> = {
		shuffle: { label: 'Shuffle' },
		spread: { label: 'Mix: alternate high / low rated' },
		avgHigh: { label: 'Highest rated (average)', compare: (a, b) => avg(b) - avg(a) },
		avgLow: { label: 'Lowest rated (average)', compare: (a, b) => avg(a) - avg(b) },
		criticHigh: { label: 'Critics: high → low', compare: (a, b) => b.critic - a.critic },
		criticLow: { label: 'Critics: low → high', compare: (a, b) => a.critic - b.critic },
		audienceHigh: { label: 'Audience: high → low', compare: (a, b) => b.audience - a.audience },
		audienceLow: { label: 'Audience: low → high', compare: (a, b) => a.audience - b.audience },
		gapBig: { label: 'Biggest gap between scores', compare: (a, b) => gap(b) - gap(a) },
		gapSmall: { label: 'Smallest gap between scores', compare: (a, b) => gap(a) - gap(b) },
		criticsMore: {
			label: 'Critics liked it more',
			compare: (a, b) => b.critic - b.audience - (a.critic - a.audience)
		},
		audienceMore: {
			label: 'Audience liked it more',
			compare: (a, b) => b.audience - b.critic - (a.audience - a.critic)
		},
		newest: { label: 'Newest first', compare: (a, b) => (b.year ?? 0) - (a.year ?? 0) },
		oldest: { label: 'Oldest first', compare: (a, b) => (a.year ?? 0) - (b.year ?? 0) },
		title: { label: 'Title A → Z', compare: (a, b) => a.title.localeCompare(b.title) },
		// IMDb votes stand in for how many players will have seen it; unknown counts sort as least known
		knownLeast: { label: 'Least known first (IMDb votes)', compare: (a, b) => (a.votes ?? 0) - (b.votes ?? 0) },
		knownMost: { label: 'Most known first (IMDb votes)', compare: (a, b) => (b.votes ?? 0) - (a.votes ?? 0) }
	};

	function shuffle<T>(items: T[]) {
		const a = [...items];
		for (let i = a.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[a[i], a[j]] = [a[j], a[i]];
		}
		return a;
	}

	// Highest, lowest, 2nd highest, 2nd lowest... so good and bad movies alternate day to day
	function spread(items: Movie[]) {
		const sorted = [...items].sort((a, b) => avg(b) - avg(a));
		const out: Movie[] = [];
		while (sorted.length) {
			out.push(sorted.shift()!);
			if (sorted.length) out.push(sorted.pop()!);
		}
		return out;
	}

	type Status = 'loading' | 'ready' | 'denied' | 'error';
	let status = $state<Status>('loading');
	let message = $state('');
	let email = $state('');
	let saving = $state(false);
	let played = $state<{ day: string; movie: Movie }[]>([]);
	let saved = $state<Movie[]>([]);
	let removed = $state<Movie[]>([]);
	let playDays = $state<number[]>(ALL_DAYS);

	// Editable copy of the saved order; resets whenever fresh data arrives (load, save, revert)
	let queue = $derived<Movie[]>(saved.map((m) => ({ ...m })));
	let dirty = $derived(queue.map((m) => m.imdb_id).join() !== saved.map((m) => m.imdb_id).join());

	// PostgREST caps responses at 1000 rows, so page through everything
	async function allMovies() {
		const rows: (Movie & { queue_pos: number | null; removed: boolean })[] = [];
		for (let from = 0; ; from += 1000) {
			const { data, error } = await supabase
				.from('rt_movies')
				.select('imdb_id, title, year, poster, critic, audience, votes, queue_pos, removed')
				.order('queue_pos', { nullsFirst: false })
				.order('imdb_id')
				.range(from, from + 999);
			if (error) throw error;
			rows.push(...data);
			if (data.length < 1000) return rows;
		}
	}

	async function load() {
		const {
			data: { session }
		} = await supabase.auth.getSession();
		if (!session) return;
		email = session.user.email ?? '';
		try {
			// RLS only lets accounts listed in rt_admins see these rows
			const { data: admin } = await supabase
				.from('rt_admins')
				.select('user_id')
				.eq('user_id', session.user.id)
				.maybeSingle();
			if (!admin) {
				status = 'denied';
				return;
			}
			const [movies, daily, settings] = await Promise.all([
				allMovies(),
				supabase.from('rt_daily').select('day, imdb_id').order('day'),
				supabase.from('rt_settings').select('play_days').maybeSingle()
			]);
			if (daily.error) throw daily.error;
			if (settings.error) throw settings.error;
			playDays = settings.data?.play_days ?? ALL_DAYS;
			const byId = new Map(movies.map((m) => [m.imdb_id, m]));
			const used = new Set(daily.data.map((d) => d.imdb_id));
			played = daily.data.map((d) => ({ day: d.day, movie: byId.get(d.imdb_id)! }));
			saved = movies.filter((m) => !used.has(m.imdb_id) && !m.removed);
			removed = movies.filter((m) => !used.has(m.imdb_id) && m.removed);
			status = 'ready';
		} catch (e) {
			message = e instanceof Error ? e.message : String((e as { message?: string }).message ?? e);
			status = 'error';
		}
	}

	async function save() {
		saving = true;
		message = '';
		const { error } = await supabase.rpc('rt_set_queue', { ids: queue.map((m) => m.imdb_id) });
		saving = false;
		if (error) message = error.message;
		else await load(); // picks up any day that got assigned while editing
	}

	// Mon first; values are 0 = Sunday like Date.getDay()
	const WEEK = [1, 2, 3, 4, 5, 6, 0].map((n) => ({
		n,
		label: new Date(2026, 0, 4 + n).toLocaleDateString(undefined, { weekday: 'short' })
	}));

	// Saves straight away; the last day left on can't be unchecked
	async function toggleDay(n: number) {
		const before = playDays;
		const next = playDays.includes(n) ? playDays.filter((d) => d !== n) : [...playDays, n].sort();
		if (!next.length) return;
		playDays = next;
		message = '';
		const { error } = await supabase.from('rt_settings').update({ play_days: next }).eq('id', 1);
		if (error) {
			playDays = before;
			message = error.message;
		}
	}

	// Takes the selected movies out of play. Saved right away, and any unsaved reordering is kept.
	async function removeSelected() {
		const ids = queue.filter((m) => selected.has(m.imdb_id)).map((m) => m.imdb_id);
		message = '';
		const { error } = await supabase.rpc('rt_set_removed', { ids, remove: true });
		if (error) {
			message = error.message;
			return;
		}
		const gone = (m: Movie) => selected.has(m.imdb_id);
		const edited = queue.filter((m) => !gone(m));
		removed = [...queue.filter(gone), ...removed];
		saved = saved.filter((m) => !gone(m));
		queue = edited;
		selected.clear();
	}

	// Puts a removed movie back, at the end of the queue
	async function restore(m: Movie) {
		message = '';
		const { error } = await supabase.rpc('rt_set_removed', { ids: [m.imdb_id], remove: false });
		if (error) {
			message = error.message;
			return;
		}
		const edited = [...queue, m];
		removed = removed.filter((r) => r.imdb_id !== m.imdb_id);
		saved = [...saved, m];
		queue = edited;
	}

	function revert() {
		saved = [...saved];
	}

	$effect(() => {
		load();
	});
	const selected = new SvelteSet<string>();
	const revealed = new SvelteSet<string>();
	let showNumbers = $state(false);
	let sortKey = $state('shuffle');
	let rangeFrom = $state<number>();
	let rangeTo = $state<number>();
	let lastClicked = -1;

	// Projected dates, one per play day: the queue starts at the current play day if it isn't assigned yet,
	// otherwise at the play day after the last assigned one
	let dates = $derived.by(() => {
		const last = played.at(-1)?.day;
		let day = gameDay(localDay(), playDays);
		if (last && last >= day) day = nextGameDay(last, playDays);
		const out: string[] = [];
		for (let i = 0; i < queue.length; i++, day = nextGameDay(day, playDays)) out.push(day);
		return out;
	});

	function dateFor(i: number) {
		const [y, m, d] = dates[i].split('-').map(Number);
		return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
	}

	function update(next: Movie[]) {
		queue = next;
	}

	// Sorts only the selected movies, putting them back into the same slots they came from.
	// With nothing selected, sorts the whole queue.
	function applySort() {
		const slots = selected.size
			? queue.flatMap((m, i) => (selected.has(m.imdb_id) ? [i] : []))
			: queue.map((_, i) => i);
		const group = slots.map((i) => queue[i]);
		const { compare } = SORTS[sortKey];
		const sorted =
			sortKey === 'shuffle' ? shuffle(group) : sortKey === 'spread' ? spread(group) : group.sort(compare);
		const next = [...queue];
		slots.forEach((slot, k) => (next[slot] = sorted[k]));
		update(next);
	}

	function moveTo(from: number, to: number) {
		to = Math.max(0, Math.min(queue.length - 1, to));
		if (to === from) return;
		const next = [...queue];
		const [m] = next.splice(from, 1);
		next.splice(to, 0, m);
		update(next);
	}

	function moveSelected(where: 'top' | 'bottom') {
		const picked = queue.filter((m) => selected.has(m.imdb_id));
		const rest = queue.filter((m) => !selected.has(m.imdb_id));
		update(where === 'top' ? [...picked, ...rest] : [...rest, ...picked]);
	}

	// Shift-click selects (or clears) everything between this row and the last one clicked
	function toggle(i: number, e: MouseEvent) {
		const id = queue[i].imdb_id;
		const on = !selected.has(id);
		const [a, b] = e.shiftKey && lastClicked >= 0 ? [Math.min(lastClicked, i), Math.max(lastClicked, i)] : [i, i];
		for (let k = a; k <= b; k++) {
			if (on) selected.add(queue[k].imdb_id);
			else selected.delete(queue[k].imdb_id);
		}
		lastClicked = i;
	}

	function selectRange() {
		if (!rangeFrom || !rangeTo) return;
		selected.clear();
		const [a, b] = [Math.min(rangeFrom, rangeTo), Math.max(rangeFrom, rangeTo)];
		queue.slice(a - 1, b).forEach((m) => selected.add(m.imdb_id));
	}

	const compact = (n: number | null) =>
		n == null ? '?' : n.toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 1 });

	const thumb = (m: Movie) => m.poster?.replace('/original/', '/w92/');

	function beforeUnload(e: BeforeUnloadEvent) {
		if (dirty) e.preventDefault();
	}
</script>

<svelte:head>
	<title>Tomatle · Admin</title>
</svelte:head>

<svelte:window onbeforeunload={beforeUnload} />

{#snippet spoiler(id: string, value: string)}
	<button
		type="button"
		class="spoiler"
		class:shown={showNumbers || revealed.has(id)}
		onclick={() => revealed.add(id)}
		title="Click to reveal">{value}</button
	>
{/snippet}

<main>
	{#if status === 'loading'}
		<p class="center muted">Loading…</p>
	{:else if status !== 'ready'}
		<div class="center">
			<p>{status === 'denied' ? `${email} isn't an admin for this game.` : message}</p>
			<button class="quiet" onclick={() => supabase.auth.signOut()}>Log out</button>
		</div>
	{:else}
		<header>
			<h1>Queue <span>{queue.length} upcoming</span></h1>
			<button disabled={!dirty || saving} onclick={save}>
				{saving ? 'Saving…' : dirty ? 'Save order' : 'Saved'}
			</button>
			<button class="quiet" disabled={!dirty || saving} onclick={revert}>Revert</button>
			<button class="quiet" onclick={() => supabase.auth.signOut()}>Log out</button>
		</header>
		{#if message}<p class="error">{message}</p>{/if}

		<div class="days">
			New movie on
			{#each WEEK as { n, label } (n)}
				<label class="check">
					<input
						type="checkbox"
						checked={playDays.includes(n)}
						disabled={playDays.length === 1 && playDays.includes(n)}
						onchange={() => toggleDay(n)}
					/>
					{label}
				</label>
			{/each}
		</div>

		<div class="tools">
			<div>
				<select bind:value={sortKey}>
					{#each Object.entries(SORTS) as [key, { label }]}
						<option value={key}>{label}</option>
					{/each}
				</select>
				<button type="button" onclick={applySort}>
					Sort {selected.size ? `${selected.size} selected` : 'all'}
				</button>
			</div>
			<div>
				Select #<input type="number" min="1" max={queue.length} bind:value={rangeFrom} />
				to <input type="number" min="1" max={queue.length} bind:value={rangeTo} />
				<button type="button" onclick={selectRange}>Select</button>
				<button type="button" class="quiet" disabled={!selected.size} onclick={() => selected.clear()}>
					Clear
				</button>
			</div>
			<div>
				<button type="button" disabled={!selected.size} onclick={() => moveSelected('top')}>
					Selected to top
				</button>
				<button type="button" disabled={!selected.size} onclick={() => moveSelected('bottom')}>
					Selected to bottom
				</button>
				<button type="button" class="danger" disabled={!selected.size} onclick={removeSelected}>
					Remove selected
				</button>
				<label class="check"><input type="checkbox" bind:checked={showNumbers} /> Show numbers</label>
			</div>
		</div>

		{#if played.length}
			<details>
				<summary>Already assigned ({played.length}), locked</summary>
				<ol>
					{#each played as p (p.day)}
						<li><span class="muted">{p.day}</span> {p.movie.title} <span class="muted">{p.movie.year}</span></li>
					{/each}
				</ol>
			</details>
		{/if}

		{#if removed.length}
			<details>
				<summary>Removed ({removed.length}), never played</summary>
				<ul>
					{#each removed as m (m.imdb_id)}
						<li>
							{m.title} <span class="muted">{m.year}</span>
							<button type="button" class="quiet small" onclick={() => restore(m)}>Restore</button>
						</li>
					{/each}
				</ul>
			</details>
		{/if}

		<table>
			<thead>
				<tr>
					<th></th>
					<th>#</th>
					<th>Date</th>
					<th></th>
					<th class="left">Movie</th>
					<th>Critics</th>
					<th>Audience</th>
					<th>Gap</th>
					<th title="IMDb votes: how well known it is">Votes</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each queue as m, i (m.imdb_id)}
					<tr class:selected={selected.has(m.imdb_id)}>
						<td>
							<input
								type="checkbox"
								checked={selected.has(m.imdb_id)}
								onclick={(e) => toggle(i, e)}
							/>
						</td>
						<td>
							<input
								class="pos"
								type="number"
								min="1"
								max={queue.length}
								value={i + 1}
								onchange={(e) => moveTo(i, +e.currentTarget.value - 1)}
							/>
						</td>
						<td class="muted nowrap">{dateFor(i)}</td>
						<td>{#if thumb(m)}<img src={thumb(m)} alt="" loading="lazy" />{/if}</td>
						<td class="left">{m.title} <span class="muted">{m.year}</span></td>
						<td>{@render spoiler(m.imdb_id, `${m.critic}`)}</td>
						<td>{@render spoiler(m.imdb_id, `${m.audience}`)}</td>
						<td>{@render spoiler(m.imdb_id, `${gap(m)}`)}</td>
						<td class="muted nowrap">{compact(m.votes)}</td>
						<td class="nowrap">
							<button type="button" class="quiet" disabled={i === 0} onclick={() => moveTo(i, i - 1)}>↑</button>
							<button type="button" class="quiet" disabled={i === queue.length - 1} onclick={() => moveTo(i, i + 1)}>↓</button>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</main>

<style>
	main {
		max-width: 900px;
		margin: 0 auto;
		padding: 16px;
	}
	.center {
		margin-top: 30vh;
		text-align: center;
	}
	.error {
		width: 100%;
		color: #d33;
	}
	header {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	h1 {
		flex: 1;
		margin: 0;
		font-size: 1.3rem;
		font-weight: 600;
	}
	h1 span,
	.muted,
	summary {
		color: var(--muted);
		font-weight: 400;
	}
	h1 span {
		font-size: 0.9rem;
	}
	.tools {
		position: sticky;
		top: 0;
		z-index: 1;
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin: 12px 0;
		padding: 10px 0;
		background: var(--bg);
		border-bottom: 1px solid var(--track);
	}
	.tools div {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	.tools input[type='number'] {
		width: 4.5em;
	}
	.check {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-left: auto;
	}
	details {
		margin-bottom: 12px;
	}
	.days {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
		margin-top: 12px;
	}
	.days .check {
		margin-left: 0;
	}
	ol {
		font-size: 0.9rem;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9rem;
	}
	th {
		font-weight: 500;
		color: var(--muted);
	}
	td,
	th {
		padding: 4px 6px;
		text-align: center;
		border-bottom: 1px solid var(--track);
	}
	.left {
		text-align: left;
	}
	.nowrap {
		white-space: nowrap;
	}
	tr.selected {
		background: color-mix(in srgb, var(--fg) 8%, transparent);
	}
	img {
		display: block;
		width: 28px;
		height: 42px;
		object-fit: cover;
		border-radius: 2px;
	}
	input,
	select,
	button {
		font: inherit;
		color: inherit;
	}
	input[type='number'],
	select {
		padding: 4px 6px;
		background: var(--bg);
		border: 1px solid var(--track);
		border-radius: 4px;
	}
	.pos {
		width: 3.8em;
	}
	button {
		padding: 5px 10px;
		color: var(--bg);
		background: var(--fg);
		border: 0;
		border-radius: 4px;
		cursor: pointer;
	}
	button.quiet {
		color: var(--fg);
		background: transparent;
		border: 1px solid var(--track);
	}
	button.danger {
		color: var(--on-accent);
		background: var(--accent);
	}
	button.small {
		padding: 1px 8px;
		font-size: 0.85em;
	}
	ul {
		font-size: 0.9rem;
		padding-left: 1.2em;
	}
	ul li {
		margin: 2px 0;
	}
	button:disabled {
		opacity: 0.35;
		cursor: default;
	}
	/* hidden numbers: a solid bar until clicked (reveals the whole row) or "Show numbers" is on */
	.spoiler {
		min-width: 2.6em;
		padding: 1px 6px;
		color: transparent;
		background: var(--muted);
		font-variant-numeric: tabular-nums;
		user-select: none;
	}
	.spoiler.shown {
		color: var(--fg);
		background: transparent;
		cursor: default;
	}
</style>
