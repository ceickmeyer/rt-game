// Points per slider. Two sliders, so a perfect game is 2 * MAX_POINTS.
export const MAX_POINTS = 50;
// Guesses this far off (or more) score zero.
export const RANGE = 50;
// Shape of the dropoff. 1 = linear, >1 = points fall away faster near the target.
export const CURVE = 1.5;

export function points(guess: number, actual: number) {
	const off = Math.min(Math.abs(guess - actual), RANGE);
	return Math.round(MAX_POINTS * (1 - off / RANGE) ** CURVE);
}
