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
