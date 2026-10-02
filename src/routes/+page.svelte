<script lang="ts">
	import { enhance } from '$app/forms';
	import { fly, scale } from 'svelte/transition';
	import { MAX_POINTS } from '#lib/score.js';
	import { unlock, tick, ding, finale } from '#lib/sound.js';
	import { formatDay, localDay } from '#lib/day.js';

	type Guess = { guess: number; actual: number; points: number };
	type Result = { critic: Guess; audience: Guess };

	let { data } = $props();

	// One play per day: the finished result is kept in the browser so a refresh can't replay
	const saved = load();

	let critic = $state(saved?.critic.guess ?? 50);
	let audience = $state(saved?.audience.guess ?? 50);
	let result = $state<Result | null>(saved);
	// where each reveal icon currently sits on its track (null = not dropped yet)
	let criticAt = $state<number | null>(saved?.critic.actual ?? null);
	let audienceAt = $state<number | null>(saved?.audience.actual ?? null);
	let copied = $state(false);
	// reveal steps: 0 guessing, 1 critic points shown, 2 audience points shown, 3 total shown
	let step = $state(saved ? 3 : 0);
	let total = $derived(result ? result.critic.points + result.audience.points : 0);
	let shownTotal = $state(saved ? saved.critic.points + saved.audience.points : 0);
	let untilNext = $state(timeToMidnight());

	// TMDB "original" posters are huge; w500 is plenty
	let poster = $derived(data.movie.poster?.replace('/original/', '/w500/'));

	function load(): Result | null {
		try {
			const stored = JSON.parse(localStorage.getItem(`rt-game:${data.day}`) ?? 'null');
			return stored?.imdb_id === data.movie.imdb_id ? stored.result : null;
		} catch {
			return null;
		}
	}

	function save(r: Result) {
		try {
			localStorage.setItem(`rt-game:${data.day}`, JSON.stringify({ imdb_id: data.movie.imdb_id, result: r }));
		} catch {}
	}

	function timeToMidnight() {
		const now = new Date();
		const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
		const mins = Math.ceil((midnight.getTime() - now.getTime()) / 60_000);
		return `${Math.floor(mins / 60)}h ${mins % 60}m`;
	}

	// Roll over to the new movie at the player's midnight, even if the tab was left open
	$effect(() => {
		const check = () => {
			if (localDay() !== data.day) location.reload();
			untilNext = timeToMidnight();
		};
		const timer = setInterval(check, 30_000);
		document.addEventListener('visibilitychange', check);
		return () => {
			clearInterval(timer);
			document.removeEventListener('visibilitychange', check);
		};
	});

	const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

	// Ease-out glide that ticks once per whole number passed, so the ticks slow as it settles
	function glide(from: number, to: number, ms: number, set: (v: number) => void, ticks = true) {
		return new Promise<void>((resolve) => {
			const start = performance.now();
			let last = from;
			const frame = (now: number) => {
				const t = Math.min((now - start) / ms, 1);
				const v = Math.round(from + (to - from) * (1 - (1 - t) ** 3));
				if (v !== last && ticks) tick(t);
				last = v;
				set(v);
				if (t < 1) requestAnimationFrame(frame);
				else resolve();
			};
			requestAnimationFrame(frame);
		});
	}

	// Whole reveal stays under ~2s: per slider a 120ms drop + glide of at most 550ms + 120ms beat, then a 300ms count-up
	async function reveal({ critic: c, audience: a }: Result) {
		const total = c.points + a.points;
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
			criticAt = c.actual;
			audienceAt = a.actual;
			shownTotal = total;
			step = 3;
			finale(total / (MAX_POINTS * 2));
			return;
		}
		const duration = (r: Guess) => Math.min(200 + Math.abs(r.guess - r.actual) * 8, 550);

		criticAt = c.guess;
		await wait(120); // let the icon drop in at the guess before it slides
		await glide(c.guess, c.actual, duration(c), (v) => (criticAt = v));
		step = 1;
		ding(c.points / MAX_POINTS);
		await wait(120);

		audienceAt = a.guess;
		await wait(120);
		await glide(a.guess, a.actual, duration(a), (v) => (audienceAt = v));
		step = 2;
		ding(a.points / MAX_POINTS);
		await wait(120);

		step = 3;
		await glide(0, total, 300, (v) => (shownTotal = v), false);
		finale(total / (MAX_POINTS * 2));
	}

	async function share() {
		if (!result) return;
		const text = [
			`🍅 RT Game · ${formatDay(data.day)}`,
			`${data.movie.title} (${data.movie.year})`,
			`Critics ${result.critic.points}/${MAX_POINTS}`,
			`Audience ${result.audience.points}/${MAX_POINTS}`,
			`Total ${total}/${MAX_POINTS * 2}`,
			location.origin
		].join('\n');
		await navigator.clipboard.writeText(text);
		copied = true;
	}
</script>

{#snippet slider(
	name: string,
	label: string,
	value: number,
	setValue: (v: number) => void,
	icons: [good: string, bad: string],
	result: { guess: number; points: number } | undefined,
	at: number | null,
	shown: boolean
)}
	<label>
		<span>{label}</span>
		<span class="track">
			{#if result && at !== null}
				<i class="gap" style:left="calc(8 * var(--u) + (100% - 16 * var(--u)) * {Math.min(result.guess, at) / 100})" style:width="calc((100% - 16 * var(--u)) * {Math.abs(at - result.guess) / 100})"></i>
			{/if}
			<input type="range" {name} min="0" max="100" {value} oninput={(e) => setValue(+e.currentTarget.value)} disabled={!!result} />
			{#if at !== null}
				<!-- RT calls 60%+ fresh / positive, so the icon flips as it crosses 60 -->
				<img class="icon" src={at >= 60 ? icons[0] : icons[1]} alt="" style:left="calc(8 * var(--u) + (100% - 16 * var(--u)) * {at / 100})" in:fly={{ y: -16, duration: 120 }} />
			{/if}
		</span>
		<b>{at ?? value}%</b>
	</label>
	<p>
		{#if result && shown}
			<span in:scale={{ start: 0.6, duration: 200 }}>guessed {result.guess} · <b>+{result.points}</b></span>
		{/if}
	</p>
{/snippet}

<main>
	<div class="poster">
		{#if poster}
			<img src={poster} alt={data.movie.title} />
		{/if}
	</div>
	<h1>{data.movie.title} <span>{data.movie.year}</span></h1>

	<form
		method="POST"
		use:enhance={() => {
			unlock(); // inside the click, so audio is allowed
			return async ({ result: res }) => {
				if (res.type !== 'success' || !res.data) return;
				result = res.data as Result;
				save(result);
				reveal(result);
			};
		}}
	>
		<input type="hidden" name="imdb_id" value={data.movie.imdb_id} />

		{@render slider('critic', 'Critics', critic, (v) => (critic = v), ['/icons/fresh.webp', '/icons/rotten.webp'], result?.critic, criticAt, step >= 1)}
		{@render slider('audience', 'Audience', audience, (v) => (audience = v), ['/icons/popcorn.webp', '/icons/spilled.webp'], result?.audience, audienceAt, step >= 2)}

		<div class="end">
			{#if !result}
				<button>Guess</button>
			{:else if step >= 3}
				<div class="row" in:scale={{ start: 0.8, duration: 250 }}>
					<h2>{shownTotal}<span> / {MAX_POINTS * 2}</span></h2>
					<button type="button" onclick={share}>{copied ? 'Copied' : 'Copy score'}</button>
				</div>
				<small>next movie in {untilNext}</small>
			{/if}
		</div>
	</form>
</main>

<style>
	/* Everything fits in one screen: the poster takes whatever height the controls leave.
	   --u is one "pixel" of the design, scaled up to fill big windows (height- or width-bound) and never below 1px */
	main {
		--u: clamp(1px, min(100dvh / 760, 100vw / 392), 2px);
		box-sizing: border-box;
		font-size: calc(16 * var(--u));
		display: flex;
		flex-direction: column;
		height: 100vh;
		height: 100dvh;
		max-width: calc(360 * var(--u));
		margin: 0 auto;
		justify-content: center;
		padding: calc(16 * var(--u));
		text-align: center;
	}
	/* poster shrinks to fit short screens; on tall ones the poster and controls stay together, centered */
	.poster {
		flex: 0 1 auto;
		min-height: 0;
		display: flex;
		justify-content: center;
	}
	.poster img {
		width: 100%;
		max-height: 100%;
		object-fit: contain;
	}
	h1 {
		font-size: 1.05em;
		font-weight: 500;
		margin: calc(10 * var(--u)) 0 calc(4 * var(--u));
	}
	h1 span,
	p {
		color: var(--muted);
	}
	h2 {
		margin: 0;
		font-size: 1.6em;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	h2 span {
		font-size: 0.625em;
		font-weight: 400;
		color: var(--muted);
	}
	label {
		display: grid;
		grid-template-columns: 4.5em 1fr 3em;
		align-items: center;
		gap: calc(8 * var(--u));
		text-align: left;
		margin-top: calc(6 * var(--u));
	}
	label b {
		font-weight: 500;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.track {
		position: relative;
		display: flex;
		height: calc(28 * var(--u));
		align-items: center;
	}
	/* custom range so the calc(16 * var(--u)) thumb lines up with the guess marker and gap */
	input[type='range'] {
		appearance: none;
		width: 100%;
		height: calc(20 * var(--u));
		margin: 0;
		background: transparent;
		cursor: pointer;
	}
	input[type='range']:disabled {
		cursor: default;
	}
	input[type='range']::-webkit-slider-runnable-track {
		height: calc(4 * var(--u));
		border-radius: calc(2 * var(--u));
		background: var(--track);
	}
	input[type='range']::-moz-range-track {
		height: calc(4 * var(--u));
		border-radius: calc(2 * var(--u));
		background: var(--track);
	}
	input[type='range']::-webkit-slider-thumb {
		appearance: none;
		width: calc(16 * var(--u));
		height: calc(16 * var(--u));
		margin-top: calc(-6 * var(--u));
		border-radius: 50%;
		background: var(--fg);
	}
	input[type='range']::-moz-range-thumb {
		width: calc(16 * var(--u));
		height: calc(16 * var(--u));
		border: 0;
		border-radius: 50%;
		background: var(--fg);
	}
	.gap,
	.icon {
		position: absolute;
		top: 50%;
		pointer-events: none;
	}
	.gap {
		height: calc(4 * var(--u));
		margin-top: calc(-2 * var(--u));
		background: var(--muted);
	}
	.icon {
		width: calc(26 * var(--u));
		height: calc(26 * var(--u));
		object-fit: contain;
		transform: translate(-50%, -50%);
		filter: drop-shadow(0 calc(1 * var(--u)) calc(2 * var(--u)) rgb(0 0 0 / 0.3));
	}
	p {
		height: 1.3em;
		margin: calc(2 * var(--u)) 0 0;
		font-size: 0.85em;
		text-align: right;
	}
	p span {
		display: inline-block;
	}
	p b {
		color: var(--fg);
		font-weight: 600;
	}
	/* same height before and after guessing, so nothing shifts */
	.end {
		height: calc(72 * var(--u));
		margin-top: calc(8 * var(--u));
	}
	small {
		display: block;
		margin-top: calc(6 * var(--u));
		color: var(--muted);
	}
	.row {
		display: flex;
		align-items: center;
		gap: calc(16 * var(--u));
	}
	button {
		flex: 1;
		width: 100%;
		padding: calc(10 * var(--u));
		font: inherit;
		color: var(--bg);
		background: var(--fg);
		border: 0;
		border-radius: calc(4 * var(--u));
		cursor: pointer;
	}
</style>
