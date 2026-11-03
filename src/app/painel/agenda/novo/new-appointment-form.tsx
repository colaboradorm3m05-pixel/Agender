"use client";

import { useEffect, useId, useState } from "react";
import { createAppointmentAction, searchCustomersAction } from "@/app/actions/panel";
import { ActionForm, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/form";
import { cx, inputClass } from "@/components/ui";
import { formatCents } from "@/domain/money";
import { formatDuration } from "@/domain/format";
import { SlotPicker } from "../slot-picker";

type Pro = { id: string; name: string; serviceIds: string[] };
type Svc = { id: string; name: string; priceCents: number; durationMinutes: number };

export function NewAppointmentForm({
  professionals,
  services,
  defaultDate,
  defaultProfessionalId,
  presetCustomer,
}: {
  professionals: Pro[];
  services: Svc[];
  defaultDate: string;
  defaultProfessionalId?: string;
  presetCustomer?: { id: string; name: string; phone: string } | null;
}) {
  const [proId, setProId] = useState(defaultProfessionalId ?? professionals[0]?.id ?? "");
  const pro = professionals.find((p) => p.id === proId);
  const proServices = services.filter((s) => pro?.serviceIds.includes(s.id));
  const [serviceId, setServiceId] = useState(proServices[0]?.id ?? "");
  const [date, setDate] = useState(defaultDate);
  const effectiveService = proServices.some((s) => s.id === serviceId) ? serviceId : (proServices[0]?.id ?? "");

  return (
    <ActionForm
      action={createAppointmentAction}
      successRedirect={`/painel/agenda?data=${date}`}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Profissional" name="professionalId" value={proId} onChange={(e) => setProId(e.target.value)}>
          {professionals.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Serviço"
          name="serviceId"
          value={effectiveService}
          onChange={(e) => setServiceId(e.target.value)}
          hint={proServices.length === 0 ? "Este profissional ainda não tem serviços vinculados." : undefined}
        >
          {proServices.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {formatDuration(s.durationMinutes)} · {formatCents(s.priceCents)}
            </option>
          ))}
        </SelectField>
      </div>
      <TextField label="Data" name="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="sm:w-56" />
      <SlotPicker key={`${proId}-${effectiveService}-${date}`} professionalId={proId} serviceId={effectiveService} date={date} />
      <CustomerPicker preset={presetCustomer ?? null} />
      <TextAreaField label="Observações do atendimento (opcional)" name="notes" maxLength={500} />
      <SubmitButton pendingText="Agendando…">Confirmar agendamento</SubmitButton>
    </ActionForm>
  );
}

function CustomerPicker({ preset }: { preset: { id: string; name: string; phone: string } | null }) {
  const [mode, setMode] = useState<"search" | "new">(preset ? "search" : "search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; phone: string }[]>([]);
  const [selected, setSelected] = useState(preset);
  const searchId = useId();
  const visibleResults = query.trim().length >= 2 ? results : [];

  useEffect(() => {
    if (mode !== "search" || query.trim().length < 2) return;
    const t = setTimeout(async () => {
      const res = await searchCustomersAction(query);
      if (res.ok) setResults(res.data);
    }, 250);
    return () => clearTimeout(t);
  }, [query, mode]);

  return (
    <fieldset className="space-y-3 rounded-lg border border-line p-4">
      <legend className="px-1 text-sm font-semibold">Cliente</legend>
      <div className="flex gap-2" role="group" aria-label="Tipo de cliente">
        {(["search", "new"] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
            className={cx("rounded-md border px-3 py-1 text-sm", mode === m ? "border-accent bg-accent-soft text-accent" : "border-line-strong")}
          >
            {m === "search" ? "Cliente cadastrado" : "Novo cliente"}
          </button>
        ))}
      </div>
      {mode === "search" ? (
        <div className="space-y-2">
          {selected ? (
            <div className="flex items-center justify-between rounded-md bg-accent-soft px-3 py-2 text-sm">
              <span>
                <strong>{selected.name}</strong> · {selected.phone}
              </span>
              <button type="button" className="text-xs font-medium text-accent hover:underline" onClick={() => setSelected(null)}>
                Trocar
              </button>
              <input type="hidden" name="customerId" value={selected.id} />
            </div>
          ) : (
            <>
              <label htmlFor={searchId} className="block text-sm font-medium">
                Buscar por nome ou telefone
              </label>
              <input id={searchId} value={query} onChange={(e) => setQuery(e.target.value)} className={inputClass} autoComplete="off" placeholder="Digite ao menos 2 caracteres" />
              {visibleResults.length ? (
                <ul className="divide-y divide-line rounded-md border border-line">
                  {visibleResults.map((r) => (
                    <li key={r.id}>
                      <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-canvas" onClick={() => setSelected(r)}>
                        {r.name} <span className="text-muted">· {r.phone}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : query.trim().length >= 2 ? (
                <p className="text-xs text-muted">Nenhum cliente encontrado. Use “Novo cliente”.</p>
              ) : null}
            </>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <TextField label="Nome" name="customerName" autoComplete="off" />
          <TextField label="Telefone" name="customerPhone" inputMode="tel" placeholder="(11) 98765-4321" />
          <TextField label="E-mail (opcional)" name="customerEmail" type="email" />
          <p className="text-xs text-muted sm:col-span-3">
            Se já existir um cliente com o mesmo telefone e nome, o cadastro existente será usado.
          </p>
        </div>
      )}
    </fieldset>
  );
}
