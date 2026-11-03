import type { Metadata } from "next";
import { getDb } from "@/db";
import { isValidLocalDate, todayIn } from "@/domain/time";
import { Card, PageHeader } from "@/components/ui";
import { requireActor } from "@/server/session";
import { listProfessionals } from "@/server/services/staff";
import { BlockForm } from "./block-form";

export const metadata: Metadata = { title: "Bloquear horário" };

export default async function BlockPage(props: PageProps<"/painel/agenda/bloqueio">) {
  const { actor, company } = await requireActor("blocks.manage_all");
  const sp = await props.searchParams;
  const pros = await listProfessionals(getDb(), actor);
  const date = typeof sp.data === "string" && isValidLocalDate(sp.data) ? sp.data : todayIn(company.timezone);
  return (
    <>
      <PageHeader
        title="Bloquear horário"
        description="O período deixa de ser oferecido no link público. Se já houver atendimento confirmado, reagende ou cancele antes."
      />
      <Card className="max-w-xl">
        <BlockForm
          professionals={pros.map((p) => ({ id: p.id, name: p.name }))}
          defaultDate={date}
          defaultProfessionalId={typeof sp.profissional === "string" ? sp.profissional : ""}
        />
      </Card>
    </>
  );
}
