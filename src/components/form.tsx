"use client";

import { createContext, useActionState, useContext, useEffect, useId, useRef, type ComponentProps, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/server/action-result";
import { Alert, buttonClass, cx, inputClass } from "./ui";

type FormAction<T> = (prev: ActionResult<T> | null, formData: FormData) => Promise<ActionResult<T>>;

const FormStateContext = createContext<ActionResult<unknown> | null>(null);

/**
 * Formulário ligado a uma server action. Mostra erro geral, erros por campo e
 * mensagem de sucesso. `onSuccess` permite redirecionar ou limpar campos.
 */
export function ActionForm<T>({
  action,
  children,
  className,
  onSuccess,
  successRedirect,
  resetOnSuccess,
  showSuccess = true,
  id,
}: {
  action: FormAction<T>;
  children: ReactNode;
  className?: string;
  onSuccess?: (data: T) => void;
  successRedirect?: string;
  resetOnSuccess?: boolean;
  showSuccess?: boolean;
  id?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const handled = useRef<unknown>(null);

  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if (state.ok) {
      if (resetOnSuccess) formRef.current?.reset();
      onSuccess?.(state.data);
      if (successRedirect) router.push(successRedirect);
      else router.refresh();
    } else {
      // Leva o foco ao primeiro campo com erro (acessibilidade).
      const first = formRef.current?.querySelector<HTMLElement>("[aria-invalid=true]");
      first?.focus();
    }
  }, [state, onSuccess, successRedirect, resetOnSuccess, router]);

  return (
    <FormStateContext value={state as ActionResult<unknown> | null}>
      <form ref={formRef} action={formAction} className={cx("space-y-4", className)} noValidate id={id}>
        {state && !state.ok ? <Alert tone="danger">{state.error}</Alert> : null}
        {state && state.ok && state.message && showSuccess ? <Alert tone="ok">{state.message}</Alert> : null}
        {children}
      </form>
    </FormStateContext>
  );
}

export function useFieldError(name: string): string | undefined {
  const state = useContext(FormStateContext);
  if (!state || state.ok) return undefined;
  return state.fieldErrors?.[name];
}

export function FieldShell({
  label,
  hint,
  error,
  id,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  id: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {hint && !error ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextField({
  label,
  name,
  hint,
  className,
  error: errorProp,
  ...props
}: ComponentProps<"input"> & { label: string; name: string; hint?: ReactNode; error?: string }) {
  const id = useId();
  const error = useFieldError(name) ?? errorProp;
  return (
    <FieldShell label={label} hint={hint} error={error} id={id} className={className}>
      <input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={inputClass}
        {...props}
      />
    </FieldShell>
  );
}

export function TextAreaField({
  label,
  name,
  hint,
  className,
  ...props
}: ComponentProps<"textarea"> & { label: string; name: string; hint?: ReactNode }) {
  const id = useId();
  const error = useFieldError(name);
  return (
    <FieldShell label={label} hint={hint} error={error} id={id} className={className}>
      <textarea
        id={id}
        name={name}
        rows={3}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={inputClass}
        {...props}
      />
    </FieldShell>
  );
}

export function SelectField({
  label,
  name,
  hint,
  className,
  children,
  ...props
}: ComponentProps<"select"> & { label: string; name: string; hint?: ReactNode }) {
  const id = useId();
  const error = useFieldError(name);
  return (
    <FieldShell label={label} hint={hint} error={error} id={id} className={className}>
      <select
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={inputClass}
        {...props}
      >
        {children}
      </select>
    </FieldShell>
  );
}

export function CheckboxField({
  label,
  name,
  hint,
  ...props
}: ComponentProps<"input"> & { label: ReactNode; name: string; hint?: ReactNode }) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <input id={id} type="checkbox" name={name} className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]" {...props} />
      <label htmlFor={id} className="text-sm text-ink">
        {label}
        {hint ? <span className="mt-0.5 block text-xs text-muted">{hint}</span> : null}
      </label>
    </div>
  );
}

export function SubmitButton({
  children,
  pendingText = "Salvando…",
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { pendingText?: string; variant?: "primary" | "secondary" | "danger" }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-disabled={pending} className={buttonClass(variant, "md", className)} {...props}>
      {pending ? pendingText : children}
    </button>
  );
}

export function FormError({ name }: { name: string }) {
  const error = useFieldError(name);
  return error ? <p className="text-xs font-medium text-danger">{error}</p> : null;
}
