import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MapPin, Phone, ShieldCheck } from "lucide-react";
import { getDb } from "@/db";
import { segmentConfig } from "@/config/segments";
import { APP_NAME } from "@/config/app";
import { addDays, todayIn, weekdayOf } from "@/domain/time";
import { readableTextOn } from "@/lib/color";
import { getPublicCatalog } from "@/server/services/booking";
import { getCompanyHours } from "@/server/services/companies";
import { BookingFlow } from "./booking-flow";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/b/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const catalog = await getPublicCatalog(getDb(), slug);
  if (!catalog) return { title: "Página não encontrada" };
  return { title: `Agendar · ${catalog.company.name}`, description: `Agende seu horário em ${catalog.company.name}.` };
}

export default async function PublicBookingPage(props: PageProps<"/b/[slug]">) {
  const { slug } = await props.params;
  const db = getDb();
  const catalog = await getPublicCatalog(db, slug);
  if (!catalog) notFound();
  const { company } = catalog;
  const hours = await getCompanyHours(db, company.id);
  const openWeekdays = new Set(hours.map((h) => h.weekday));
  const today = todayIn(company.timezone);
  const dates = Array.from({ length: company.maxDaysAhead + 1 }, (_, i) => addDays(today, i)).map((d) => ({
    date: d,
    open: openWeekdays.has(weekdayOf(d)),
  }));
  const labels = segmentConfig(company.segment);
  const brandText = readableTextOn(company.brandColor);

  return (
    <div className="min-h-screen bg-canvas" style={{ ["--brand" as string]: company.brandColor, ["--brand-text" as string]: brandText }}>
      <header className="relative overflow-hidden bg-[var(--brand)] text-[var(--brand-text)]">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_-10%,rgb(255_255_255/0.22),transparent_45%),radial-gradient(circle_at_0%_120%,rgb(0_0_0/0.25),transparent_50%)]" />
        <div className="relative mx-auto max-w-2xl px-4 pt-8 pb-20">
          {company.isDemo ? (
            <p className="mb-3 inline-block rounded-full bg-black/20 px-3 py-1 text-xs font-medium">Página de demonstração · dados fictícios</p>
          ) : null}
          <div className="flex items-center gap-4">
            <span aria-hidden className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-white/15 text-2xl font-bold ring-1 ring-white/25 backdrop-blur">
              {initials(company.name)}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-wider uppercase opacity-80">{labels.label}</p>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{company.name}</h1>
            </div>
          </div>
          {company.serviceInfo ? <p className="mt-4 max-w-prose text-sm opacity-90">{company.serviceInfo}</p> : null}
          <ul className="mt-4 flex flex-wrap gap-2 text-xs">
            {company.addressLine || company.city ? (
              <li className="inline-flex items-center gap-1.5 rounded-full bg-black/15 px-3 py-1.5">
                <MapPin aria-hidden className="h-3.5 w-3.5" /> {[company.addressLine, company.city].filter(Boolean).join(" · ")}
              </li>
            ) : null}
            {company.phone ? (
              <li className="inline-flex items-center gap-1.5 rounded-full bg-black/15 px-3 py-1.5">
                <Phone aria-hidden className="h-3.5 w-3.5" /> {company.phone}
              </li>
            ) : null}
            <li className="inline-flex items-center gap-1.5 rounded-full bg-black/15 px-3 py-1.5">
              <ShieldCheck aria-hidden className="h-3.5 w-3.5" /> Confirmação na hora, sem cadastro
            </li>
          </ul>
        </div>
      </header>
      <main className="relative mx-auto -mt-12 max-w-2xl px-4 pb-6">
        {catalog.services.length === 0 ? (
          <div className="rounded-3xl border border-line bg-surface p-8 text-center shadow-[var(--shadow-lift)]">
            <p className="font-medium">Agendamento online indisponível no momento.</p>
            <p className="mt-1 text-sm text-muted">Entre em contato diretamente com o estabelecimento.</p>
          </div>
        ) : (
          <BookingFlow
            slug={company.slug}
            timezone={company.timezone}
            services={catalog.services}
            professionals={catalog.professionals}
            dates={dates}
            professionalLabel={labels.professional.singular}
          />
        )}
      </main>
      <footer className="pb-8 text-center text-xs text-muted">Agendamento online por {APP_NAME}</footer>
    </div>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || name.charAt(0).toUpperCase();
}
