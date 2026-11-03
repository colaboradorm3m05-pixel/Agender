"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { publicBookingAction, publicSlotsAction, type BookingConfirmation } from "@/app/actions/public";
import { formatCents } from "@/domain/money";
import { formatDateLong, formatDuration, formatLocalDateLong, formatTime } from "@/domain/format";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Moon,
  Phone,
  Scissors,
  Sparkles,
  Sun,
  Sunrise,
  UserRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Alert, Avatar, cx, inputClass, Spinner } from "@/components/ui";
import { CopyButton } from "@/components/copy-button";

type Service = { id: string; name: string; description: string | null; priceCents: number; durationMinutes: number };
type Professional = { id: string; name: string; photoUrl: string | null; serviceIds: string[] };
type Slot = { start: string; label: string };
type Step = "service" | "professional" | "time" | "details" | "review" | "done";

const ANY = "any";

const brandButton =
  "inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-[var(--brand-text)] shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50";

/** Fundo suave na cor da marca da empresa. */
const brandTint = "bg-[color-mix(in_srgb,var(--brand)_10%,white)] text-[var(--brand)]";

/** Agrupa horários em manhã, tarde e noite pelo rótulo HH:MM (já no fuso da empresa). */
function groupSlots(slots: Slot[]): { label: string; icon: LucideIcon; slots: Slot[] }[] {
  const hour = (s: Slot) => Number(s.label.slice(0, 2));
  return [
    { label: "Manhã", icon: Sunrise, slots: slots.filter((s) => hour(s) < 12) },
    { label: "Tarde", icon: Sun, slots: slots.filter((s) => hour(s) >= 12 && hour(s) < 18) },
    { label: "Noite", icon: Moon, slots: slots.filter((s) => hour(s) >= 18) },
  ].filter((g) => g.slots.length > 0);
}

export function BookingFlow({
  slug,
  timezone,
  services,
  professionals,
  dates,
  professionalLabel,
}: {
  slug: string;
  timezone: string;
  services: Service[];
  professionals: Professional[];
  dates: { date: string; open: boolean }[];
  professionalLabel: string;
}) {
  const [step, setStep] = useState<Step>("service");
  const [service, setService] = useState<Service | null>(null);
  const [professionalId, setProfessionalId] = useState<string>(ANY);
  const [date, setDate] = useState<string>(() => dates.find((d) => d.open)?.date ?? dates[0].date);
  const [reloadCount, setReloadCount] = useState(0);
  const [slotsState, setSlotsState] = useState<{ key: string; slots: Slot[]; error: string | null } | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [details, setDetails] = useState({ name: "", phone: "", email: "", website: "" });
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const prosForService = service ? professionals.filter((p) => p.serviceIds.includes(service.id)) : [];
  const selectedPro = professionals.find((p) => p.id === professionalId);

  // Leva o foco ao título de cada etapa (leitores de tela e teclado).
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const slotsKey = service ? `${service.id}|${professionalId}|${date}|${reloadCount}` : "";
  useEffect(() => {
    if (step !== "time" || !service) return;
    let active = true;
    publicSlotsAction(slug, { serviceId: service.id, professionalId, date }).then((res) => {
      if (!active) return;
      setSlotsState({ key: slotsKey, slots: res.ok ? res.data : [], error: res.ok ? null : res.error });
    });
    return () => {
      active = false;
    };
  }, [step, slug, service, professionalId, date, slotsKey]);
  const current = slotsState?.key === slotsKey ? slotsState : null;
  const slots = current ? current.slots : null;
  const slotsError = current?.error ?? null;

  function chooseService(s: Service) {
    setService(s);
    setSlot(null);
    const pros = professionals.filter((p) => p.serviceIds.includes(s.id));
    if (pros.length === 1) {
      setProfessionalId(pros[0].id);
      setStep("time");
    } else {
      setProfessionalId(ANY);
      setStep("professional");
    }
  }

  function validateDetails() {
    const errors: Record<string, string> = {};
    if (details.name.trim().length < 2) errors.name = "Informe seu nome.";
    const digits = details.phone.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 13) errors.phone = "Informe um telefone com DDD.";
    if (details.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email)) errors.email = "E-mail inválido.";
    setDetailErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function confirm() {
    if (!service || !slot) return;
    setSubmitting(true);
    setNotice(null);
    const res = await publicBookingAction(slug, {
      serviceId: service.id,
      professionalId,
      startsAt: slot.start,
      ...details,
    });
    setSubmitting(false);
    if (res.ok) {
      setConfirmation(res.data);
      setStep("done");
      return;
    }
    if (res.code?.startsWith("slot_")) {
      // Horário ocupado ou inválido no momento da confirmação: volta e mostra novas opções.
      setSlot(null);
      setReloadCount((n) => n + 1);
      setNotice(`${res.error} Escolha um dos horários disponíveis abaixo.`);
      setStep("time");
      return;
    }
    if (res.fieldErrors) {
      setDetailErrors(res.fieldErrors);
      setNotice(res.error);
      setStep("details");
      return;
    }
    setNotice(res.error);
  }

  const back = () => {
    setNotice(null);
    if (step === "professional") setStep("service");
    else if (step === "time") setStep(prosForService.length > 1 ? "professional" : "service");
    else if (step === "details") setStep("time");
    else if (step === "review") setStep("details");
  };

  const stepNumber = { service: 1, professional: 2, time: 3, details: 4, review: 5, done: 5 }[step];
  const STEP_LABELS = ["Serviço", "Profissional", "Horário", "Seus dados", "Confirmar"];

  return (
    <div className="overflow-hidden rounded-3xl border border-line/80 bg-surface shadow-[var(--shadow-lift)]">
      {step !== "done" ? (
        <div className="border-b border-line px-4 pt-4 pb-3 sm:px-6">
          <div className="flex items-center justify-between">
            {step !== "service" ? (
              <button type="button" onClick={back} className="inline-flex items-center gap-1 text-sm font-medium text-ink-soft hover:text-ink">
                <ChevronLeft aria-hidden className="h-4 w-4" /> Voltar
              </button>
            ) : (
              <span className="text-sm font-medium text-ink-soft">Agende em poucos passos</span>
            )}
            <span className="text-xs font-medium text-muted" aria-live="polite">
              Etapa {stepNumber} de 5 · {STEP_LABELS[stepNumber - 1]}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-5 gap-1.5" aria-hidden>
            {STEP_LABELS.map((label, i) => (
              <span key={label} className={cx("h-1.5 rounded-full transition-colors", i < stepNumber ? "bg-[var(--brand)]" : "bg-line")} />
            ))}
          </div>
        </div>
      ) : null}

      <div className="p-4 sm:p-6">
        {notice ? (
          <div className="mb-4">
            <Alert tone="warn">{notice}</Alert>
          </div>
        ) : null}

        {step === "service" && (
          <section>
            <StepTitle ref={headingRef}>Escolha o serviço</StepTitle>
            <ul className="mt-4 space-y-2">
              {services.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => chooseService(s)}
                    className="group flex w-full items-center gap-4 rounded-2xl border border-line px-4 py-3.5 text-left transition-all hover:-translate-y-px hover:border-[var(--brand)] hover:shadow-[var(--shadow-card)]"
                  >
                    <span aria-hidden className={cx("grid h-11 w-11 shrink-0 place-items-center rounded-xl", brandTint)}>
                      <Scissors className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{s.name}</span>
                      <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted">
                        <Clock aria-hidden className="h-3.5 w-3.5" /> {formatDuration(s.durationMinutes)}
                      </span>
                      {s.description ? <span className="mt-1 block text-sm text-ink-soft">{s.description}</span> : null}
                    </span>
                    <span className="tabular shrink-0 text-base font-bold">{formatCents(s.priceCents)}</span>
                    <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {step === "professional" && service && (
          <section>
            <StepTitle ref={headingRef}>Com quem?</StepTitle>
            <p className="mt-1 text-sm text-muted">{service.name}</p>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              <li>
                <ProButton
                  any
                  name="Sem preferência"
                  hint="Primeiro horário disponível"
                  onClick={() => {
                    setProfessionalId(ANY);
                    setSlot(null);
                    setStep("time");
                  }}
                />
              </li>
              {prosForService.map((p) => (
                <li key={p.id}>
                  <ProButton
                    name={p.name}
                    photoUrl={p.photoUrl}
                    hint={professionalLabel}
                    onClick={() => {
                      setProfessionalId(p.id);
                      setSlot(null);
                      setStep("time");
                    }}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}

        {step === "time" && service && (
          <section>
            <StepTitle ref={headingRef}>Escolha dia e horário</StepTitle>
            <p className="mt-1 text-sm text-muted">
              {service.name} · {professionalId === ANY ? "sem preferência de profissional" : selectedPro?.name}
            </p>
            <DateStrip dates={dates} value={date} onChange={(d) => { setDate(d); setSlot(null); }} />
            <div className="mt-4 min-h-24" aria-live="polite">
              {slots === null ? (
                <Spinner label="Buscando horários" />
              ) : slotsError ? (
                <Alert tone="danger">{slotsError}</Alert>
              ) : slots.length === 0 ? (
                <p className="rounded-lg bg-canvas px-4 py-6 text-center text-sm text-muted">
                  Nenhum horário disponível em {formatLocalDateLong(date)}. Tente outro dia.
                </p>
              ) : (
                <div role="radiogroup" aria-label={`Horários em ${formatLocalDateLong(date)}`} className="space-y-4">
                  {groupSlots(slots).map((group) => (
                    <div key={group.label}>
                      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
                        <group.icon aria-hidden className="h-3.5 w-3.5" /> {group.label}
                      </p>
                      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                        {group.slots.map((s) => (
                          <button
                            key={s.start}
                            type="button"
                            role="radio"
                            aria-checked={slot?.start === s.start}
                            onClick={() => {
                              setSlot(s);
                              setNotice(null);
                              setStep("details");
                            }}
                            className={cx(
                              "tabular h-11 rounded-xl border text-sm font-semibold transition-colors",
                              slot?.start === s.start
                                ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--brand-text)]"
                                : "border-line-strong hover:border-[var(--brand)] hover:bg-[color-mix(in_srgb,var(--brand)_8%,white)]",
                            )}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {step === "details" && (
          <section>
            <StepTitle ref={headingRef}>Seus dados</StepTitle>
            <p className="mt-1 text-sm text-muted">Usados apenas por este estabelecimento para confirmar seu horário.</p>
            <form
              className="mt-4 space-y-4"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                if (validateDetails()) setStep("review");
              }}
            >
              <Input label="Nome" name="name" autoComplete="name" value={details.name} error={detailErrors.name} onChange={(v) => setDetails({ ...details, name: v })} />
              <Input
                label="Telefone (WhatsApp)"
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="(11) 98765-4321"
                value={details.phone}
                error={detailErrors.phone}
                onChange={(v) => setDetails({ ...details, phone: v })}
              />
              <Input
                label="E-mail (opcional)"
                name="email"
                type="email"
                autoComplete="email"
                value={details.email}
                error={detailErrors.email}
                onChange={(v) => setDetails({ ...details, email: v })}
              />
              {/* Honeypot anti-robô: escondido de pessoas e de leitores de tela. */}
              <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                <label>
                  Website
                  <input tabIndex={-1} autoComplete="off" value={details.website} onChange={(e) => setDetails({ ...details, website: e.target.value })} />
                </label>
              </div>
              <button type="submit" className={cx(brandButton, "w-full")}>
                Revisar agendamento
              </button>
            </form>
          </section>
        )}

        {step === "review" && service && slot && (
          <section>
            <StepTitle ref={headingRef}>Confira e confirme</StepTitle>
            <dl className="mt-4 divide-y divide-line rounded-2xl border border-line bg-canvas/50 text-sm">
              <Row icon={Scissors} label="Serviço">
                {service.name} · {formatDuration(service.durationMinutes)}
              </Row>
              <Row icon={UserRound} label="Profissional">
                {professionalId === ANY ? "Sem preferência (definido na confirmação)" : selectedPro?.name}
              </Row>
              <Row icon={CalendarDays} label="Data">
                {capitalize(formatDateLong(new Date(slot.start), timezone))}
              </Row>
              <Row icon={Clock} label="Horário">
                {slot.label}
              </Row>
              <Row icon={Wallet} label="Valor">
                {formatCents(service.priceCents)} (pago no local)
              </Row>
              <Row icon={Phone} label="Seus dados">
                {details.name} · {details.phone}
                {details.email ? ` · ${details.email}` : ""}
              </Row>
            </dl>
            <button type="button" onClick={confirm} disabled={submitting} className={cx(brandButton, "mt-4 w-full")}>
              {submitting ? "Confirmando…" : "Confirmar agendamento"}
            </button>
          </section>
        )}

        {step === "done" && confirmation && (
          <section className="text-center">
            <div aria-hidden className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-ok-soft text-ok ring-8 ring-ok-soft/50">
              <CheckCircle2 className="h-9 w-9" />
            </div>
            <StepTitle ref={headingRef}>Agendamento confirmado!</StepTitle>
            <p className="mt-2 text-sm text-ink-soft">
              {confirmation.serviceName} com {confirmation.professionalName}
              <br />
              <strong>
                {capitalize(formatDateLong(new Date(confirmation.startsAt), timezone))} às {formatTime(new Date(confirmation.startsAt), timezone)}
              </strong>
            </p>
            <p className="mt-3 text-sm">
              Código da reserva: <span className="font-mono font-semibold">{confirmation.publicCode}</span>
            </p>
            <div className="mt-5 rounded-xl border border-line bg-canvas p-4 text-left text-sm">
              <p className="font-medium">Guarde o link da sua reserva</p>
              <p className="mt-1 text-muted">Com ele você consulta e, se o estabelecimento permitir, cancela ou reagenda. Não compartilhe.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href={confirmation.managePath} className={brandButton}>
                  Ver minha reserva
                </Link>
                <CopyButton value={typeof window !== "undefined" ? window.location.origin + confirmation.managePath : confirmation.managePath} label="Copiar link" />
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function StepTitle({ children, ref }: { children: React.ReactNode; ref: React.Ref<HTMLHeadingElement> }) {
  return (
    <h2 ref={ref} tabIndex={-1} className="text-xl font-semibold tracking-tight outline-none">
      {children}
    </h2>
  );
}

function ProButton({
  name,
  hint,
  photoUrl,
  onClick,
  any = false,
}: {
  name: string;
  hint: string;
  photoUrl?: string | null;
  onClick: () => void;
  any?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-2xl border border-line px-4 py-3.5 text-left transition-all hover:-translate-y-px hover:border-[var(--brand)] hover:shadow-[var(--shadow-card)]"
    >
      {any ? (
        <span aria-hidden className={cx("grid h-12 w-12 shrink-0 place-items-center rounded-full", brandTint)}>
          <Sparkles className="h-5 w-5" />
        </span>
      ) : (
        <Avatar name={name} photoUrl={photoUrl} size="lg" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{name}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
      <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

function DateStrip({ dates, value, onChange }: { dates: { date: string; open: boolean }[]; value: string; onChange: (d: string) => void }) {
  const fmt = (d: string, opts: Intl.DateTimeFormatOptions) => {
    const [y, m, day] = d.split("-").map(Number);
    return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", ...opts }).format(new Date(Date.UTC(y, m - 1, day)));
  };
  const today = dates[0]?.date;
  return (
    <div className="-mx-4 mt-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
      <div role="radiogroup" aria-label="Dia" className="flex gap-2 pb-2">
        {dates.map((d) => {
          const selected = value === d.date;
          return (
            <button
              key={d.date}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${fmt(d.date, { weekday: "long", day: "numeric", month: "long" })}${d.open ? "" : " (fechado)"}`}
              disabled={!d.open}
              onClick={() => onChange(d.date)}
              className={cx(
                "flex w-16 shrink-0 flex-col items-center rounded-2xl border py-2.5 text-xs transition-all",
                selected
                  ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--brand-text)] shadow-md"
                  : "border-line-strong bg-surface hover:border-[var(--brand)]",
                !d.open && "cursor-not-allowed opacity-35",
              )}
            >
              <span className="font-medium capitalize">{d.date === today ? "Hoje" : fmt(d.date, { weekday: "short" }).replace(".", "")}</span>
              <span className="tabular mt-0.5 text-lg leading-tight font-bold">{fmt(d.date, { day: "2-digit" })}</span>
              <span className={cx("capitalize", selected ? "opacity-90" : "text-muted")}>{fmt(d.date, { month: "short" }).replace(".", "")}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Input({
  label,
  name,
  value,
  error,
  onChange,
  ...props
}: Omit<React.ComponentProps<"input">, "onChange"> & { label: string; name: string; value: string; error?: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        className={cx(inputClass, "h-12 text-base sm:text-sm")}
        {...props}
      />
      {error ? (
        <p id={`${id}-err`} className="mt-1 text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Row({ label, icon: Icon, children }: { label: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <span aria-hidden className={cx("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg", brandTint)}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <dt className="text-xs text-muted">{label}</dt>
        <dd className="font-medium">{children}</dd>
      </div>
    </div>
  );
}
