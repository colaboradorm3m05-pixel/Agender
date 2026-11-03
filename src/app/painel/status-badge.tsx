import { Badge } from "@/components/ui";

export const STATUS_LABELS = {
  confirmed: "Confirmado",
  completed: "Concluído",
  cancelled: "Cancelado",
  no_show: "Não compareceu",
} as const;

export function StatusBadge({ status }: { status: string }) {
  const tone = status === "confirmed" ? "accent" : status === "completed" ? "ok" : status === "no_show" ? "warn" : "danger";
  return <Badge tone={tone}>{STATUS_LABELS[status as keyof typeof STATUS_LABELS] ?? status}</Badge>;
}
