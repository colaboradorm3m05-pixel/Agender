import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db";
import { APP_NAME } from "@/config/app";
import { formatCents } from "@/domain/money";
import { formatDateLong, formatTime } from "@/domain/format";
import { addDays, todayIn } from "@/domain/time";
import { readableTextOn } from "@/lib/color";
import { bookingPath } from "@/lib/urls";
import { clientIp } from "@/server/action-helpers";
import { hitRateLimit, RATE_LIMITS } from "@/server/rate-limit";
import { getBookingByToken } from "@/server/services/booking";
import { getPublicCompanyBySlug } from "@/server/services/companies";
import { ManageActions } from "./manage-actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Minha reserva", robots: { index: false, follow: false } };

const STATUS = {
  confirmed: "Confirmada",
  completed: "Concluída",
  cancelled: "Cancelada",
  no_show: "Não compareceu",
} as const;

export default async function ManageBookingPage(props: PageProps<"/r/[token]">) {
  const { token } = await props.params;
  const db = getDb();
  const limited = !(await hitRateLimit(db, RATE_LIMITS.manageLookup, await clientIp())).allowed;
  const booking = limited ? null : await getBookingByToken(db, token);

  if (!booking) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 text-center">
        <h1 className="text-xl font-semibold">{limited ? "Muitas tentativas" : "Reserva não encontrada"}</h1>
        <p className="mt-2 text-sm text-muted">
          {limited
            ? "Aguarde alguns minutos e tente novamente."
            : "O link pode estar incompleto. Use o link exato recebido na confirmação ou fale com o estabelecimento."}
        </p>
      </main>
    );
  }

  const tz = booking.company.timezone;
  const company = await getPublicCompanyBySlug(db, booking.company.slug);
  const today = todayIn(tz);
  const dates = Array.from({ length: (company?.maxDaysAhead ?? 30) + 1 }, (_, i) => addDays(today, i));
  const brandText = readableTextOn(booking.company.brandColor);

  return (
    <div className="min-h-screen bg-canvas" style={{ ["--brand" as string]: booking.company.brandColor, ["--brand-text" as string]: brandText }}>
      <header className="bg-[var(--brand)] text-[var(--brand-text)]">
        <div className="mx-auto max-w-xl px-4 py-5">
          <p className="text-sm opacity-90">Sua reserva em</p>
          <h1 className="text-xl font-semibold">{booking.company.name}</h1>
        </div>
      </header>
      <main className="mx-auto max-w-xl space-y-4 px-4 py-6">
        <section className="rounded-2xl border border-line bg-surface p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-lg font-semibold">{booking.serviceName}</p>
              <p className="text-sm text-muted">com {booking.professionalName}</p>
            </div>
            <span className="rounded-full border border-line bg-canvas px-2.5 py-0.5 text-xs font-medium">
              {STATUS[booking.status as keyof typeof STATUS] ?? booking.status}
            </span>
          </div>
          <p className="mt-4 text-base">
            <strong>{capitalize(formatDateLong(booking.startsAt, tz))}</strong>, {formatTime(booking.startsAt, tz)}–{formatTime(booking.endsAt, tz)}
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-xs text-muted">Valor</dt>
              <dd>{formatCents(booking.priceCents)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Código</dt>
              <dd className="font-mono">{booking.publicCode}</dd>
            </div>
            {booking.company.addressLine ? (
              <div className="col-span-2">
                <dt className="text-xs text-muted">Endereço</dt>
                <dd>{[booking.company.addressLine, booking.company.city].filter(Boolean).join(", ")}</dd>
              </div>
            ) : null}
            {booking.company.phone ? (
              <div className="col-span-2">
                <dt className="text-xs text-muted">Contato</dt>
                <dd>{booking.company.phone}</dd>
              </div>
            ) : null}
          </dl>
        </section>

        {booking.status === "confirmed" ? (
          <ManageActions
            token={token}
            canCancel={booking.canCancel}
            canReschedule={booking.canReschedule}
            policyMessage={booking.policyMessage}
            dates={dates}
          />
        ) : null}

        <p className="text-center text-sm">
          <Link href={bookingPath(booking.company.slug)} className="font-medium text-ink-soft underline-offset-2 hover:underline">
            Fazer outro agendamento
          </Link>
        </p>
        <p className="text-center text-xs text-muted">Agendamento online por {APP_NAME}</p>
      </main>
    </div>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
