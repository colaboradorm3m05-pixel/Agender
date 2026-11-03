import { and, desc, eq } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { auditLogs, user } from "@/db/schema";

export type AuditEntry = {
  companyId: string;
  actorUserId: string | null;
  actorType: "user" | "customer" | "system";
  action: string;
  entityType: string;
  entityId: string;
  /** Resumo legível. Não incluir tokens, senhas nem dados pessoais desnecessários. */
  details?: string;
};

export async function audit(db: DbOrTx, entry: AuditEntry) {
  await db.insert(auditLogs).values(entry);
}


/** Histórico de alterações de um registro (somente leitura, filtrado pela empresa). */
export async function listAuditFor(db: DbOrTx, companyId: string, entityType: string, entityId: string) {
  return db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      actorType: auditLogs.actorType,
      actorName: user.name,
      details: auditLogs.details,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(user, eq(user.id, auditLogs.actorUserId))
    .where(and(eq(auditLogs.companyId, companyId), eq(auditLogs.entityType, entityType), eq(auditLogs.entityId, entityId)))
    .orderBy(desc(auditLogs.createdAt))
    .limit(50);
}

export const AUDIT_LABELS: Record<string, string> = {
  "appointment.created": "Agendamento criado",
  "appointment.rescheduled": "Reagendado",
  "appointment.cancelled": "Cancelado",
  "appointment.status_changed": "Status alterado",
  "payment.recorded": "Pagamento registrado",
  "payment.deleted": "Pagamento removido",
  "service.updated": "Serviço alterado",
  "professional.updated": "Profissional alterado",
  "professional.access_granted": "Acesso concedido",
  "company.created": "Empresa criada",
};
