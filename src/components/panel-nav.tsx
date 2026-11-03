"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  LayoutDashboard,
  Scissors,
  Settings,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cx } from "./ui";

/** Ícones referenciados por nome para poder montar o menu num Server Component. */
const ICONS = {
  overview: LayoutDashboard,
  agenda: CalendarDays,
  customers: Users,
  services: Scissors,
  staff: UserRound,
  payments: Wallet,
  reports: BarChart3,
  settings: Settings,
} satisfies Record<string, LucideIcon>;

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS };

export function PanelNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/painel" ? pathname === "/painel" : pathname.startsWith(href));
  return (
    <nav aria-label="Menu principal">
      <ul className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          const active = isActive(item.href);
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                  active ? "bg-sidebar-active text-white" : "text-sidebar-text hover:bg-sidebar-hover hover:text-white",
                )}
              >
                <Icon aria-hidden className={cx("h-[18px] w-[18px]", active ? "text-[#f3c77a]" : "opacity-80 group-hover:opacity-100")} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
