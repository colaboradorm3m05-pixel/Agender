import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { formatCents } from "@/domain/money";
import { formatDateTime } from "@/domain/format";
import { Alert, Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { AppError } from "@/server/errors";
import { requireActor } from "@/server/session";
import { getCustomerWithHistory } from "@/server/services/customers";
import { StatusBadge } from "../../status-badge";
import { EditCustomerForm } from "../forms";

export const metadata: Metadata = { title: "Cliente" };

export default async function CustomerPage(props: PageProps<"/painel/clientes/[id]">) {
  const { actor, company } = await requireActor("customers.view");
  const { id } = await props.params;
  const data = await getCustomerWithHistory(getDb(), actor, id).catch((e) => {
    if (e instanceof AppError) notFound();
    throw e;
  });
  const { customer, history, sharedWith } = data;
  const completed = history.filter((h) => h.status === "completed");
  const tz = company.timezone;

  return (
    <>
      <Link href="/painel/clientes" className="text-sm text-accent hover:underline">
        ← Clientes
      </Link>
      <PageHeader
        title={customer.name}
        description={`${completed.length} atendimento(s) concluído(s) · cliente desde ${formatDateTime(customer.createdAt, tz).split(" às")[0]}`}
        actions={<LinkButton href={`/painel/agenda/novo?cliente=${customer.id}`}>Agendar</LinkButton>}
      />
      {sharedWith.length ? (
        <div className="mb-4">
          <Alert tone="warn" title="Telefone compartilhado">
            Este número também está cadastrado para:{" "}
            {sharedWith.map((s, i) => (
              <span key={s.id}>
                {i > 0 ? ", " : ""}
                <Link className="underline" href={`/painel/clientes/${s.id}`}>
                  {s.name}
                </Link>
              </span>
            ))}
            . Confira o nome antes de confirmar atendimentos.
          </Alert>
        </div>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <h2 className="mb-3 font-semibold">Histórico de atendimentos</h2>
          {history.length === 0 ? (
            <EmptyState title="Nenhum atendimento ainda" />
          ) : (
            <ul className="divide-y divide-line">
              {history.map((h) => (
                <li key={h.id}>
                  <Link href={`/painel/agendamentos/${h.id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:bg-canvas">
                    <span>
                      <span className="block font-medium">{formatDateTime(h.startsAt, tz)}</span>
                      <span className="block text-xs text-muted">
                        {h.serviceName} · {h.professionalName} · {formatCents(h.priceCents)}
                        {h.paidCents ? ` · pago ${formatCents(h.paidCents)}` : ""}
                      </span>
                    </span>
                    <StatusBadge status={h.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <h2 className="mb-4 font-semibold">Dados do cliente</h2>
          <EditCustomerForm customer={customer} />
        </Card>
      </div>
    </>
  );
}
