/** Formatação para exibição (pt-BR), sempre no fuso da empresa. */
export function formatTime(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone, hour: "2-digit", minute: "2-digit" }).format(instant);
}

export function formatDate(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone, day: "2-digit", month: "2-digit", year: "numeric" }).format(instant);
}

export function formatDateLong(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone, weekday: "long", day: "numeric", month: "long" }).format(instant);
}

export function formatDateTime(instant: Date, timeZone: string): string {
  return `${formatDate(instant, timeZone)} às ${formatTime(instant, timeZone)}`;
}

/** Formata uma data local YYYY-MM-DD sem depender de fuso. */
export function formatLocalDateLong(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

export function formatLocalDateShort(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "2-digit" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}
