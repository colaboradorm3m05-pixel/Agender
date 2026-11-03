"use client";

import { useState } from "react";
import type { WeeklyRange } from "@/domain/availability";
import { hhmmToMinutes, minutesToHHMM, WEEKDAY_LABELS } from "@/domain/time";
import { useFieldError } from "./form";
import { Button, inputClass } from "./ui";

type Row = { weekday: number; start: string; end: string };

const ORDER = [1, 2, 3, 4, 5, 6, 0]; // segunda a domingo

/**
 * Editor de faixas semanais (funcionamento, jornada ou pausas). Envia o valor
 * como JSON em um campo oculto `name`.
 */
export function WeeklyHoursEditor({
  name,
  initial,
  emptyLabel = "Fechado",
  addLabel = "Adicionar faixa",
  defaultRange = { start: "09:00", end: "18:00" },
}: {
  name: string;
  initial: WeeklyRange[];
  emptyLabel?: string;
  addLabel?: string;
  defaultRange?: { start: string; end: string };
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    initial.map((r) => ({ weekday: r.weekday, start: minutesToHHMM(r.startMinute), end: minutesToHHMM(r.endMinute) })),
  );
  const error = useFieldError(name);

  const serialized = JSON.stringify(
    rows.map((r) => ({ weekday: r.weekday, startMinute: hhmmToMinutes(r.start) ?? -1, endMinute: hhmmToMinutes(r.end) ?? -1 })),
  );

  const update = (index: number, patch: Partial<Row>) => setRows((all) => all.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const remove = (index: number) => setRows((all) => all.filter((_, i) => i !== index));
  const add = (weekday: number) => setRows((all) => [...all, { weekday, ...defaultRange }]);
  const copyToAll = (weekday: number) =>
    setRows((all) => {
      const source = all.filter((r) => r.weekday === weekday);
      return ORDER.flatMap((wd) => (wd === weekday ? source : source.map((s) => ({ ...s, weekday: wd }))));
    });

  return (
    <fieldset className="space-y-2">
      <input type="hidden" name={name} value={serialized} />
      {error ? (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
      <ul className="divide-y divide-line rounded-lg border border-line">
        {ORDER.map((wd) => {
          const dayRows = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.weekday === wd);
          return (
            <li key={wd} className="flex flex-col gap-2 px-3 py-3 md:flex-row md:items-start">
              <span className="w-24 shrink-0 pt-2 text-sm font-medium text-ink">{WEEKDAY_LABELS[wd]}</span>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                {dayRows.length === 0 ? <span className="pt-2 text-sm text-muted">{emptyLabel}</span> : null}
                {dayRows.map(({ r, i }) => (
                  <div key={i} className="flex items-center gap-2">
                    <label className="sr-only" htmlFor={`${name}-${i}-start`}>
                      Início ({WEEKDAY_LABELS[wd]})
                    </label>
                    <input
                      id={`${name}-${i}-start`}
                      type="time"
                      step={300}
                      value={r.start}
                      onChange={(e) => update(i, { start: e.target.value })}
                      className={`${inputClass.replace("w-full", "")} w-28`}
                    />
                    <span className="text-sm text-muted">às</span>
                    <label className="sr-only" htmlFor={`${name}-${i}-end`}>
                      Fim ({WEEKDAY_LABELS[wd]})
                    </label>
                    <input
                      id={`${name}-${i}-end`}
                      type="time"
                      step={300}
                      value={r.end}
                      onChange={(e) => update(i, { end: e.target.value })}
                      className={`${inputClass.replace("w-full", "")} w-28`}
                    />
                    <Button variant="ghost" size="sm" className="shrink-0" onClick={() => remove(i)} aria-label={`Remover faixa de ${WEEKDAY_LABELS[wd]}`}>
                      Remover
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex shrink-0 flex-wrap gap-1 md:justify-end">
                <Button variant="secondary" size="sm" onClick={() => add(wd)}>
                  {addLabel}
                </Button>
                {dayRows.length > 0 ? (
                  <Button variant="ghost" size="sm" onClick={() => copyToAll(wd)}>
                    Copiar p/ todos
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
