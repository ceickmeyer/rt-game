// The player's local calendar date as YYYY-MM-DD, so the daily movie rolls over at their midnight
export function localDay(date = new Date()) {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

export function formatDay(day: string) {
	const [y, m, d] = day.split('-').map(Number);
	return new Date(y, m - 1, d).toLocaleDateString(undefined, {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});
}

const DAY_MS = 86_400_000;
const toMs = (day: string) => Date.parse(`${day}T00:00:00Z`);

export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

export function addDays(day: string, n: number) {
	return new Date(toMs(day) + n * DAY_MS).toISOString().slice(0, 10);
}

// 0 = Sunday, matching Date.getDay() and rt_settings.play_days
export function weekday(day: string) {
	return new Date(toMs(day)).getUTCDay();
}

// New movies only come out on the chosen weekdays; any other day keeps the most recent one
export function gameDay(day: string, playDays: number[]) {
	for (let i = 0; i < 7; i++) {
		const d = addDays(day, -i);
		if (playDays.includes(weekday(d))) return d;
	}
	return day;
}

// The first play day after `day`, i.e. when the next movie comes out
export function nextGameDay(day: string, playDays: number[]) {
	for (let i = 1; i <= 7; i++) {
		const d = addDays(day, i);
		if (playDays.includes(weekday(d))) return d;
	}
	return addDays(day, 1);
}
