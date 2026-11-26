// A manual month ends on the same UTC day next month, or on that month's last day.
// Date#setUTCMonth overflows January 31 into March instead of ending in February.
export function manualPeriodEnd(start: Date): Date {
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(
    year,
    month,
    Math.min(start.getUTCDate(), lastDay),
    start.getUTCHours(),
    start.getUTCMinutes(),
    start.getUTCSeconds(),
    start.getUTCMilliseconds()
  ));
}
