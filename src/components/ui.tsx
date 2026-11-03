import Link from "next/link";
import { Inbox, type LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-accent-hover border border-transparent shadow-sm shadow-accent/30",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-canvas",
  ghost: "bg-transparent text-ink-soft border border-transparent hover:bg-canvas",
  danger: "bg-surface text-danger border border-danger/40 hover:bg-danger-soft",
};
const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-xl font-medium whitespace-nowrap transition-all disabled:cursor-not-allowed disabled:opacity-60",
    VARIANTS[variant],
    SIZES[size],
    extra,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button type="button" {...props} className={buttonClass(variant, size, className)} />;
}

export function LinkButton({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link {...props} className={buttonClass(variant, size, className)} />;
}

export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section {...props} className={cx("rounded-2xl border border-line/80 bg-surface p-4 shadow-[var(--shadow-card)] sm:p-5", className)} />;
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? <p className="mb-1 text-xs font-semibold tracking-wider text-gold uppercase">{eyebrow}</p> : null}
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[1.7rem]">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export type Tone = "neutral" | "accent" | "ok" | "warn" | "danger" | "gold" | "info";
const TONES: Record<Tone, string> = {
  neutral: "bg-canvas text-ink-soft border-line",
  accent: "bg-accent-soft text-accent border-accent/20",
  ok: "bg-ok-soft text-ok border-ok/20",
  warn: "bg-warn-soft text-warn border-warn/20",
  danger: "bg-danger-soft text-danger border-danger/20",
  gold: "bg-gold-soft text-gold border-gold/20",
  info: "bg-info-soft text-info border-info/20",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", TONES[tone])}>{children}</span>
  );
}

export function Alert({ tone = "neutral", title, children }: { tone?: Tone; title?: string; children?: ReactNode }) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cx("rounded-xl border px-4 py-3 text-sm", TONES[tone])}>
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={title ? "mt-1" : undefined}>{children}</div> : null}
    </div>
  );
}

/** Quadrado colorido com ícone (usado em cards, listas e estados vazios). */
export function IconBadge({ icon: Icon, tone = "accent", size = "md" }: { icon: LucideIcon; tone?: Tone; size?: "sm" | "md" | "lg" }) {
  const box = { sm: "h-8 w-8 rounded-lg", md: "h-10 w-10 rounded-xl", lg: "h-14 w-14 rounded-2xl" }[size];
  const ic = { sm: "h-4 w-4", md: "h-5 w-5", lg: "h-7 w-7" }[size];
  return (
    <span aria-hidden className={cx("grid shrink-0 place-items-center border", box, TONES[tone])}>
      <Icon className={ic} strokeWidth={2} />
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon = Inbox,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line-strong bg-surface/70 px-6 py-10 text-center">
      <IconBadge icon={icon} tone="gold" size="lg" />
      <p className="mt-4 font-semibold text-ink">{title}</p>
      {description ? <p className="mx-auto mt-1 max-w-md text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  icon,
  tone = "accent",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
}) {
  return (
    <div className="rounded-2xl border border-line/80 bg-surface p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted">{label}</p>
        {icon ? <IconBadge icon={icon} tone={tone} size="sm" /> : null}
      </div>
      <p className="tabular mt-2 text-[1.65rem] leading-tight font-semibold text-ink">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

const AVATAR_COLORS = ["bg-[#e3f1ee] text-[#0f5c56]", "bg-[#fbf0dc] text-[#8a4d05]", "bg-[#eceffd] text-[#3b4cb8]", "bg-[#fde8ef] text-[#a3184d]", "bg-[#e9f5e6] text-[#2f6b1f]"];

/** Avatar com foto ou iniciais (cor estável por nome). */
export function Avatar({ name, photoUrl, size = "md" }: { name: string; photoUrl?: string | null; size?: "sm" | "md" | "lg" }) {
  const dim = { sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm", lg: "h-14 w-14 text-lg" }[size];
  const initials = name
    .split(/\s+/)
    .filter((w) => /^\p{L}/u.test(w))
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- foto externa informada pela empresa
    return <img src={photoUrl} alt="" className={cx("shrink-0 rounded-full object-cover", dim)} />;
  }
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span aria-hidden className={cx("grid shrink-0 place-items-center rounded-full font-semibold", dim, AVATAR_COLORS[hash % AVATAR_COLORS.length])}>
      {initials || "?"}
    </span>
  );
}

export const inputClass =
  "block w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-sm transition-colors hover:border-ink-soft/40 text-ink placeholder:text-muted/70 aria-[invalid=true]:border-danger disabled:bg-canvas";

export function Spinner({ label = "Carregando" }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-muted">
      <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-line-strong border-t-accent" />
      {label}
    </span>
  );
}
