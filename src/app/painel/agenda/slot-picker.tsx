"use client";

import { useEffect, useId, useState } from "react";
import { staffSlotsAction } from "@/app/actions/panel";
import { useFieldError } from "@/components/form";
import { cx, inputClass, Spinner } from "@/components/ui";

/**
 * Escolha de horário para a equipe: mostra os horários livres calculados no
 * servidor e permite digitar um horário específico (encaixe), que ainda assim
 * é validado no servidor.
 */
export function SlotPicker({
  professionalId,
  serviceId,
  date,
  excludeAppointmentId,
  defaultTime = "",
}: {
  professionalId: string;
  serviceId: string;
  date: string;
  excludeAppointmentId?: string;
  defaultTime?: string;
}) {
  const [slots, setSlots] = useState<{ value: string; label: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [time, setTime] = useState(defaultTime);
  const fieldError = useFieldError("time");
  const id = useId();

  useEffect(() => {
    let cancelled = false;
    if (!professionalId || !serviceId || !date) return;
    staffSlotsAction({ professionalId, serviceId, date, excludeAppointmentId }).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setSlots(res.data);
        setError(null);
      } else {
        setSlots([]);
        setError(res.error);
      }
    });
    return () => {
      cancelled = true;
      setSlots(null);
    };
  }, [professionalId, serviceId, date, excludeAppointmentId]);

  if (!professionalId || !serviceId || !date) {
    return <p className="text-sm text-muted">Escolha profissional, serviço e data para ver os horários.</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Horário</p>
      {slots === null ? (
        <Spinner label="Buscando horários livres" />
      ) : error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : slots.length === 0 ? (
        <p className="text-sm text-muted">Nenhum horário livre neste dia para esse serviço.</p>
      ) : (
        <div role="radiogroup" aria-label="Horários livres" className="flex flex-wrap gap-1.5">
          {slots.map((s) => (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={time === s.value}
              onClick={() => setTime(s.value)}
              className={cx(
                "tabular rounded-md border px-2.5 py-1 text-sm",
                time === s.value ? "border-accent bg-accent text-white" : "border-line-strong bg-surface hover:bg-canvas",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 pt-1">
        <label htmlFor={id} className="text-xs text-muted">
          Ou informe o horário:
        </label>
        <input
          id={id}
          type="time"
          name="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          aria-invalid={fieldError ? true : undefined}
          className={cx(inputClass.replace("w-full", ""), "w-32")}
          required
        />
      </div>
      {fieldError ? <p className="text-xs font-medium text-danger">{fieldError}</p> : null}
    </div>
  );
}
