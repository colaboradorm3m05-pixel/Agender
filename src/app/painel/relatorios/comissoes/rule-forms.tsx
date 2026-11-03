"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createCommissionRuleAction, endCommissionRuleAction } from "@/app/actions/panel";
import { ActionForm, SelectField, SubmitButton, TextField } from "@/components/form";
import { Alert, Button, inputClass } from "@/components/ui";

export function NewRuleForm({
  professionals,
  services,
  today,
}: {
  professionals: { id: string; name: string }[];
  services: { id: string; name: string }[];
  today: string;
}) {
  const [type, setType] = useState<"percent" | "fixed">("percent");
  return (
    <ActionForm action={createCommissionRuleAction} resetOnSuccess>
      <SelectField label="Profissional" name="professionalId" defaultValue="">
        <option value="">Todos os profissionais</option>
        {professionals.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </SelectField>
      <SelectField label="Serviço" name="serviceId" defaultValue="">
        <option value="">Todos os serviços</option>
        {services.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </SelectField>
      <SelectField label="Tipo" name="type" value={type} onChange={(e) => setType(e.target.value as "percent" | "fixed")}>
        <option value="percent">Percentual do valor do serviço</option>
        <option value="fixed">Valor fixo por atendimento</option>
      </SelectField>
      {type === "percent" ? (
        <TextField label="Percentual (%)" name="percent" inputMode="decimal" placeholder="40" required />
      ) : (
        <TextField label="Valor por atendimento (R$)" name="fixedCents" inputMode="decimal" placeholder="15,00" required />
      )}
      <TextField
        label="Válida a partir de"
        name="validFrom"
        type="date"
        defaultValue={today}
        required
        hint="Se já houver regra vigente para o mesmo profissional/serviço, ela termina na véspera."
      />
      <SubmitButton>Criar regra</SubmitButton>
    </ActionForm>
  );
}

export function EndRuleButton({ id, defaultDate, minDate }: { id: string; defaultDate: string; minDate: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(defaultDate);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open)
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Encerrar
      </Button>
    );
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        <label htmlFor={`fim-${id}`} className="sr-only">
          Último dia de vigência
        </label>
        <input id={`fim-${id}`} type="date" min={minDate} value={date} onChange={(e) => setDate(e.target.value)} className={`${inputClass.replace("w-full", "")} w-36 py-1`} />
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await endCommissionRuleAction(id, date);
              if (res.ok) {
                setOpen(false);
                router.refresh();
              } else setError(res.error);
            })
          }
        >
          Confirmar
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Voltar
        </Button>
      </div>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>
  );
}
