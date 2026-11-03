/**
 * Configuração por segmento de negócio. As regras de negócio usam sempre
 * "profissional" internamente; somente os textos de interface mudam aqui.
 */
export const SEGMENTS = ["barbershop", "beauty_salon", "nails", "brows", "other"] as const;
export type Segment = (typeof SEGMENTS)[number];

export type SegmentConfig = {
  label: string;
  /** Como o profissional é chamado na interface. */
  professional: { singular: string; plural: string };
  /** Sugestões exibidas no onboarding (apenas texto, não são criadas automaticamente). */
  serviceSuggestions: { name: string; durationMinutes: number }[];
};

export const SEGMENT_CONFIG: Record<Segment, SegmentConfig> = {
  barbershop: {
    label: "Barbearia",
    professional: { singular: "Barbeiro", plural: "Barbeiros" },
    serviceSuggestions: [
      { name: "Corte", durationMinutes: 30 },
      { name: "Barba", durationMinutes: 30 },
      { name: "Corte + barba", durationMinutes: 60 },
    ],
  },
  beauty_salon: {
    label: "Salão de beleza",
    professional: { singular: "Profissional", plural: "Profissionais" },
    serviceSuggestions: [
      { name: "Corte feminino", durationMinutes: 60 },
      { name: "Escova", durationMinutes: 45 },
    ],
  },
  nails: {
    label: "Manicure e pedicure",
    professional: { singular: "Manicure", plural: "Manicures" },
    serviceSuggestions: [
      { name: "Manicure", durationMinutes: 45 },
      { name: "Pedicure", durationMinutes: 45 },
    ],
  },
  brows: {
    label: "Design de sobrancelhas",
    professional: { singular: "Designer", plural: "Designers" },
    serviceSuggestions: [{ name: "Design de sobrancelhas", durationMinutes: 30 }],
  },
  other: {
    label: "Outro serviço de beleza",
    professional: { singular: "Profissional", plural: "Profissionais" },
    serviceSuggestions: [],
  },
};

export function segmentConfig(segment: string | null | undefined): SegmentConfig {
  return SEGMENT_CONFIG[(segment as Segment) ?? "other"] ?? SEGMENT_CONFIG.other;
}
