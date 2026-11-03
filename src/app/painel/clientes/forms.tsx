"use client";

import { useRouter } from "next/navigation";
import { createCustomerAction, updateCustomerAction } from "@/app/actions/panel";
import { ActionForm, CheckboxField, SubmitButton, TextAreaField, TextField } from "@/components/form";

const NOTES_HINT = "Uso interno (preferências, observações). Não registre dados de saúde ou outras informações sensíveis.";

export function CreateCustomerForm() {
  const router = useRouter();
  return (
    <ActionForm action={createCustomerAction} onSuccess={(d) => d.id && router.push(`/painel/clientes/${d.id}`)}>
      <TextField label="Nome" name="name" required maxLength={100} />
      <TextField label="Telefone" name="phone" inputMode="tel" placeholder="(11) 98765-4321" required />
      <TextField label="E-mail (opcional)" name="email" type="email" />
      <TextAreaField label="Observações internas (opcional)" name="notes" maxLength={1000} hint={NOTES_HINT} />
      <CheckboxField
        name="confirmSharedPhone"
        label="É outra pessoa usando o mesmo telefone"
        hint="Marque somente se o sistema avisar que o número já está cadastrado."
      />
      <SubmitButton>Cadastrar cliente</SubmitButton>
    </ActionForm>
  );
}

export function EditCustomerForm({ customer }: { customer: { id: string; name: string; phone: string; email: string | null; notes: string | null } }) {
  return (
    <ActionForm action={updateCustomerAction}>
      <input type="hidden" name="id" value={customer.id} />
      <TextField label="Nome" name="name" defaultValue={customer.name} required maxLength={100} />
      <TextField label="Telefone" name="phone" defaultValue={customer.phone} inputMode="tel" required />
      <TextField label="E-mail (opcional)" name="email" type="email" defaultValue={customer.email ?? ""} />
      <TextAreaField label="Observações internas" name="notes" defaultValue={customer.notes ?? ""} maxLength={1000} hint={NOTES_HINT} />
      <SubmitButton>Salvar</SubmitButton>
    </ActionForm>
  );
}
