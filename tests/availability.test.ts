import { describe, expect, it } from "vitest";
import { availableStarts, checkInterval, subtractIntervals, type DayInputs } from "@/domain/availability";
import { instantToLocal, localToInstant, weekdayOf } from "@/domain/time";

const TZ = "America/Sao_Paulo";
const DATE = "2030-03-05"; // terça
const WD = weekdayOf(DATE);
const t = (hhmm: string, date = DATE, tz = TZ) => {
  const [h, m] = hhmm.split(":").map(Number);
  return localToInstant(date, h * 60 + m, tz);
};
const labels = (list: Date[], tz = TZ) =>
  list.map((d) => {
    const m = instantToLocal(d, tz).minuteOfDay;
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  });

function day(over: Partial<DayInputs> = {}): DayInputs {
  return {
    date: DATE,
    timeZone: TZ,
    companyHours: [{ weekday: WD, startMinute: 9 * 60, endMinute: 12 * 60 }],
    workingHours: [{ weekday: WD, startMinute: 9 * 60, endMinute: 12 * 60 }],
    breaks: [],
    blocks: [],
    busy: [],
    ...over,
  };
}

const svc30 = { durationMinutes: 30, bufferAfterMinutes: 0 };
const svc60 = { durationMinutes: 60, bufferAfterMinutes: 0 };

describe("disponibilidade", () => {
  it("o atendimento inteiro precisa caber no expediente (durações diferentes)", () => {
    expect(labels(availableStarts(day(), svc30, 30))).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00", "11:30"]);
    expect(labels(availableStarts(day(), svc60, 30))).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00"]);
  });

  it("respeita a intersecção entre horário da empresa e jornada do profissional", () => {
    const d = day({ workingHours: [{ weekday: WD, startMinute: 10 * 60, endMinute: 14 * 60 }] });
    expect(labels(availableStarts(d, svc60, 30))).toEqual(["10:00", "10:30", "11:00"]);
  });

  it("dia sem expediente não tem horários", () => {
    const d = day({ companyHours: [{ weekday: (WD + 1) % 7, startMinute: 540, endMinute: 1080 }] });
    expect(availableStarts(d, svc30, 30)).toEqual([]);
  });

  it("pausas e bloqueios removem horários", () => {
    const d = day({
      breaks: [{ weekday: WD, startMinute: 10 * 60, endMinute: 10 * 60 + 30 }],
      blocks: [{ start: t("11:30").getTime(), end: t("12:00").getTime() }],
    });
    expect(labels(availableStarts(d, svc30, 30))).toEqual(["09:00", "09:30", "10:30", "11:00"]);
    // serviço de 60 min não pode atravessar a pausa
    expect(labels(availableStarts(d, svc60, 30))).toEqual(["09:00", "10:30"]);
  });

  it("pausa de outro dia da semana não interfere", () => {
    const d = day({ breaks: [{ weekday: (WD + 1) % 7, startMinute: 540, endMinute: 720 }] });
    expect(availableStarts(d, svc30, 30)).toHaveLength(6);
  });

  it("atendimentos existentes e o intervalo adicional bloqueiam sobreposição", () => {
    const d = day({ busy: [{ start: t("10:00").getTime(), end: t("10:45").getTime() }] });
    expect(labels(availableStarts(d, svc30, 15))).toEqual(["09:00", "09:15", "09:30", "10:45", "11:00", "11:15", "11:30"]);
    const withBuffer = { durationMinutes: 30, bufferAfterMinutes: 15 };
    // 09:30 + 30 min + 15 min de intervalo invade o atendimento das 10:00
    expect(labels(availableStarts(d, withBuffer, 15))).toEqual(["09:00", "09:15", "10:45", "11:00", "11:15", "11:30"]);
  });

  it("o intervalo adicional pode avançar além do fechamento", () => {
    const withBuffer = { durationMinutes: 30, bufferAfterMinutes: 15 };
    expect(labels(availableStarts(day(), withBuffer, 30)).at(-1)).toBe("11:30");
  });

  it("antecedência mínima e limite de dias", () => {
    const now = t("09:40");
    const window = { now, minAdvanceMinutes: 60, maxDaysAhead: 10 };
    expect(labels(availableStarts(day(), svc30, 30, window))).toEqual(["11:00", "11:30"]);
    const far = day({ date: "2030-03-20" });
    expect(availableStarts(far, svc30, 30, window)).toEqual([]);
    expect(checkInterval(day(), svc30, t("10:00"), window)).toEqual({ ok: false, reason: "too_soon" });
    expect(checkInterval(day(), svc30, t("09:00"), window)).toEqual({ ok: false, reason: "in_past" });
  });

  it("valida intervalos arbitrários (agendamento manual)", () => {
    expect(checkInterval(day(), svc30, t("08:45"))).toEqual({ ok: false, reason: "outside_hours" });
    expect(checkInterval(day(), svc30, t("11:45"))).toEqual({ ok: false, reason: "outside_hours" });
    expect(checkInterval(day(), svc30, t("11:30"))).toEqual({ ok: true });
    const busy = day({ busy: [{ start: t("10:00").getTime(), end: t("10:30").getTime() }] });
    expect(checkInterval(busy, svc30, t("10:15"))).toEqual({ ok: false, reason: "conflict" });
    expect(checkInterval(busy, svc30, t("10:30"))).toEqual({ ok: true });
  });

  it("subtração de intervalos", () => {
    expect(subtractIntervals([{ start: 0, end: 10 }], [{ start: 2, end: 4 }, { start: 8, end: 12 }])).toEqual([
      { start: 0, end: 2 },
      { start: 4, end: 8 },
    ]);
  });
});

describe("fuso horário", () => {
  it("09:00 em São Paulo é 12:00 UTC", () => {
    expect(localToInstant("2030-03-05", 9 * 60, TZ).toISOString()).toBe("2030-03-05T12:00:00.000Z");
    expect(instantToLocal(new Date("2030-03-05T12:00:00Z"), TZ)).toEqual({ date: "2030-03-05", minuteOfDay: 540, weekday: 2 });
  });

  it("instante perto da meia-noite cai no dia local correto", () => {
    expect(instantToLocal(new Date("2030-03-06T02:30:00Z"), TZ).date).toBe("2030-03-05");
  });

  it("os horários seguem o fuso da empresa, inclusive com horário de verão", () => {
    const ny = "America/New_York";
    // antes e depois da mudança de horário (10/03/2030)
    expect(localToInstant("2030-03-08", 9 * 60, ny).toISOString()).toBe("2030-03-08T14:00:00.000Z");
    expect(localToInstant("2030-03-12", 9 * 60, ny).toISOString()).toBe("2030-03-12T13:00:00.000Z");
    const wd = weekdayOf("2030-03-12");
    const d: DayInputs = {
      date: "2030-03-12",
      timeZone: ny,
      companyHours: [{ weekday: wd, startMinute: 540, endMinute: 600 }],
      workingHours: [{ weekday: wd, startMinute: 540, endMinute: 600 }],
      breaks: [],
      blocks: [],
      busy: [],
    };
    expect(labels(availableStarts(d, svc30, 30), ny)).toEqual(["09:00", "09:30"]);
  });
});
