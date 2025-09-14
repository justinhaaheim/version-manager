/**
 * Format a date to display as 12-hour time with am/pm
 */
// TODO: Do this with dayjs
export function formatTimeLabel(date: Date): string {
  const hours = date.getHours();
  const period = hours >= 12 ? 'pm' : 'am';
  const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${displayHours}${period}`;
}
