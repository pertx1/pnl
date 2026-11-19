/** Utilidades de fechas "YYYY-MM-DD" (sin zona horaria: se tratan como días de calendario). */
export function parseIsoDay(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function toIsoDay(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDaysIso(s: string, n: number) {
  return toIsoDay(parseIsoDay(s) + n * 86400000);
}

export function diffDaysIso(a: string, b: string) {
  return Math.round((parseIsoDay(a) - parseIsoDay(b)) / 86400000);
}

/** Día de calendario local del usuario a partir de un instante y su desfase (minutos, como Date#getTimezoneOffset). */
export function localIsoDay(now: Date, tzOffsetMinutes: number) {
  return toIsoDay(now.getTime() - tzOffsetMinutes * 60000);
}

/** Instante UTC (ISO) de un día local + hora local. */
export function localToUtcIso(day: string, hour: number, minute: number, tzOffsetMinutes: number) {
  return new Date(parseIsoDay(day) + (hour * 60 + minute + tzOffsetMinutes) * 60000).toISOString();
}
