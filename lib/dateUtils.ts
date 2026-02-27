// lib/dateUtils.ts
// Date utilities for Australia/Sydney timezone

const SYDNEY_TIMEZONE = 'Australia/Sydney';

export function getSydneyDateString(date?: Date): string {
  const d = date || new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: SYDNEY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(d);
}

export function formatDateDDMMYYYY(dateStr: string): string {
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}

export function getSydneyNow(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: SYDNEY_TIMEZONE }));
}
