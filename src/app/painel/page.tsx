import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Ban,
  CalendarCheck2,
  CalendarClock,
  CalendarRange,
  CalendarX2,
  Hourglass,
  Link2,
  Plus,
  UsersRound,
  UserX,
  Wallet,
} from "lucide-react";
import { getDb } from "@/db";
import { formatCents } from "@/domain/money";
import { formatDateLong, formatTime } from "@/domain/format";
import { localToInstant, addDays, todayIn } from "@/domain/time";
import { PublicLinkBox } from "@/components/copy-button";
import { Avatar, Card, cx, EmptyState, IconBadge, Stat } from "@/components/ui";
import { appUrl, bookingPath } from "@/lib/urls";
import { periodRange, PERIODS } from "@/lib/periods";
import { can } from "@/server/permissions";
import { requireActor } from "@/server/session";
import { listAgenda } from "@/server/services/scheduling";
import { periodSummary, reportByProfessional, upcomingAppointments } from "@/server/services/reports";
import { StatusBadge } from "./status-badge";

export const metadata: Metadata = { title: "Visão geral" };

export default async function OverviewPage(props: PageProps<"/painel">) {
  const { actor, company, user } = await requireActor();
  const sp = await props.searchParams;
  const db = getDb();
  const tz = company.timezone;
  const now = new Date();
  const period = periodRange(typeof sp.periodo === "string" ? sp.periodo : undefined, tz, now);
  const today = todayIn(tz, now);
  const dayFrom = localToInstant(today, 0, tz);
  const dayTo = localToInstant(addDays(today, 1), 0, tz);
  const isOwner = can(actor, "reports.view");

  const [todayItems, upcoming, summary, byPro] = await Promise.all([
    listAgenda(db, actor, dayFrom, dayTo),
    upcomingAppointments(db, actor, now),
    periodSummary(db, actor, period.from, period.to),
    isOwner ? reportByProfessional(db, actor, period.from, period.to) : Promise.resolve([]),
  ]);
  const todayActive = todayItems.filter((a) => a.status !== "cancelled");
  const nextToday = todayActive.find((a) => a.status === "confirmed" && a.startsAt > now);
  const maxProValue = Math.max(1, ...byPro.map((r) => r.completedCents));

  let heroText = "Nenhum atendimento marcado para hoje ainda.";
  if (todayActive.length > 0) {
    heroText = `Você tem ${todayActive.length} atendimento${todayActive.length > 1 ? "s" : ""} hoje.`;
    if (nextToday) heroText += ` Próximo às ${formatTime(nextToday.startsAt, tz)} com ${nextToday.customerName}.`;
  }

  return (
    <>
      <section className="relative mb-6 overflow-hidden rounded-3xl bg-sidebar px-6 py-6 text-white shadow-[var(--shadow-lift)] sm:px-8 sm:py-7">
        <div aria-hidden className="pointer-events-none absolute -top-16 -right-10 h-56 w-56 rounded-full bg-[#f3c77a]/20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-20 left-1/3 h-48 w-48 rounded-full bg-accent/50 blur-3xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-sidebar-text first-letter:uppercase">{formatDateLong(now, tz)}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Olá, {user.name.split(" ")[0]}!</h1>
            <p className="mt-2 max-w-md text-sm text-sidebar-text">{heroText}</p>
          </div>
          {can(actor, "appointment.manage_all") ? (
            <div className="flex flex-wrap gap-2">
              <Link
                href="/painel/agenda/novo"
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#f3c77a] px-4 text-sm font-semibold text-[#13201e] shadow-sm hover:bg-[#f7d595]"
              >
                <Plus aria-hidden className="h-4 w-4" /> Novo agendamento
              </Link>
              <Link
                href="/painel/agenda/bloqueio"
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/20 px-4 text-sm font-medium text-white hover:bg-white/10"
              >
                <Ban aria-hidden className="h-4 w-4" /> Bloquear horário
              </Link>
            </div>
          ) : (
            <Link
              href="/painel/agenda"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#f3c77a] px-4 text-sm font-semibold text-[#13201e] shadow-sm hover:bg-[#f7d595]"
            >
              <CalendarClock aria-hidden className="h-4 w-4" /> Minha agenda
            </Link>
          )}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold">
              <CalendarClock aria-hidden className="h-5 w-5 text-gold" /> Agenda de hoje
            </h2>
            <Link href="/painel/agenda" className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
              Ver agenda <ArrowRight aria-hidden className="h-4 w-4" />
            </Link>
          </div>
          {todayActive.length === 0 ? (
            <EmptyState icon={CalendarClock} title="Nenhum atendimento hoje" description="Os agendamentos feitos pelo link público aparecem aqui automaticamente." />
          ) : (
            <ol className="relative space-y-1 before:absolute before:top-3 before:bottom-3 before:left-[4.15rem] before:w-px before:bg-line">
              {todayActive.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/painel/agendamentos/${a.id}`}
                    className={cx("relative flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-canvas", a.endsAt <= now && "opacity-70")}
                  >
                    <span className="tabular w-12 shrink-0 text-right text-sm font-semibold">{formatTime(a.startsAt, tz)}</span>
                    <span
                      aria-hidden
                      className={cx(
                        "relative z-10 h-3 w-3 shrink-0 rounded-full ring-4 ring-surface",
                        a.status === "completed" ? "bg-ok" : a.status === "no_show" ? "bg-warn" : "bg-accent",
                      )}
                    />
                    <Avatar name={a.customerName} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{a.customerName}</span>
                      <span className="block truncate text-xs text-muted">
                        {a.serviceName} · {a.professionalName}
                      </span>
                    </span>
                    <StatusBadge status={a.status} />
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card>
          <h2 className="mb-4 flex items-center gap-2 font-semibold">
            <CalendarRange aria-hidden className="h-5 w-5 text-gold" /> Próximos atendimentos
          </h2>
          {upcoming.length === 0 ? (
            <p className="rounded-xl bg-canvas px-3 py-6 text-center text-sm text-muted">Nenhum atendimento confirmado à frente.</p>
          ) : (
            <ul className="space-y-1">
              {upcoming.map((a) => (
                <li key={a.id}>
                  <Link href={`/painel/agendamentos/${a.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-canvas">
                    <span className="flex w-11 shrink-0 flex-col items-center rounded-xl bg-accent-soft py-1 text-accent">
                      <span className="text-[10px] font-semibold uppercase">{formatWeekdayShort(a.startsAt, tz)}</span>
                      <span className="tabular text-base leading-none font-bold">{formatDayNumber(a.startsAt, tz)}</span>
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {formatTime(a.startsAt, tz)} · {a.customerName}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {a.serviceName} · {a.professionalName}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <section className="mt-8" aria-labelledby="periodo-titulo">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="periodo-titulo" className="text-lg font-semibold">
            Indicadores <span className="font-normal text-muted">· {period.label}</span>
          </h2>
          <nav aria-label="Período" className="flex flex-wrap gap-1 rounded-xl border border-line bg-surface p-1">
            {Object.entries(PERIODS).map(([key, label]) => (
              <Link
                key={key}
                href={`/painel?periodo=${key}`}
                aria-current={period.key === key ? "true" : undefined}
                className={cx(
                  "rounded-lg px-3 py-1 text-xs font-medium transition-colors",
                  period.key === key ? "bg-accent text-white shadow-sm" : "text-ink-soft hover:bg-canvas",
                )}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Stat
            icon={CalendarCheck2}
            tone="accent"
            label="Agendamentos no período"
            value={summary.appointmentsCount}
            hint={`${summary.confirmedCount} confirmados · ${summary.completedCount} concluídos`}
          />
          <Stat icon={CalendarX2} tone="danger" label="Cancelamentos" value={summary.cancelledCount} />
          <Stat icon={UserX} tone="warn" label="Faltas" value={summary.noShowCount} />
          <Stat icon={Hourglass} tone="info" label="Valor agendado" value={formatCents(summary.scheduledCents)} hint="Atendimentos ainda confirmados (a realizar)." />
          <Stat icon={BadgeCheck} tone="ok" label="Serviços concluídos" value={formatCents(summary.completedCents)} hint="Soma do preço dos atendimentos concluídos." />
          {summary.receivedCents !== null ? (
            <Stat
              icon={Wallet}
              tone="gold"
              label="Pagamentos registrados"
              value={formatCents(summary.receivedCents)}
              hint="Registro manual — não é cobrança processada pelo sistema."
            />
          ) : null}
        </div>
      </section>

      {isOwner ? (
        <Card className="mt-8">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-semibold">
              <UsersRound aria-hidden className="h-5 w-5 text-gold" /> Por profissional
            </h2>
            <Link href="/painel/relatorios" className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
              Relatórios <ArrowRight aria-hidden className="h-4 w-4" />
            </Link>
          </div>
          {byPro.length === 0 ? (
            <p className="text-sm text-muted">Sem atendimentos no período.</p>
          ) : (
            <ul className="space-y-4">
              {byPro.map((r) => (
                <li key={r.professionalId} className="flex items-center gap-3">
                  <Avatar name={r.professionalName} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                      <span className="font-medium">{r.professionalName}</span>
                      <span className="tabular text-sm font-semibold">{formatCents(r.completedCents)}</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-canvas" aria-hidden>
                      <div className="h-full rounded-full bg-gradient-to-r from-accent to-[#2f8f86]" style={{ width: `${(r.completedCents / maxProValue) * 100}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {r.completedCount} concluído(s) · {r.noShowCount} falta(s) · {r.cancelledCount} cancelado(s) · recebido {formatCents(r.receivedCents)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {can(actor, "company.manage") ? (
        <Card className="mt-8 border-gold/30 bg-gradient-to-br from-gold-soft/60 to-surface">
          <div className="mb-3 flex items-center gap-3">
            <IconBadge icon={Link2} tone="gold" />
            <div>
              <h2 className="font-semibold">Link público de agendamento</h2>
              <p className="text-sm text-muted">Compartilhe no WhatsApp, Instagram ou Google para receber agendamentos.</p>
            </div>
          </div>
          <PublicLinkBox url={appUrl(bookingPath(company.slug))} />
        </Card>
      ) : null}
    </>
  );
}

function formatWeekdayShort(d: Date, timeZone: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone, weekday: "short" }).format(d).replace(".", "");
}

function formatDayNumber(d: Date, timeZone: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone, day: "2-digit" }).format(d);
}
