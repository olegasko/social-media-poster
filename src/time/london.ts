// The queue's times are UK wall-clock times ("2026-12-06T19:00"), which are
// GMT in winter and BST in summer. The platforms take an instant, so every
// time goes through here. A time the clocks skip (the last Sunday of March,
// 01:00–01:59) or repeat (the last Sunday of October, 01:00–01:59) is refused
// rather than guessed.

const parts = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  weekday: 'short',
});
// Fixed, because ICU's en-GB writes September as "Sept".
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const numeric = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function pick(format: Intl.DateTimeFormat, date: Date): Record<string, string> {
  return Object.fromEntries(format.formatToParts(date).map((p) => [p.type, p.value]));
}

/** The UK wall-clock time of an instant, in the queue's own format. */
export function londonWall(date: Date): string {
  const p = pick(numeric, date);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** "2026-12-06T19:00" (UK) → the instant it names. */
export function londonToUtc(at: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(at);
  if (!m) throw new Error(`${at} is not a YYYY-MM-DDTHH:MM time`);
  const [, y, mo, d, h, mi] = m.map(Number) as number[];
  const naive = Date.UTC(y!, mo! - 1, d!, h!, mi!);
  if (new Date(naive).toISOString().slice(0, 16) !== at) throw new Error(`${at} is not a real date`);
  // The UK is UTC+0 or UTC+1, so the instant is one of these two.
  const matches = [0, 60].map((offset) => new Date(naive - offset * 60_000)).filter((t) => londonWall(t) === at);
  if (matches.length === 0) throw new Error(`${at} does not exist in UK time: the clocks go forward then`);
  if (matches.length > 1) throw new Error(`${at} happens twice in UK time: the clocks go back then`);
  return matches[0]!;
}

/** "Sun 6 Dec 2026, 19:00 UK", for people reading a log. */
export function ukLabel(date: Date): string {
  const [, y, mo, d, time] = /^(\d{4})-(\d{2})-(\d{2})T(.*)$/.exec(londonWall(date))!;
  return `${pick(parts, date).weekday} ${Number(d)} ${MONTHS[Number(mo) - 1]} ${y}, ${time} UK`;
}
