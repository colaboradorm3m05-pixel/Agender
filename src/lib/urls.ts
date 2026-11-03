/** URLs públicas absolutas (links de agendamento, gestão de reserva e convites). */
export function appUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}${path}`;
}

export const bookingPath = (slug: string) => `/b/${slug}`;
export const managePath = (token: string) => `/r/${token}`;
export const invitePath = (token: string) => `/convite/${token}`;
