<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { SvelteSet } from 'svelte/reactivity';
	import { localDay } from '#lib/day.js';

	let { data, form } = $props();

	type Movie = {
		imdb_id: string;
		title: string;
		year: number | null;
		poster: string | null;
		critic: number;
		audience: number;
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
		title: { label: 'Title A → Z', compare: (a, b) => a.title.localeCompare(b.title) }
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

	// Editable copy of the saved order; resets whenever fresh data arrives (load, save, revert)
	let queue = $derived<Movie[]>(data.authed ? data.queue.map((m) => ({ ...m })) : []);
	let dirty = $derived(
		data.authed && queue.map((m) => m.imdb_id).join() !== data.queue.map((m) => m.imdb_id).join()
	);
	const selected = new SvelteSet<string>();
	const revealed = new SvelteSet<string>();
	let showNumbers = $state(false);
	let sortKey = $state('shuffle');
	let rangeFrom = $state<number>();
	let rangeTo = $state<number>();
	let lastClicked = -1;

	// Projected dates: the queue starts the day after the last assigned day, or today if today isn't assigned yet
	let start = $derived.by(() => {
		const today = localDay();
		const last = data.authed ? data.played.at(-1)?.day : undefined;
		const [y, m, d] = (last && last >= today ? last : today).split('-').map(Number);
		return new Date(y, m - 1, last && last >= today ? d + 1 : d);
	});

	function dateFor(i: number) {
		const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
		return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
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

	const thumb = (m: Movie) => m.poster?.replace('/original/', '/w92/');

	function beforeUnload(e: BeforeUnloadEvent) {
		if (dirty) e.preventDefault();
	}
</script>

<svelte:head>
	<title>RT Game · Admin</title>
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
	{#if !data.authed}
		<div class="denied">
			<p>{data.email} isn't an admin for this game.</p>
			<form method="POST" action="?/logout"><button class="quiet">Log out</button></form>
		</div>
	{:else}
		<header>
			<h1>Queue <span>{queue.length} upcoming</span></h1>
			<form
				method="POST"
				action="?/save"
				use:enhance={() =>
					async ({ result }) => {
						if (result.type === 'success') await invalidateAll();
					}}
			>
				<input type="hidden" name="order" value={JSON.stringify(queue.map((m) => m.imdb_id))} />
				<button disabled={!dirty}>{dirty ? 'Save order' : 'Saved'}</button>
				<button type="button" class="quiet" disabled={!dirty} onclick={() => invalidateAll()}>Revert</button>
			</form>
			<form method="POST" action="?/logout">
				<button class="quiet">Log out</button>
			</form>
		</header>
		{#if form && 'message' in form}<p class="error">{form.message}</p>{/if}

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
				<label class="check"><input type="checkbox" bind:checked={showNumbers} /> Show numbers</label>
			</div>
		</div>

		{#if data.played.length}
			<details>
				<summary>Already assigned ({data.played.length}), locked</summary>
				<ol>
					{#each data.played as p (p.day)}
						<li><span class="muted">{p.day}</span> {p.movie.title} <span class="muted">{p.movie.year}</span></li>
					{/each}
				</ol>
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
	.denied {
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
	header form {
		display: flex;
		gap: 8px;
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
