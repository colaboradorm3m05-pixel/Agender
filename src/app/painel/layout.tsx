import { redirect } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { segmentConfig } from "@/config/segments";
import { Logo } from "@/components/auth-shell";
import { SignOutButton } from "@/components/auth-form";
import { PanelNav, type NavItem } from "@/components/panel-nav";
import { Avatar } from "@/components/ui";
import { bookingPath } from "@/lib/urls";
import { can } from "@/server/permissions";
import { requireActor } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: LayoutProps<"/painel">) {
  const { user, actor, company } = await requireActor();
  if (actor.role === "owner" && !company.onboardingCompletedAt) redirect("/onboarding");
  const labels = segmentConfig(company.segment);

  const items: (NavItem & { show: boolean })[] = [
    { href: "/painel", label: "Visão geral", icon: "overview", show: true },
    { href: "/painel/agenda", label: "Agenda", icon: "agenda", show: true },
    { href: "/painel/clientes", label: "Clientes", icon: "customers", show: can(actor, "customers.view") },
    { href: "/painel/servicos", label: "Serviços", icon: "services", show: can(actor, "services.manage") },
    { href: "/painel/profissionais", label: labels.professional.plural, icon: "staff", show: can(actor, "staff.manage") },
    { href: "/painel/pagamentos", label: "Pagamentos", icon: "payments", show: can(actor, "payments.manage") },
    {
      href: "/painel/relatorios",
      label: can(actor, "reports.view") ? "Relatórios" : "Meus atendimentos",
      icon: "reports",
      show: can(actor, "reports.view_own"),
    },
    { href: "/painel/configuracoes", label: "Configurações", icon: "settings", show: can(actor, "company.manage") },
  ];

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2"
      >
        Pular para o conteúdo
      </a>
      <aside className="bg-sidebar text-sidebar-text lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:p-4">
        <div className="flex items-center justify-between px-4 py-3 lg:mb-6 lg:px-1 lg:py-1">
          <Logo inverted />
          <div className="lg:hidden">
            <SignOutButton className="text-sm text-sidebar-text hover:text-white" />
          </div>
        </div>

        <div className="mx-1 mb-5 hidden rounded-2xl bg-sidebar-hover p-3 lg:block">
          <p className="text-[11px] font-semibold tracking-wider text-[#f3c77a] uppercase">{labels.label}</p>
          <p className="mt-0.5 truncate text-sm font-semibold text-white" title={company.name}>
            {company.name}
          </p>
          {company.isDemo ? (
            <p className="mt-2 inline-block rounded-full bg-[#f3c77a]/15 px-2 py-0.5 text-[11px] font-medium text-[#f3c77a]">Dados demonstrativos</p>
          ) : null}
          {can(actor, "company.manage") ? (
            <a
              href={bookingPath(company.slug)}
              target="_blank"
              rel="noreferrer"
              className="mt-2 flex items-center gap-1.5 text-xs text-sidebar-text hover:text-white"
            >
              <ExternalLink aria-hidden className="h-3.5 w-3.5" /> Ver página de agendamento
            </a>
          ) : null}
        </div>

        <PanelNav items={items.filter((i) => i.show)} />

        <div className="mt-auto hidden items-center gap-3 border-t border-white/10 px-1 pt-4 lg:flex">
          <Avatar name={user.name} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{user.name}</p>
            <p className="truncate text-xs">{actor.role === "owner" ? "Proprietário" : labels.professional.singular}</p>
          </div>
          <SignOutButton className="rounded-lg px-2 py-1 text-xs text-sidebar-text hover:bg-sidebar-hover hover:text-white" />
        </div>
      </aside>
      <main id="conteudo" className="mx-auto w-full max-w-6xl min-w-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {company.isDemo ? (
          <p className="mb-4 rounded-xl border border-warn/30 bg-warn-soft px-3 py-2 text-xs text-warn lg:hidden">
            Empresa de demonstração — os dados são fictícios.
          </p>
        ) : null}
        <div className="animate-fade-up">{children}</div>
      </main>
    </div>
  );
}
