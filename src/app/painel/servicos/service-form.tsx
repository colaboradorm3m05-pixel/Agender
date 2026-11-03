"use client";

import { createServiceAction, updateServiceAction } from "@/app/actions/panel";
import { ActionForm, CheckboxField, SubmitButton, TextAreaField, TextField } from "@/components/form";
import { centsToInput } from "@/domain/money";

export type ServiceFormValues = {
  id?: string;
  name: string;
  description: string | null;
  priceCents: number;
  durationMinutes: number;
  bufferAfterMinutes: number;
  active: boolean;
  professionalIds: string[];
};

export function ServiceForm({
  initial,
  professionals,
  professionalLabel,
}: {
  initial?: ServiceFormValues;
  professionals: { id: string; name: string }[];
  professionalLabel: string;
}) {
  const editing = Boolean(initial?.id);
  return (
    <ActionForm
      action={editing ? updateServiceAction : createServiceAction}
      resetOnSuccess={!editing}
      successRedirect={editing ? "/painel/servicos" : undefined}
    >
      {initial?.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      <TextField label="Nome" name="name" defaultValue={initial?.name} required maxLength={80} />
      <TextAreaField label="Descrição (opcional)" name="description" defaultValue={initial?.description ?? ""} maxLength={500} hint="Aparece na página de agendamento." />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          label="Preço (R$)"
          name="priceCents"
          inputMode="decimal"
          defaultValue={initial ? centsToInput(initial.priceCents) : ""}
          placeholder="40,00"
          required
        />
        <TextField label="Duração (min)" name="durationMinutes" type="number" min={5} max={720} step={5} defaultValue={initial?.durationMinutes ?? 30} required />
        <TextField
          label="Intervalo após (min)"
          name="bufferAfterMinutes"
          type="number"
          min={0}
          max={240}
          step={5}
          defaultValue={initial?.bufferAfterMinutes ?? 0}
          hint="Bloqueia a agenda após o atendimento."
        />
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">{professionalLabel} que realizam este serviço</legend>
        {professionals.length === 0 ? (
          <p className="text-sm text-muted">Nenhum profissional ativo cadastrado.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {professionals.map((p) => (
              <CheckboxField
                key={p.id}
                name="professionalIds"
                value={p.id}
                label={p.name}
                defaultChecked={initial ? initial.professionalIds.includes(p.id) : professionals.length === 1}
              />
            ))}
          </div>
        )}
      </fieldset>
      {editing ? (
        <CheckboxField
          name="active"
          label="Ativo"
          defaultChecked={initial?.active}
          hint="Serviços inativos não aparecem para agendamento, mas o histórico é preservado."
        />
      ) : null}
      {editing ? (
        <p className="rounded-lg bg-canvas px-3 py-2 text-xs text-muted">
          Alterar preço ou duração vale apenas para novos agendamentos. Os já marcados mantêm os valores originais.
        </p>
      ) : null}
      <SubmitButton>{editing ? "Salvar alterações" : "Criar serviço"}</SubmitButton>
    </ActionForm>
  );
}
