import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db";
import { formatLocalDateLong, formatLocalDateShort, formatTime } from "@/domain/format";
import {
  addDays,
  instantToLocal,
  isValidLocalDate,
  localToInstant,
  minutesToHHMM,
  startOfWeek,
  todayIn,
  weekdayOf,
} from "@/domain/time";
import { Card, cx, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { can } from "@/server/permissions";
import { requireActor } from "@/server/session";
import { getCompanyHours } from "@/server/services/companies";
import { listAgenda, type AgendaItem } from "@/server/services/scheduling";
import { listProfessionals, listTimeBlocks, loadSchedules } from "@/server/services/staff";
import { STATUS_LABELS } from "../status-badge";
import { DeleteBlockButton } from "./delete-block-button";

export const metadata: Metadata = { title: "Agenda" };

const PX_PER_MIN = 1.2;

const STATUS_STYLE: Record<string, string> = {
  confirmed: "border-accent/40 bg-accent-soft text-ink",
  completed: "border-ok/40 bg-ok-soft text-ink",
  no_show: "border-warn/40 bg-warn-soft text-ink",
  cancelled: "border-line bg-surface text-muted line-through opacity-70",
};

export default async function AgendaPage(props: PageProps<"/painel/agenda">) {
  const { actor, company } = await requireActor();
  const sp = await props.searchParams;
  const tz = company.timezone;
  const db = getDb();
  const today = todayIn(tz);
  const date = typeof sp.data === "string" && isValidLocalDate(sp.data) ? sp.data : today;
  const view = sp.visao === "semana" ? "semana" : "dia";
  const allPros = await listProfessionals(db, actor, { includeInactive: true });
  const requestedPro = typeof sp.profissional === "string" ? sp.profissional : "";
  const proFilter = allPros.some((p) => p.id === requestedPro) ? requestedPro : "";
  const visiblePros = allPros.filter((p) => (proFilter ? p.id === proFilter : p.active));

  const rangeStart = view === "semana" ? startOfWeek(date) : date;
  const rangeDays = view === "semana" ? 7 : 1;
  const from = localToInstant(rangeStart, 0, tz);
  const to = localToInstant(addDays(rangeStart, rangeDays), 0, tz);
  const [items, blocks] = await Promise.all([
    listAgenda(db, actor, from, to, proFilter || null),
    listTimeBlocks(db, actor, from, to, proFilter || null),
  ]);

  const qs = (patch: Record<string, string>) => {
    const params = new URLSearchParams({ data: date, visao: view, ...(proFilter ? { profissional: proFilter } : {}), ...patch });
    for (const [k, v] of [...params.entries()]) if (!v) params.delete(k);
    return `/painel/agenda?${params.toString()}`;
  };
  const step = view === "semana" ? 7 : 1;
  const manage = can(actor, "appointment.manage_all");

  return (
    <>
      <PageHeader
        title="Agenda"
        description={view === "dia" ? capitalize(formatLocalDateLong(date)) : `Semana de ${formatLocalDateShort(rangeStart)} a ${formatLocalDateShort(addDays(rangeStart, 6))}`}
        actions={
          manage ? (
            <>
              <LinkButton variant="secondary" href={`/painel/agenda/bloqueio?data=${date}${proFilter ? `&profissional=${proFilter}` : ""}`}>
                Bloquear horário
              </LinkButton>
              <LinkButton href={`/painel/agenda/novo?data=${date}${proFilter ? `&profissional=${proFilter}` : ""}`}>Novo agendamento</LinkButton>
            </>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <LinkButton variant="secondary" size="sm" href={qs({ data: addDays(date, -step) })} aria-label={view === "dia" ? "Dia anterior" : "Semana anterior"}>
            ←
          </LinkButton>
          <LinkButton variant="secondary" size="sm" href={qs({ data: today })}>
            Hoje
          </LinkButton>
          <LinkButton variant="secondary" size="sm" href={qs({ data: addDays(date, step) })} aria-label={view === "dia" ? "Próximo dia" : "Próxima semana"}>
            →
          </LinkButton>
        </div>
        <div className="flex rounded-lg border border-line-strong bg-surface p-0.5" role="group" aria-label="Visualização">
          {(["dia", "semana"] as const).map((v) => (
            <Link
              key={v}
              href={qs({ visao: v })}
              aria-current={view === v ? "true" : undefined}
              className={cx("rounded-md px-3 py-1 text-sm font-medium", view === v ? "bg-accent text-white" : "text-ink-soft hover:bg-canvas")}
            >
              {v === "dia" ? "Dia" : "Semana"}
            </Link>
          ))}
        </div>
        <form className="flex items-center gap-2" action="/painel/agenda">
          <input type="hidden" name="visao" value={view} />
          {allPros.length > 1 ? (
            <>
              <label htmlFor="filtro-pro" className="sr-only">
                Profissional
              </label>
              <select id="filtro-pro" name="profissional" defaultValue={proFilter} className="h-8 rounded-lg border border-line-strong bg-surface px-2 text-sm">
                <option value="">Todos os profissionais</option>
                {allPros.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.active ? "" : " (inativo)"}
                  </option>
                ))}
              </select>
            </>
          ) : null}
          <label htmlFor="filtro-data" className="sr-only">
            Data
          </label>
          <input id="filtro-data" type="date" name="data" defaultValue={date} className="h-8 rounded-lg border border-line-strong bg-surface px-2 text-sm" />
          <button type="submit" className="h-8 rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium hover:bg-canvas">
            Ir
          </button>
        </form>
      </div>

      {visiblePros.length === 0 ? (
        <EmptyState
          title="Nenhum profissional ativo"
          description="Cadastre um profissional e defina a jornada para começar a receber agendamentos."
          action={can(actor, "staff.manage") ? <LinkButton href="/painel/profissionais">Cadastrar profissional</LinkButton> : undefined}
        />
      ) : view === "dia" ? (
        <DayView
          date={date}
          tz={tz}
          pros={visiblePros}
          items={items}
          blocks={blocks}
          companyId={company.id}
          canDeleteBlocks={can(actor, "blocks.manage_all")}
        />
      ) : (
        <WeekView start={rangeStart} tz={tz} items={items} blocks={blocks} today={today} showPro={!proFilter && visiblePros.length > 1} />
      )}
    </>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

type Block = Awaited<ReturnType<typeof listTimeBlocks>>[number];

async function DayView({
  date,
  tz,
  pros,
  items,
  blocks,
  companyId,
  canDeleteBlocks,
}: {
  date: string;
  tz: string;
  pros: { id: string; name: string }[];
  items: AgendaItem[];
  blocks: Block[];
  companyId: string;
  canDeleteBlocks: boolean;
}) {
  const db = getDb();
  const weekday = weekdayOf(date);
  const companyHours = (await getCompanyHours(db, companyId)).filter((h) => h.weekday === weekday);
  const schedules = (await loadSchedules(db, companyId, pros.map((p) => p.id))).map((s) => ({
    id: s.id,
    hours: s.hours.filter((h) => h.weekday === weekday),
    breaks: s.breaks.filter((b) => b.weekday === weekday),
  }));

  const localMin = (d: Date) => {
    const l = instantToLocal(d, tz);
    if (l.date < date) return 0;
    if (l.date > date) return 1440;
    return l.minuteOfDay;
  };
  const bounds = [
    ...companyHours.flatMap((h) => [h.startMinute, h.endMinute]),
    ...schedules.flatMap((s) => s.hours.flatMap((h) => [h.startMinute, h.endMinute])),
    ...items.flatMap((i) => [localMin(i.startsAt), localMin(i.occupiedUntil)]),
  ];
  const startMin = Math.max(0, Math.floor((bounds.length ? Math.min(...bounds) : 8 * 60) / 60) * 60);
  const endMin = Math.min(1440, Math.ceil((bounds.length ? Math.max(...bounds) : 20 * 60) / 60) * 60);
  const height = (endMin - startMin) * PX_PER_MIN;
  const y = (min: number) => (Math.min(Math.max(min, startMin), endMin) - startMin) * PX_PER_MIN;
  const hours = Array.from({ length: (endMin - startMin) / 60 + 1 }, (_, i) => startMin + i * 60);

  const dayHasAnything = items.length > 0;

  return (
    <Card className="p-0 sm:p-0">
      {!dayHasAnything ? (
        <p className="border-b border-line px-4 py-3 text-sm text-muted">Nenhum agendamento neste dia.</p>
      ) : null}
      <div className="overflow-x-auto overflow-y-hidden">
        <div className="flex min-w-fit">
          <div className="sticky left-0 z-10 w-14 shrink-0 border-r border-line bg-surface">
            <div className="h-10 border-b border-line" />
            <div className="relative" style={{ height }}>
              {hours.map((h) => (
                <span key={h} className="tabular absolute right-2 -translate-y-1/2 text-[11px] text-muted" style={{ top: y(h) }}>
                  {minutesToHHMM(h)}
                </span>
              ))}
            </div>
          </div>
          {pros.map((pro) => {
            const sched = schedules.find((s) => s.id === pro.id)!;
            const proItems = items.filter((i) => i.professionalId === pro.id);
            const proBlocks = blocks.filter((b) => !b.professionalId || b.professionalId === pro.id);
            // Áreas fora da jornada ficam acinzentadas.
            const working = sched.hours;
            return (
              <div key={pro.id} className="min-w-[200px] flex-1 border-r border-line last:border-r-0">
                <div className="flex h-10 items-center justify-between border-b border-line px-3">
                  <span className="truncate text-sm font-semibold">{pro.name}</span>
                  <span className="text-xs text-muted">{proItems.filter((i) => i.status !== "cancelled").length}</span>
                </div>
                <div className="relative bg-[repeating-linear-gradient(135deg,var(--color-canvas),var(--color-canvas)_6px,#efefeb_6px,#efefeb_12px)]" style={{ height }}>
                  {working.map((w, i) => (
                    <div key={i} className="absolute inset-x-0 bg-surface" style={{ top: y(w.startMinute), height: y(w.endMinute) - y(w.startMinute) }} />
                  ))}
                  {hours.map((h) => (
                    <div key={h} className="absolute inset-x-0 border-t border-line/70" style={{ top: y(h) }} />
                  ))}
                  {sched.breaks.map((b, i) => (
                    <div
                      key={`b${i}`}
                      className="absolute inset-x-0 flex items-start bg-canvas/90 px-2 pt-0.5 text-[11px] text-muted"
                      style={{ top: y(b.startMinute), height: y(b.endMinute) - y(b.startMinute) }}
                    >
                      Pausa
                    </div>
                  ))}
                  {proBlocks.map((b) => (
                    <div
                      key={b.id}
                      className="absolute inset-x-1 flex items-start justify-between gap-1 rounded-md border border-dashed border-line-strong bg-canvas px-2 py-0.5 text-[11px] text-ink-soft"
                      style={{ top: y(localMin(b.startsAt)), height: Math.max(18, y(localMin(b.endsAt)) - y(localMin(b.startsAt))) }}
                    >
                      <span className="truncate">Bloqueado{b.reason ? ` · ${b.reason}` : ""}</span>
                      {canDeleteBlocks ? <DeleteBlockButton id={b.id} /> : null}
                    </div>
                  ))}
                  {proItems.map((a) => {
                    const top = y(localMin(a.startsAt));
                    const h = Math.max(22, y(localMin(a.endsAt)) - top);
                    const buffer = y(localMin(a.occupiedUntil)) - y(localMin(a.endsAt));
                    return (
                      <div key={a.id}>
                        <Link
                          href={`/painel/agendamentos/${a.id}`}
                          className={cx(
                            "absolute inset-x-1 overflow-hidden rounded-md border px-2 py-1 text-xs shadow-sm hover:z-20 hover:shadow",
                            STATUS_STYLE[a.status],
                            a.status === "cancelled" && "z-0",
                          )}
                          style={{ top, height: h }}
                          aria-label={`${formatTime(a.startsAt, tz)} ${a.customerName}, ${a.serviceName}, ${STATUS_LABELS[a.status]}`}
                        >
                          <span className="tabular font-semibold">{formatTime(a.startsAt, tz)}</span> <span className="font-medium">{a.customerName}</span>
                          <span className="block truncate text-[11px] text-muted">
                            {a.serviceName} · {STATUS_LABELS[a.status]}
                          </span>
                        </Link>
                        {buffer > 0 && a.status !== "cancelled" ? (
                          <div
                            aria-hidden
                            className="absolute inset-x-1 rounded-b-md bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,#dcdcd5_3px,#dcdcd5_5px)]"
                            style={{ top: top + h, height: buffer }}
                          />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap gap-4 border-t border-line px-4 py-2 text-xs text-muted">
        <span>Área listrada: fora da jornada</span>
        <span>Faixa hachurada após o atendimento: intervalo adicional</span>
      </div>
    </Card>
  );
}

function WeekView({
  start,
  tz,
  items,
  blocks,
  today,
  showPro,
}: {
  start: string;
  tz: string;
  items: AgendaItem[];
  blocks: Block[];
  today: string;
  showPro: boolean;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <div className="grid gap-3 md:grid-cols-7">
      {days.map((d) => {
        const dayItems = items.filter((i) => instantToLocal(i.startsAt, tz).date === d);
        const dayBlocks = blocks.filter((b) => instantToLocal(b.startsAt, tz).date <= d && instantToLocal(new Date(b.endsAt.getTime() - 1), tz).date >= d);
        return (
          <section key={d} className={cx("rounded-xl border bg-surface", d === today ? "border-accent" : "border-line")}>
            <h2 className="border-b border-line px-3 py-2 text-sm font-semibold">
              <Link href={`/painel/agenda?data=${d}&visao=dia`} className="hover:underline">
                {capitalize(formatLocalDateShort(d))}
              </Link>
            </h2>
            <ul className="space-y-1.5 p-2">
              {dayBlocks.map((b) => (
                <li key={b.id} className="rounded-md border border-dashed border-line-strong px-2 py-1 text-[11px] text-muted">
                  Bloqueado {formatTime(b.startsAt, tz)}–{formatTime(b.endsAt, tz)}
                </li>
              ))}
              {dayItems.length === 0 && dayBlocks.length === 0 ? <li className="px-1 text-xs text-muted">Livre</li> : null}
              {dayItems.map((a) => (
                <li key={a.id}>
                  <Link href={`/painel/agendamentos/${a.id}`} className={cx("block rounded-md border px-2 py-1 text-xs", STATUS_STYLE[a.status])}>
                    <span className="tabular font-semibold">{formatTime(a.startsAt, tz)}</span> {a.customerName}
                    <span className="block truncate text-[11px] text-muted">
                      {a.serviceName}
                      {showPro ? ` · ${a.professionalName}` : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
