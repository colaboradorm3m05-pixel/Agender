import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { customers, payments } from "@/db/schema";
import { formatCents, centsToInput } from "@/domain/money";
import { formatDateLong, formatDateTime, formatDuration, formatTime } from "@/domain/format";
import { instantToLocal, minutesToHHMM } from "@/domain/time";
import { formatPhone } from "@/domain/phone";
import { Badge, Card, PageHeader } from "@/components/ui";
import { AppError } from "@/server/errors";
import { can } from "@/server/permissions";
import { requireActor } from "@/server/session";
import { AUDIT_LABELS, listAuditFor } from "@/server/audit";
import { getAppointment } from "@/server/services/scheduling";
import { listProfessionals } from "@/server/services/staff";
import { PAYMENT_METHOD_LABELS } from "@/server/services/payments";
import { StatusBadge } from "../../status-badge";
import { CancelForm, PaymentForm, RescheduleForm, StatusButtons } from "./appointment-actions";

export const metadata: Metadata = { title: "Agendamento" };

export default async function AppointmentPage(props: PageProps<"/painel/agendamentos/[id]">) {
  const { actor, company } = await requireActor();
  const { id } = await props.params;
  const db = getDb();
  const tz = company.timezone;
  const appt = await getAppointment(db, actor, id).catch((err) => {
    if (err instanceof AppError && (err.code === "not_found" || err.code === "forbidden")) notFound();
    throw err;
  });
  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, appt.customerId), eq(customers.companyId, actor.companyId)));
  const manage = can(actor, "appointment.manage_all");
  const showMoney = can(actor, "payments.manage");
  const [pros, paid, history] = await Promise.all([
    manage ? listProfessionals(db, actor) : Promise.resolve([]),
    showMoney
      ? db.select().from(payments).where(and(eq(payments.appointmentId, appt.id), eq(payments.companyId, actor.companyId))).orderBy(desc(payments.paidAt))
      : Promise.resolve([]),
    manage ? listAuditFor(db, actor.companyId, "appointment", appt.id) : Promise.resolve([]),
  ]);
  const paidCents = paid.reduce((s, p) => s + p.amountCents, 0);
  const local = instantToLocal(appt.startsAt, tz);
  const nowLocal = instantToLocal(new Date(), tz);
  const eligiblePros = pros.filter((p) => p.serviceIds.includes(appt.serviceId) || p.id === appt.professionalId);
  const fmtIsoInText = (text: string) =>
    text.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g, (iso) => formatDateTime(new Date(iso), tz));

  return (
    <>
      <div className="mb-2">
        <Link href={`/painel/agenda?data=${local.date}`} className="text-sm text-accent hover:underline">
          ← Voltar para a agenda
        </Link>
      </div>
      <PageHeader
        title={`${appt.serviceName} · ${customer?.name ?? "Cliente"}`}
        description={
          <>
            {capitalize(formatDateLong(appt.startsAt, tz))}, {formatTime(appt.startsAt, tz)}–{formatTime(appt.endsAt, tz)} com {appt.professionalName}
          </>
        }
        actions={<StatusBadge status={appt.status} />}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Info label="Cliente">
                {customer ? (
                  can(actor, "customers.view") ? (
                    <Link href={`/painel/clientes/${customer.id}`} className="font-medium text-accent hover:underline">
                      {customer.name}
                    </Link>
                  ) : (
                    customer.name
                  )
                ) : (
                  "—"
                )}
              </Info>
              <Info label="Telefone">{customer ? formatPhone(customer.phoneNormalized) : "—"}</Info>
              <Info label="Duração">
                {formatDuration(appt.durationMinutes)}
                {appt.bufferAfterMinutes ? ` + ${appt.bufferAfterMinutes} min de intervalo` : ""}
              </Info>
              <Info label="Valor do serviço">{formatCents(appt.priceCents)}</Info>
              <Info label="Código da reserva">
                <span className="font-mono">{appt.publicCode}</span>
              </Info>
              <Info label="Origem">{appt.source === "public" ? <Badge tone="accent">Link público</Badge> : <Badge>Equipe</Badge>}</Info>
              {appt.status === "completed" && appt.commissionCents !== null && (can(actor, "reports.view") || actor.professionalId === appt.professionalId) ? (
                <Info label="Comissão">
                  {formatCents(appt.commissionCents)} <span className="text-xs text-muted">({appt.commissionDescription})</span>
                </Info>
              ) : null}
              {appt.notes ? <Info label="Observações">{appt.notes}</Info> : null}
              {appt.status === "cancelled" ? (
                <Info label="Cancelamento">
                  {appt.cancelledBy === "client" ? "Pelo cliente" : "Pela equipe"}
                  {appt.cancelledAt ? ` em ${formatDateTime(appt.cancelledAt, tz)}` : ""}
                  {appt.cancelReason ? ` — ${appt.cancelReason}` : ""}
                </Info>
              ) : null}
            </dl>
          </Card>

          {appt.status !== "cancelled" ? (
            <Card>
              <h2 className="mb-3 font-semibold">Situação do atendimento</h2>
              <StatusButtons id={appt.id} status={appt.status} started={appt.startsAt <= new Date()} canManage={manage} />
            </Card>
          ) : null}

          {manage && appt.status === "confirmed" ? (
            <Card>
              <h2 className="mb-3 font-semibold">Reagendar</h2>
              <p className="mb-3 text-xs text-muted">Mantém o preço e a duração registrados neste agendamento.</p>
              <RescheduleForm
                id={appt.id}
                professionals={eligiblePros.map((p) => ({ id: p.id, name: p.name }))}
                currentProfessionalId={appt.professionalId}
                serviceId={appt.serviceId}
                defaultDate={local.date}
              />
              <div className="mt-6 border-t border-line pt-4">
                <CancelForm id={appt.id} />
              </div>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          {showMoney ? (
            <Card>
              <h2 className="font-semibold">Pagamentos</h2>
              <p className="tabular mt-1 text-sm text-muted">
                Recebido {formatCents(paidCents)} de {formatCents(appt.priceCents)}
              </p>
              {paid.length ? (
                <ul className="mt-3 divide-y divide-line text-sm">
                  {paid.map((p) => (
                    <li key={p.id} className="flex justify-between py-2">
                      <span>
                        {PAYMENT_METHOD_LABELS[p.method]} <span className="text-xs text-muted">· {formatDateTime(p.paidAt, tz)}</span>
                      </span>
                      <span className="tabular font-medium">{formatCents(p.amountCents)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {appt.status !== "cancelled" && paidCents < appt.priceCents ? (
                <div className="mt-4 border-t border-line pt-4">
                  <PaymentForm
                    appointmentId={appt.id}
                    defaultAmount={centsToInput(Math.max(appt.priceCents - paidCents, 0))}
                    defaultDate={nowLocal.date}
                    defaultTime={minutesToHHMM(nowLocal.minuteOfDay)}
                    methods={Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => ({ value, label }))}
                  />
                </div>
              ) : null}
            </Card>
          ) : null}

          {history.length ? (
            <Card>
              <h2 className="mb-2 font-semibold">Histórico</h2>
              <ol className="space-y-2 text-xs">
                {history.map((h) => (
                  <li key={h.id}>
                    <span className="font-medium text-ink">{AUDIT_LABELS[h.action] ?? h.action}</span>
                    <span className="text-muted">
                      {" "}
                      · {formatDateTime(h.createdAt, tz)} · {h.actorType === "customer" ? "cliente" : (h.actorName ?? "sistema")}
                    </span>
                    {h.details ? <span className="block text-muted">{fmtIsoInText(h.details)}</span> : null}
                  </li>
                ))}
              </ol>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
