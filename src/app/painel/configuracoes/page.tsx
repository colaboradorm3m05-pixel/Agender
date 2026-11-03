import type { Metadata } from "next";
import { getDb } from "@/db";
import { PublicLinkBox } from "@/components/copy-button";
import { Card, PageHeader } from "@/components/ui";
import { appUrl, bookingPath } from "@/lib/urls";
import { requireActor } from "@/server/session";
import { getCompanyHours } from "@/server/services/companies";
import { HoursSettings, PolicySettings, ProfileSettings } from "./forms";

export const metadata: Metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const { actor, company } = await requireActor("company.manage");
  const hours = await getCompanyHours(getDb(), actor.companyId);
  return (
    <>
      <PageHeader title="Configurações" />
      <div className="space-y-6">
        <Card>
          <h2 className="mb-1 font-semibold">Link público de agendamento</h2>
          <p className="mb-3 text-sm text-muted">Compartilhe com seus clientes.</p>
          <PublicLinkBox url={appUrl(bookingPath(company.slug))} />
        </Card>
        <div className="grid gap-6 xl:grid-cols-2 [&>*]:min-w-0">
          <Card>
            <h2 className="mb-4 font-semibold">Dados da empresa</h2>
            <ProfileSettings company={company} baseUrl={appUrl("")} />
          </Card>
          <Card>
            <h2 className="mb-4 font-semibold">Regras do agendamento online</h2>
            <PolicySettings company={company} />
          </Card>
        </div>
        <Card>
          <h2 className="mb-4 font-semibold">Fuso e horário de funcionamento</h2>
          <HoursSettings timezone={company.timezone} hours={hours} />
        </Card>
      </div>
    </>
  );
}
