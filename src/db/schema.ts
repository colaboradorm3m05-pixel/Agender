/**
 * Esquema do banco (PostgreSQL). Convenções:
 * - Toda tabela de negócio tem company_id e todo acesso filtra por ele.
 * - Instantes em timestamptz (UTC). Horários recorrentes (jornada, pausas,
 *   funcionamento) em minutos desde 00:00 no fuso da empresa.
 * - Dinheiro em centavos (integer). Nunca ponto flutuante.
 * - "professional" é o termo interno; o rótulo exibido vem de config/segments.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export * from "./auth-schema";
import { user } from "./auth-schema";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const companies = pgTable(
  "companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    segment: text("segment").notNull().default("barbershop"),
    timezone: text("timezone").notNull().default("America/Sao_Paulo"),
    phone: text("phone"),
    addressLine: text("address_line"),
    city: text("city"),
    serviceInfo: text("service_info"),
    brandColor: text("brand_color").notNull().default("#1f2937"),
    /** Antecedência mínima (minutos) para o cliente agendar pelo link público. */
    minAdvanceMinutes: integer("min_advance_minutes").notNull().default(60),
    /** Quantos dias à frente o cliente pode agendar. */
    maxDaysAhead: integer("max_days_ahead").notNull().default(30),
    /** Passo entre horários oferecidos (minutos). */
    slotStepMinutes: integer("slot_step_minutes").notNull().default(15),
    allowClientCancel: boolean("allow_client_cancel").notNull().default(true),
    allowClientReschedule: boolean("allow_client_reschedule").notNull().default(true),
    /** Antecedência mínima (minutos) para o cliente cancelar/reagendar sozinho. */
    clientChangeMinAdvanceMinutes: integer("client_change_min_advance_minutes").notNull().default(120),
    onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
    /** Dados demonstrativos: nunca misturar com dados reais. */
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("companies_slug_uq").on(t.slug),
    check("companies_slug_format", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check("companies_min_advance_ck", sql`${t.minAdvanceMinutes} >= 0`),
    check("companies_max_days_ck", sql`${t.maxDaysAhead} between 1 and 365`),
    check("companies_slot_step_ck", sql`${t.slotStepMinutes} between 5 and 120`),
  ],
);

/** Horário de funcionamento: várias faixas por dia são permitidas. weekday: 0=domingo. */
export const companyHours = pgTable(
  "company_hours",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    weekday: smallint("weekday").notNull(),
    startMinute: integer("start_minute").notNull(),
    endMinute: integer("end_minute").notNull(),
  },
  (t) => [
    index("company_hours_company_idx").on(t.companyId, t.weekday),
    check("company_hours_weekday_ck", sql`${t.weekday} between 0 and 6`),
    check("company_hours_range_ck", sql`${t.startMinute} >= 0 and ${t.endMinute} <= 1440 and ${t.startMinute} < ${t.endMinute}`),
  ],
);

export const professionals = pgTable(
  "professionals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    photoUrl: text("photo_url"),
    active: boolean("active").notNull().default(true),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("professionals_company_idx").on(t.companyId)],
);

/** Papéis: owner (proprietário) e professional. */
export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    /** Para o papel professional: qual cadastro de profissional este usuário representa. */
    professionalId: uuid("professional_id").references(() => professionals.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("memberships_user_company_uq").on(t.userId, t.companyId),
    uniqueIndex("memberships_professional_uq").on(t.professionalId),
    check("memberships_role_ck", sql`${t.role} in ('owner', 'professional')`),
    check(
      "memberships_professional_link_ck",
      sql`${t.role} <> 'professional' or ${t.professionalId} is not null`,
    ),
  ],
);

/** Convite de acesso para um profissional (link copiado pelo proprietário). */
export const professionalInvites = pgTable(
  "professional_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    professionalId: uuid("professional_id").notNull().references(() => professionals.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("professional_invites_token_uq").on(t.tokenHash)],
);

export const workingHours = pgTable(
  "working_hours",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    professionalId: uuid("professional_id").notNull().references(() => professionals.id, { onDelete: "cascade" }),
    weekday: smallint("weekday").notNull(),
    startMinute: integer("start_minute").notNull(),
    endMinute: integer("end_minute").notNull(),
  },
  (t) => [
    index("working_hours_professional_idx").on(t.professionalId, t.weekday),
    check("working_hours_weekday_ck", sql`${t.weekday} between 0 and 6`),
    check("working_hours_range_ck", sql`${t.startMinute} >= 0 and ${t.endMinute} <= 1440 and ${t.startMinute} < ${t.endMinute}`),
  ],
);

/** Pausas recorrentes (ex.: almoço) por dia da semana. */
export const recurringBreaks = pgTable(
  "recurring_breaks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    professionalId: uuid("professional_id").notNull().references(() => professionals.id, { onDelete: "cascade" }),
    weekday: smallint("weekday").notNull(),
    startMinute: integer("start_minute").notNull(),
    endMinute: integer("end_minute").notNull(),
  },
  (t) => [
    index("recurring_breaks_professional_idx").on(t.professionalId, t.weekday),
    check("recurring_breaks_weekday_ck", sql`${t.weekday} between 0 and 6`),
    check("recurring_breaks_range_ck", sql`${t.startMinute} >= 0 and ${t.endMinute} <= 1440 and ${t.startMinute} < ${t.endMinute}`),
  ],
);

/** Bloqueios pontuais. professional_id nulo = bloqueio da empresa inteira (ex.: feriado). */
export const timeBlocks = pgTable(
  "time_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    professionalId: uuid("professional_id").references(() => professionals.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    reason: text("reason"),
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("time_blocks_company_range_idx").on(t.companyId, t.startsAt),
    check("time_blocks_range_ck", sql`${t.startsAt} < ${t.endsAt}`),
  ],
);

export const services = pgTable(
  "services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    priceCents: integer("price_cents").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    bufferAfterMinutes: integer("buffer_after_minutes").notNull().default(0),
    active: boolean("active").notNull().default(true),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("services_company_idx").on(t.companyId),
    check("services_price_ck", sql`${t.priceCents} >= 0`),
    check("services_duration_ck", sql`${t.durationMinutes} between 5 and 720`),
    check("services_buffer_ck", sql`${t.bufferAfterMinutes} between 0 and 240`),
  ],
);

export const professionalServices = pgTable(
  "professional_services",
  {
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    professionalId: uuid("professional_id").notNull().references(() => professionals.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.professionalId, t.serviceId] }), index("professional_services_service_idx").on(t.serviceId)],
);

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    /** Somente dígitos, com DDI 55 (ex.: 5511987654321). Não é único: números podem ser compartilhados. */
    phoneNormalized: text("phone_normalized").notNull(),
    email: text("email"),
    /** Observações internas simples. Não registrar dados de saúde/sensíveis. */
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("customers_company_phone_idx").on(t.companyId, t.phoneNormalized),
    index("customers_company_name_idx").on(t.companyId, t.name),
  ],
);

export const APPOINTMENT_STATUSES = ["confirmed", "completed", "cancelled", "no_show"] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    professionalId: uuid("professional_id").notNull().references(() => professionals.id, { onDelete: "restrict" }),
    serviceId: uuid("service_id").notNull().references(() => services.id, { onDelete: "restrict" }),
    customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "restrict" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    /** Fim do atendimento. */
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    /** Fim do período ocupado (atendimento + intervalo adicional). Usado na regra anti-sobreposição. */
    occupiedUntil: timestamp("occupied_until", { withTimezone: true }).notNull(),
    status: text("status").$type<AppointmentStatus>().notNull().default("confirmed"),
    // Fotografia do serviço no momento do agendamento (não muda se o serviço mudar).
    serviceName: text("service_name").notNull(),
    priceCents: integer("price_cents").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    bufferAfterMinutes: integer("buffer_after_minutes").notNull(),
    professionalName: text("professional_name").notNull(),
    source: text("source").notNull(),
    /** Código curto para referência humana. NÃO dá acesso à reserva. */
    publicCode: text("public_code").notNull(),
    /** SHA-256 do token do link de gestão do cliente. O token em si nunca é salvo. */
    manageTokenHash: text("manage_token_hash"),
    notes: text("notes"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: text("cancelled_by"),
    cancelReason: text("cancel_reason"),
    // Fotografia da comissão, gravada quando o atendimento é concluído.
    // Mudanças futuras nas regras não alteram estes valores.
    commissionRuleId: uuid("commission_rule_id"),
    commissionCents: integer("commission_cents"),
    commissionDescription: text("commission_description"),
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("appointments_company_starts_idx").on(t.companyId, t.startsAt),
    index("appointments_professional_starts_idx").on(t.professionalId, t.startsAt),
    index("appointments_customer_idx").on(t.customerId),
    uniqueIndex("appointments_public_code_uq").on(t.publicCode),
    uniqueIndex("appointments_manage_token_uq").on(t.manageTokenHash),
    check("appointments_status_ck", sql`${t.status} in ('confirmed', 'completed', 'cancelled', 'no_show')`),
    check("appointments_source_ck", sql`${t.source} in ('public', 'manual')`),
    check("appointments_range_ck", sql`${t.startsAt} < ${t.endsAt} and ${t.endsAt} <= ${t.occupiedUntil}`),
    check("appointments_price_ck", sql`${t.priceCents} >= 0`),
    // A constraint de exclusão (sem sobreposição por profissional) é criada em
    // migração SQL própria, pois depende da extensão btree_gist.
  ],
);

export const COMMISSION_TYPES = ["percent", "fixed"] as const;
export type CommissionType = (typeof COMMISSION_TYPES)[number];

/**
 * Regras de comissão com vigência. Regras não são editadas: uma nova regra
 * para o mesmo escopo encerra a anterior (histórico preservado).
 * Escopo: profissional e/ou serviço; nulo = "todos". A mais específica vence.
 * Base de cálculo: preço fotografado do atendimento concluído.
 */
export const commissionRules = pgTable(
  "commission_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    professionalId: uuid("professional_id").references(() => professionals.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id").references(() => services.id, { onDelete: "cascade" }),
    type: text("type").$type<CommissionType>().notNull(),
    /** Percentual em pontos-base (4000 = 40%). */
    percentBasisPoints: integer("percent_basis_points"),
    fixedCents: integer("fixed_cents"),
    /** Datas locais da empresa, inclusivas. valid_to nulo = sem fim. */
    validFrom: date("valid_from", { mode: "string" }).notNull(),
    validTo: date("valid_to", { mode: "string" }),
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("commission_rules_company_idx").on(t.companyId),
    check("commission_rules_type_ck", sql`${t.type} in ('percent', 'fixed')`),
    check(
      "commission_rules_value_ck",
      sql`(${t.type} = 'percent' and ${t.percentBasisPoints} between 0 and 10000 and ${t.fixedCents} is null) or (${t.type} = 'fixed' and ${t.fixedCents} >= 0 and ${t.percentBasisPoints} is null)`,
    ),
    check("commission_rules_dates_ck", sql`${t.validTo} is null or ${t.validTo} >= ${t.validFrom}`),
    // Sem vigências sobrepostas para o mesmo escopo: constraint de exclusão em migração SQL.
  ],
);

export const PAYMENT_METHODS = ["cash", "pix", "debit_card", "credit_card", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * Pagamento registrado manualmente pela empresa. NÃO representa cobrança
 * processada pelo sistema; é apenas um registro do que foi recebido.
 */
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    appointmentId: uuid("appointment_id").references(() => appointments.id, { onDelete: "set null" }),
    amountCents: integer("amount_cents").notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull(),
    method: text("method").$type<PaymentMethod>().notNull(),
    notes: text("notes"),
    recordedByUserId: text("recorded_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("payments_company_paid_idx").on(t.companyId, t.paidAt),
    index("payments_appointment_idx").on(t.appointmentId),
    check("payments_amount_ck", sql`${t.amountCents} > 0`),
    check("payments_method_ck", sql`${t.method} in ('cash', 'pix', 'debit_card', 'credit_card', 'other')`),
  ],
);

/** Histórico de alterações importantes (quem, o quê, quando). Sem tokens ou dados sensíveis. */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    actorType: text("actor_type").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    details: text("details"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_logs_company_created_idx").on(t.companyId, t.createdAt), index("audit_logs_entity_idx").on(t.entityType, t.entityId)],
);

/** Contadores de limite de requisições (anti-abuso nas rotas públicas). */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
});
