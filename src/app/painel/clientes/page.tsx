import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db";
import { formatDate } from "@/domain/format";
import { formatPhone } from "@/domain/phone";
import { Badge, Card, EmptyState, inputClass, PageHeader, buttonClass } from "@/components/ui";
import { requireActor } from "@/server/session";
import { searchCustomers } from "@/server/services/customers";
import { CreateCustomerForm } from "./forms";

export const metadata: Metadata = { title: "Clientes" };

export default async function CustomersPage(props: PageProps<"/painel/clientes">) {
  const { actor, company } = await requireActor("customers.view");
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const rows = await searchCustomers(getDb(), actor, q, 100);

  return (
    <>
      <PageHeader title="Clientes" description="Cadastros desta empresa. Clientes que agendam pelo link são cadastrados automaticamente." />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div>
          <form role="search" className="mb-4 flex gap-2" action="/painel/clientes">
            <label htmlFor="busca" className="sr-only">
              Buscar por nome ou telefone
            </label>
            <input id="busca" name="q" defaultValue={q} placeholder="Buscar por nome ou telefone" className={inputClass} />
            <button type="submit" className={buttonClass("secondary")}>
              Buscar
            </button>
          </form>
          {rows.length === 0 ? (
            <EmptyState
              title={q ? "Nenhum cliente encontrado" : "Nenhum cliente ainda"}
              description={q ? "Tente outro nome ou parte do telefone." : "Os clientes aparecem aqui após o primeiro agendamento ou cadastro manual."}
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-line bg-surface">
              <table className="w-full text-sm">
                <thead className="bg-canvas text-left text-xs text-muted">
                  <tr>
                    <th className="px-4 py-2 font-medium">Nome</th>
                    <th className="px-4 py-2 font-medium">Telefone</th>
                    <th className="px-4 py-2 text-right font-medium">Agendamentos</th>
                    <th className="px-4 py-2 font-medium">Última visita</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((c) => (
                    <tr key={c.id} className="hover:bg-canvas">
                      <td className="px-4 py-2">
                        <Link href={`/painel/clientes/${c.id}`} className="font-medium text-accent hover:underline">
                          {c.name}
                        </Link>
                      </td>
                      <td className="tabular px-4 py-2">
                        {formatPhone(c.phoneNormalized)} {c.sharedPhoneCount > 0 ? <Badge tone="warn">compartilhado</Badge> : null}
                      </td>
                      <td className="tabular px-4 py-2 text-right">{c.appointmentsCount}</td>
                      <td className="px-4 py-2 text-muted">{c.lastVisit ? formatDate(c.lastVisit, company.timezone) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <Card>
          <h2 className="mb-4 font-semibold">Novo cliente</h2>
          <CreateCustomerForm />
        </Card>
      </div>
    </>
  );
}
