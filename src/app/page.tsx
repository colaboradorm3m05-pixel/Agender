import Link from "next/link";
import { ArrowRight, CalendarCheck, Clock, Link2, Scissors, ShieldCheck, UsersRound, Wallet } from "lucide-react";
import { APP_NAME, APP_TAGLINE } from "@/config/app";
import { Logo } from "@/components/auth-shell";
import { buttonClass, IconBadge, type Tone } from "@/components/ui";
import { getSession } from "@/server/session";

export const dynamic = "force-dynamic";

const FEATURES: { title: string; text: string; icon: typeof Link2; tone: Tone }[] = [
  { title: "Link de agendamento", text: "Seus clientes escolhem serviço, profissional, dia e horário sem precisar criar conta.", icon: Link2, tone: "gold" },
  { title: "Agenda sem conflitos", text: "Horários respeitam funcionamento, jornada, pausas, bloqueios e a duração de cada serviço.", icon: CalendarCheck, tone: "accent" },
  { title: "Equipe organizada", text: "Cada profissional vê apenas a própria agenda. Você controla serviços, preços e horários.", icon: UsersRound, tone: "info" },
  { title: "Clientes e financeiro", text: "Histórico de atendimentos, comissões, relatórios e registro do que foi recebido.", icon: Wallet, tone: "ok" },
];

const STEPS = [
  { n: "1", title: "Cadastre sua empresa", text: "Horários, profissionais e serviços em poucos minutos." },
  { n: "2", title: "Compartilhe o link", text: "Envie no WhatsApp, coloque na bio do Instagram." },
  { n: "3", title: "Receba agendamentos", text: "Tudo aparece na sua agenda, sem conflito de horários." },
];

/** Ilustração estática da página de agendamento (exemplo, não são dados reais). */
function BookingMock() {
  const times = ["09:00", "09:30", "10:00", "10:30", "11:00", "14:00", "14:30", "15:00"];
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-sm rotate-1 rounded-3xl bg-surface p-5 text-ink shadow-2xl ring-1 ring-black/5">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-sidebar text-sm font-bold text-[#f3c77a]">BS</span>
        <div>
          <p className="text-[10px] font-semibold tracking-wider text-gold uppercase">Barbearia</p>
          <p className="font-semibold">Sua Barbearia</p>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3 rounded-2xl border border-line p-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent-soft text-accent">
          <Scissors className="h-4 w-4" />
        </span>
        <div className="flex-1">
          <p className="text-sm font-semibold">Corte + barba</p>
          <p className="flex items-center gap-1 text-xs text-muted">
            <Clock className="h-3 w-3" /> 1h
          </p>
        </div>
        <p className="text-sm font-bold">R$ 70,00</p>
      </div>
      <p className="mt-4 text-xs font-semibold tracking-wide text-muted uppercase">Horários</p>
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {times.map((t, i) => (
          <span
            key={t}
            className={`tabular rounded-lg border py-1.5 text-center text-xs font-semibold ${i === 2 ? "border-accent bg-accent text-white" : "border-line-strong"}`}
          >
            {t}
          </span>
        ))}
      </div>
      <span className="mt-4 flex h-10 items-center justify-center rounded-xl bg-accent text-sm font-semibold text-white">Confirmar agendamento</span>
    </div>
  );
}

export default async function Home() {
  const session = await getSession();
  return (
    <div className="min-h-screen">
      <div className="relative overflow-hidden bg-sidebar text-white">
        <div aria-hidden className="pointer-events-none absolute -top-32 right-0 h-[28rem] w-[28rem] rounded-full bg-[#f3c77a]/15 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-40 -left-20 h-[26rem] w-[26rem] rounded-full bg-accent/60 blur-3xl" />
        <header className="relative mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
          <Logo inverted />
          <nav className="flex items-center gap-2">
            {session ? (
              <Link href="/painel" className="inline-flex h-9 items-center rounded-xl bg-[#f3c77a] px-4 text-sm font-semibold text-[#13201e] hover:bg-[#f7d595]">
                Ir para o painel
              </Link>
            ) : (
              <>
                <Link href="/entrar" className="inline-flex h-9 items-center rounded-xl px-3 text-sm font-medium text-sidebar-text hover:text-white">
                  Entrar
                </Link>
                <Link href="/criar-conta" className="inline-flex h-9 items-center rounded-xl bg-[#f3c77a] px-4 text-sm font-semibold text-[#13201e] hover:bg-[#f7d595]">
                  Criar conta
                </Link>
              </>
            )}
          </nav>
        </header>
        <section className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pt-10 pb-20 lg:grid-cols-[1.15fr_1fr] lg:pt-16 lg:pb-28">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-[#f3c77a]">
              <Scissors aria-hidden className="h-3.5 w-3.5" /> Para barbearias e estúdios de beleza
            </p>
            <h1 className="mt-5 text-4xl leading-[1.08] font-semibold tracking-tight sm:text-5xl lg:text-[3.4rem]">
              Sua agenda online, <span className="text-[#f3c77a]">cheia e organizada.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-sidebar-text">{APP_TAGLINE}. Configure em poucos minutos e compartilhe seu link de agendamento.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/criar-conta"
                className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#f3c77a] px-6 text-sm font-semibold text-[#13201e] shadow-lg shadow-black/20 hover:bg-[#f7d595]"
              >
                Começar agora <ArrowRight aria-hidden className="h-4 w-4" />
              </Link>
              <Link
                href="/b/barbearia-demonstracao"
                className="inline-flex h-12 items-center rounded-xl border border-white/20 px-6 text-sm font-medium text-white hover:bg-white/10"
              >
                Ver página de demonstração
              </Link>
            </div>
            <p className="mt-6 flex items-center gap-2 text-xs text-sidebar-text">
              <ShieldCheck aria-hidden className="h-4 w-4 text-[#f3c77a]" /> Seus clientes agendam sem criar conta.
            </p>
          </div>
          <BookingMock />
        </section>
      </div>

      <main className="mx-auto max-w-6xl px-4">
        <section className="-mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="relative rounded-2xl border border-line/80 bg-surface p-5 shadow-[var(--shadow-card)]">
              <IconBadge icon={f.icon} tone={f.tone} />
              <h2 className="mt-4 font-semibold">{f.title}</h2>
              <p className="mt-1 text-sm text-muted">{f.text}</p>
            </div>
          ))}
        </section>

        <section className="py-20">
          <p className="text-center text-xs font-semibold tracking-wider text-gold uppercase">Como funciona</p>
          <h2 className="mt-2 text-center text-3xl font-semibold tracking-tight">Pronto para receber agendamentos hoje</h2>
          <ol className="mt-10 grid gap-6 sm:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="rounded-2xl bg-surface p-6 text-center shadow-[var(--shadow-card)]">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-sidebar text-lg font-bold text-[#f3c77a]">{s.n}</span>
                <h3 className="mt-4 font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm text-muted">{s.text}</p>
              </li>
            ))}
          </ol>
          <div className="mt-10 flex justify-center">
            <Link href="/criar-conta" className={buttonClass("primary", "md", "h-12 px-6")}>
              Criar minha agenda <ArrowRight aria-hidden className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>
      <footer className="border-t border-line py-6 text-center text-xs text-muted">{APP_NAME}</footer>
    </div>
  );
}
