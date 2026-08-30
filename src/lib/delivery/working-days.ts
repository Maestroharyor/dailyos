/**
 * Adding working days to a date, for store pickup collection deadlines.
 *
 * The deadline is what decides when a merchant may release somebody's paid-for
 * item, so it is computed once, here, from the moment the customer was told
 * their order was ready. Counting calendar days instead would quietly shorten
 * every deadline that spans a weekend.
 *
 * Public holidays are not modelled. A deadline falling just after one is a day
 * or two tighter than intended, which is survivable because releasing is a
 * deliberate action rather than something a schedule does on its own.
 */

const SATURDAY = 6;
const SUNDAY = 0;

export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === SATURDAY || day === SUNDAY;
}

/**
 * Returns `from` advanced by `days` working days, at the same time of day.
 *
 * Counts forward from the day after `from`, so a deadline of one working day
 * set on a Friday falls on the Monday. Zero or fewer days returns `from`
 * unchanged rather than walking backwards.
 */
export function addWorkingDays(from: Date, days: number): Date {
  const result = new Date(from.getTime());
  if (!Number.isFinite(days) || days <= 0) return result;

  let remaining = Math.floor(days);
  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    if (!isWeekend(result)) remaining -= 1;
  }
  return result;
}
