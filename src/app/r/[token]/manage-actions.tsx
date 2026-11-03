"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { manageCancelAction, manageRescheduleAction, manageSlotsAction } from "@/app/actions/public";
import { Alert, cx, inputClass, Spinner } from "@/components/ui";

const brandButton =
  "inline-flex h-11 items-center justify-center rounded-lg bg-[var(--brand)] px-5 text-sm font-semibold text-[var(--brand-text)] hover:opacity-90 disabled:opacity-50";

export function ManageActions({
  token,
  canCancel,
  canReschedule,
  policyMessage,
  dates,
}: {
  token: string;
  canCancel: boolean;
  canReschedule: boolean;
  policyMessage: string | null;
  dates: string[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "reschedule" | "cancel">("idle");
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [date, setDate] = useState(dates[0]);
  const [slots, setSlots] = useState<{ start: string; label: string }[] | null>(null);

  useEffect(() => {
    if (mode !== "reschedule") return;
    let active = true;
    manageSlotsAction(token, date).then((res) => {
      if (!active) return;
      setSlots(res.ok ? res.data : []);
      if (!res.ok) setMessage({ tone: "danger", text: res.error });
    });
    return () => {
      active = false;
      setSlots(null);
    };
  }, [mode, date, token]);

  if (!canCancel && !canReschedule) {
    return policyMessage ? <Alert tone="neutral">{policyMessage}</Alert> : null;
  }

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-surface p-5">
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
      {mode === "idle" ? (
        <div className="flex flex-wrap gap-2">
          {canReschedule ? (
            <button type="button" className={brandButton} onClick={() => setMode("reschedule")}>
              Reagendar
            </button>
          ) : null}
          {canCancel ? (
            <button
              type="button"
              className="h-11 rounded-lg border border-danger/40 px-5 text-sm font-semibold text-danger hover:bg-danger-soft"
              onClick={() => setMode("cancel")}
            >
              Cancelar reserva
            </button>
          ) : null}
        </div>
      ) : null}

      {mode === "cancel" ? (
        <div className="space-y-3">
          <p className="text-sm">Tem certeza? O horário será liberado para outras pessoas.</p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              className="h-11 rounded-lg bg-danger px-5 text-sm font-semibold text-white disabled:opacity-50"
              onClick={() =>
                start(async () => {
                  const res = await manageCancelAction(token);
                  setMessage(res.ok ? { tone: "ok", text: "Reserva cancelada." } : { tone: "danger", text: res.error });
                  setMode("idle");
                  router.refresh();
                })
              }
            >
              {pending ? "Cancelando…" : "Sim, cancelar"}
            </button>
            <button type="button" className="h-11 px-4 text-sm" onClick={() => setMode("idle")}>
              Voltar
            </button>
          </div>
        </div>
      ) : null}

      {mode === "reschedule" ? (
        <div className="space-y-3">
          <label className="block text-sm font-medium" htmlFor="nova-data">
            Nova data
          </label>
          <select id="nova-data" value={date} onChange={(e) => setDate(e.target.value)} className={cx(inputClass, "h-11")}>
            {dates.map((d) => (
              <option key={d} value={d}>
                {fmt(d)}
              </option>
            ))}
          </select>
          <div aria-live="polite">
            {slots === null ? (
              <Spinner label="Buscando horários" />
            ) : slots.length === 0 ? (
              <p className="text-sm text-muted">Sem horários neste dia.</p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {slots.map((s) => (
                  <button
                    key={s.start}
                    type="button"
                    disabled={pending}
                    className="tabular h-11 rounded-lg border border-line-strong text-sm font-medium hover:border-[var(--brand)]"
                    onClick={() =>
                      start(async () => {
                        const res = await manageRescheduleAction(token, s.start);
                        setMessage(res.ok ? { tone: "ok", text: `Reserva reagendada para ${s.label}.` } : { tone: "danger", text: res.error });
                        if (res.ok) setMode("idle");
                        router.refresh();
                      })
                    }
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="button" className="text-sm text-muted hover:text-ink" onClick={() => setMode("idle")}>
            Voltar
          </button>
        </div>
      ) : null}
    </section>
  );
}

function fmt(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  const s = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(
    new Date(Date.UTC(y, m - 1, day)),
  );
  return s.charAt(0).toUpperCase() + s.slice(1);
}
