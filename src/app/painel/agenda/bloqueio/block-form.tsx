"use client";

import { useState } from "react";
import { createBlockAction } from "@/app/actions/panel";
import { ActionForm, CheckboxField, SelectField, SubmitButton, TextField } from "@/components/form";

export function BlockForm({
  professionals,
  defaultDate,
  defaultProfessionalId,
}: {
  professionals: { id: string; name: string }[];
  defaultDate: string;
  defaultProfessionalId: string;
}) {
  const [allDay, setAllDay] = useState(false);
  const [date, setDate] = useState(defaultDate);
  return (
    <ActionForm action={createBlockAction} successRedirect={`/painel/agenda?data=${date}`}>
      <SelectField label="Quem fica indisponível" name="professionalId" defaultValue={defaultProfessionalId}>
        <option value="">Todos (estabelecimento fechado)</option>
        {professionals.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </SelectField>
      <TextField label="Data" name="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="sm:w-56" />
      <CheckboxField label="Dia inteiro" name="allDay" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
      {!allDay ? (
        <div className="grid gap-3 sm:w-80 sm:grid-cols-2">
          <TextField label="Início" name="start" type="time" defaultValue="12:00" required />
          <TextField label="Fim" name="end" type="time" defaultValue="13:00" required />
        </div>
      ) : null}
      <TextField label="Motivo (opcional, uso interno)" name="reason" maxLength={200} placeholder="Ex.: feriado, consulta médica" />
      <SubmitButton pendingText="Bloqueando…">Bloquear horário</SubmitButton>
    </ActionForm>
  );
}
