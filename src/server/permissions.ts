/**
 * Autorização por operação. O "Actor" é sempre montado no servidor a partir
 * da sessão + vínculo (membership) no banco; nunca a partir de company_id
 * enviado pelo navegador.
 */
import { ForbiddenError } from "./errors";

export type Role = "owner" | "professional";

export type Actor = {
  userId: string;
  companyId: string;
  role: Role;
  /** Profissional vinculado ao usuário (papel professional). */
  professionalId: string | null;
};

export const PERMISSIONS = [
  "company.manage", // configurações, horários, link público
  "staff.manage", // profissionais, jornadas, convites
  "services.manage",
  "agenda.view_all",
  "agenda.view_own",
  "appointment.manage_all", // criar, reagendar, cancelar qualquer atendimento
  "appointment.status_own", // concluir / registrar falta nos próprios atendimentos
  "blocks.manage_all",
  "customers.view",
  "customers.manage",
  "payments.manage",
  "reports.view", // relatórios de toda a empresa
  "reports.view_own", // relatório e comissões do próprio profissional
  "commissions.manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: PERMISSIONS,
  professional: ["agenda.view_own", "appointment.status_own", "reports.view_own"],
};

export function can(actor: Actor, permission: Permission): boolean {
  return ROLE_PERMISSIONS[actor.role]?.includes(permission) ?? false;
}

export function assertCan(actor: Actor, permission: Permission): void {
  if (!can(actor, permission)) throw new ForbiddenError();
}

/** Profissional só enxerga a própria agenda; proprietário enxerga todas. */
export function assertCanViewProfessional(actor: Actor, professionalId: string): void {
  if (can(actor, "agenda.view_all")) return;
  if (can(actor, "agenda.view_own") && actor.professionalId === professionalId) return;
  throw new ForbiddenError("Você só pode acessar a sua própria agenda.");
}
