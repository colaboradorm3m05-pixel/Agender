import type { Metadata } from "next";
import { getDb } from "@/db";
import { isValidLocalDate, todayIn } from "@/domain/time";
import { Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { requireActor } from "@/server/session";
import { listServices } from "@/server/services/catalog";
import { getCustomerWithHistory } from "@/server/services/customers";
import { listProfessionals } from "@/server/services/staff";
import { NewAppointmentForm } from "./new-appointment-form";

export const metadata: Metadata = { title: "Novo agendamento" };

export default async function NewAppointmentPage(props: PageProps<"/painel/agenda/novo">) {
  const { actor, company } = await requireActor("appointment.manage_all");
  const sp = await props.searchParams;
  const db = getDb();
  const [pros, svcs] = await Promise.all([listProfessionals(db, actor), listServices(db, actor)]);
  const date = typeof sp.data === "string" && isValidLocalDate(sp.data) ? sp.data : todayIn(company.timezone);
  let preset: { id: string; name: string; phone: string } | null = null;
  if (typeof sp.cliente === "string") {
    try {
      const { customer } = await getCustomerWithHistory(db, actor, sp.cliente);
      preset = { id: customer.id, name: customer.name, phone: customer.phone };
    } catch {
      preset = null;
    }
  }
  return (
    <>
      <PageHeader title="Novo agendamento" description="Agendamentos pela equipe não exigem a antecedência mínima do link público." />
      {pros.length === 0 || svcs.length === 0 ? (
        <EmptyState
          title="Cadastre profissionais e serviços primeiro"
          action={<LinkButton href={pros.length === 0 ? "/painel/profissionais" : "/painel/servicos"}>Ir para cadastro</LinkButton>}
        />
      ) : (
        <Card className="max-w-3xl">
          <NewAppointmentForm
            professionals={pros.map((p) => ({ id: p.id, name: p.name, serviceIds: p.serviceIds }))}
            services={svcs.map((s) => ({ id: s.id, name: s.name, priceCents: s.priceCents, durationMinutes: s.durationMinutes }))}
            defaultDate={date}
            defaultProfessionalId={typeof sp.profissional === "string" ? sp.profissional : undefined}
            presetCustomer={preset}
          />
        </Card>
      )}
    </>
  );
}
