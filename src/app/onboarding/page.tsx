import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { segmentConfig } from "@/config/segments";
import { formatCents } from "@/domain/money";
import { formatDuration } from "@/domain/format";
import { Logo } from "@/components/auth-shell";
import { SignOutButton } from "@/components/auth-form";
import { PublicLinkBox } from "@/components/copy-button";
import { Badge, buttonClass, cx } from "@/components/ui";
import { appUrl, bookingPath } from "@/lib/urls";
import { getActorContext, requireUser } from "@/server/session";
import { getCompanyHours, getOnboardingStatus } from "@/server/services/companies";
import { listServices } from "@/server/services/catalog";
import { listProfessionals } from "@/server/services/staff";
import { CompanyStep, FinishButton, HoursStep, LinksStep, LocationStep, ProfessionalStep, ServiceStep } from "./forms";

export const metadata: Metadata = { title: "Configuração inicial" };

const STEPS = [
  "Empresa",
  "Endereço",
  "Horários",
  "Profissionais",
  "Serviços",
  "Vínculos",
  "Link público",
] as const;

export default async function OnboardingPage(props: PageProps<"/onboarding">) {
  await requireUser();
  const sp = await props.searchParams;
  const ctx = await getActorContext();
  const actor = ctx?.actor;
  const company = ctx?.company;

  if (actor && actor.role !== "owner") redirect("/painel");

  const status = actor ? await getOnboardingStatus(getDb(), actor) : null;
  const done = [
    Boolean(status),
    Boolean(status?.location),
    Boolean(status?.hours),
    Boolean(status?.professional),
    Boolean(status?.service),
    Boolean(status?.link),
    Boolean(status?.completed),
  ];
  const firstPending = done.findIndex((d) => !d) + 1 || 7;
  const requested = Number(sp.etapa);
  // Não deixa pular etapas obrigatórias anteriores.
  const step = !actor ? 1 : Number.isInteger(requested) && requested >= 2 && requested <= firstPending ? requested : firstPending;

  const labels = segmentConfig(company?.segment);
  const db = getDb();
  const [pros, svcs, hours] = actor
    ? await Promise.all([listProfessionals(db, actor), listServices(db, actor), getCompanyHours(db, actor.companyId)])
    : [[], [], []];

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <Logo />
        <SignOutButton />
      </div>

      <nav aria-label="Etapas da configuração" className="mb-6">
        <ol className="flex flex-wrap gap-2">
          {STEPS.map((label, i) => {
            const n = i + 1;
            const reachable = actor && n <= firstPending && n >= 2;
            const content = (
              <span
                className={cx(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
                  n === step ? "border-accent bg-accent text-white" : done[i] ? "border-accent/30 bg-accent-soft text-accent" : "border-line bg-surface text-muted",
                )}
              >
                <span aria-hidden>{done[i] && n !== step ? "✓" : n}</span> {label}
              </span>
            );
            return (
              <li key={label} aria-current={n === step ? "step" : undefined}>
                {reachable && n !== step ? <Link href={`/onboarding?etapa=${n}`}>{content}</Link> : content}
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
        {step === 1 && (
          <Section title="Sua empresa" text="Como o estabelecimento aparece para os clientes.">
            <CompanyStep />
          </Section>
        )}
        {step === 2 && company && (
          <Section title="Endereço e atendimento" text="Ajuda o cliente a chegar até você.">
            <LocationStep
              initial={{
                phone: company.phone ?? "",
                addressLine: company.addressLine ?? "",
                city: company.city ?? "",
                serviceInfo: company.serviceInfo ?? "",
              }}
            />
          </Section>
        )}
        {step === 3 && company && (
          <Section title="Fuso e horário de funcionamento" text="Os horários oferecidos ao cliente respeitam esse período.">
            <HoursStep timezone={company.timezone} hours={hours} />
          </Section>
        )}
        {step === 4 && (
          <Section title={labels.professional.plural} text={`Cadastre pelo menos um ${labels.professional.singular.toLowerCase()}.`}>
            <ItemList items={pros.map((p) => ({ id: p.id, title: p.name }))} empty="Nenhum cadastrado ainda." />
            <ProfessionalStep label={labels.professional.singular} />
            <NextLink step={5} enabled={pros.length > 0} />
          </Section>
        )}
        {step === 5 && (
          <Section title="Serviços" text="Preço e duração podem ser alterados quando quiser; agendamentos já feitos não mudam.">
            {labels.serviceSuggestions.length ? (
              <p className="mb-3 text-xs text-muted">
                Sugestões: {labels.serviceSuggestions.map((s) => `${s.name} (${s.durationMinutes} min)`).join(", ")}
              </p>
            ) : null}
            <ItemList
              items={svcs.map((s) => ({ id: s.id, title: s.name, meta: `${formatCents(s.priceCents)} · ${formatDuration(s.durationMinutes)}` }))}
              empty="Nenhum serviço ainda."
            />
            <ServiceStep />
            <NextLink step={6} enabled={svcs.length > 0} />
          </Section>
        )}
        {step === 6 && (
          <Section title="Quem faz o quê" text="Marque os serviços que cada profissional realiza.">
            <LinksStep professionals={pros.map((p) => ({ id: p.id, name: p.name, serviceIds: p.serviceIds }))} services={svcs} />
          </Section>
        )}
        {step === 7 && company && (
          <Section title="Seu link de agendamento está pronto" text="Compartilhe no WhatsApp, Instagram ou onde seus clientes estão.">
            <PublicLinkBox url={appUrl(bookingPath(company.slug))} />
            <p className="my-4 text-sm text-muted">
              Você pode alterar o endereço do link, as cores e as regras de agendamento em Configurações.
            </p>
            <FinishButton />
          </Section>
        )}
      </div>
      <p className="mt-4 text-center text-xs text-muted">Tudo o que você preencher aqui pode ser editado depois.</p>
    </main>
  );
}

function Section({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return (
    <section className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-muted">{text}</p>
      </header>
      {children}
    </section>
  );
}

function ItemList({ items, empty }: { items: { id: string; title: string; meta?: string }[]; empty: string }) {
  if (!items.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-line rounded-lg border border-line">
      {items.map((i) => (
        <li key={i.id} className="flex items-center justify-between px-3 py-2 text-sm">
          <span className="font-medium">{i.title}</span>
          {i.meta ? <Badge>{i.meta}</Badge> : null}
        </li>
      ))}
    </ul>
  );
}

function NextLink({ step, enabled }: { step: number; enabled: boolean }) {
  return (
    <div className="border-t border-line pt-4">
      {enabled ? (
        <Link href={`/onboarding?etapa=${step}`} className={buttonClass("primary")}>
          Continuar
        </Link>
      ) : (
        <span className={buttonClass("primary")} aria-disabled="true" style={{ opacity: 0.5, cursor: "not-allowed" }}>
          Continuar
        </span>
      )}
    </div>
  );
}
