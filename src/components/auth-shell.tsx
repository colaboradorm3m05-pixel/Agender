import Link from "next/link";
import type { ReactNode } from "react";
import { CalendarCheck, Link2, Users } from "lucide-react";
import { APP_NAME } from "@/config/app";

export function Logo({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <Link href="/" className={`inline-flex items-center gap-2.5 font-semibold tracking-tight ${inverted ? "text-white" : "text-ink"} ${className ?? ""}`}>
      <span aria-hidden className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-[#f3c77a] to-[#b8741a] text-[#13201e] shadow-sm">
        <CalendarCheck className="h-[18px] w-[18px]" strokeWidth={2.4} />
      </span>
      <span className="text-[1.05rem]">{APP_NAME}</span>
    </Link>
  );
}

const HIGHLIGHTS = [
  { icon: Link2, text: "Link de agendamento para enviar no WhatsApp e Instagram" },
  { icon: CalendarCheck, text: "Agenda sem horários duplicados, por profissional" },
  { icon: Users, text: "Clientes, histórico e pagamentos no mesmo lugar" },
];

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-sidebar p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 h-80 w-80 rounded-full bg-[#f3c77a]/20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-accent/60 blur-3xl" />
        <Logo inverted className="relative text-lg" />
        <div className="relative max-w-md">
          <h2 className="text-3xl leading-tight font-semibold tracking-tight">Sua agenda cheia, sem conflito de horários.</h2>
          <ul className="mt-8 space-y-4">
            {HIGHLIGHTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-sidebar-text">
                <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/10 text-[#f3c77a]">
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-sidebar-text/80">Para barbearias, salões e estúdios de beleza.</p>
      </section>
      <section className="flex flex-col items-center justify-center px-4 py-12">
        <Logo className="mb-8 text-lg lg:hidden" />
        <div className="w-full max-w-sm rounded-3xl border border-line/80 bg-surface p-7 shadow-[var(--shadow-lift)]">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
          <div className="mt-6">{children}</div>
        </div>
        {footer ? <div className="mt-6 text-sm text-muted">{footer}</div> : null}
      </section>
    </main>
  );
}
