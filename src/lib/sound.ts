// Tiny Web Audio blips, no audio files. Call unlock() from a click so browsers allow sound.
let ctx: AudioContext | undefined;
let lastTick = 0;

export function unlock() {
	ctx ??= new AudioContext();
	if (ctx.state === 'suspended') ctx.resume();
}

function blip(freq: number, ms: number, volume: number, type: OscillatorType = 'sine', delay = 0) {
	if (!ctx) return;
	const t = ctx.currentTime + delay;
	const osc = ctx.createOscillator();
	const gain = ctx.createGain();
	osc.type = type;
	osc.frequency.value = freq;
	gain.gain.setValueAtTime(volume, t);
	gain.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
	osc.connect(gain).connect(ctx.destination);
	osc.start(t);
	osc.stop(t + ms / 1000);
}

// progress 0..1 nudges the pitch up as the slider settles
export function tick(progress = 0) {
	const now = performance.now();
	if (now - lastTick < 22) return; // big jumps would otherwise buzz
	lastTick = now;
	blip(1500 + progress * 700, 12, 0.04, 'triangle');
}

// pitch rises with how well the guess scored (0..1)
export function ding(quality: number) {
	const base = 330 + quality * 330;
	blip(base, 180, 0.12);
	if (quality === 1) blip(base * 1.5, 260, 0.1, 'sine', 0.08); // perfect: add a fifth
}

export function finale(quality: number) {
	const base = 392 + quality * 196;
	[1, 1.25, 1.5].forEach((m, i) => blip(base * m, 300, 0.08, 'sine', i * 0.06));
}
