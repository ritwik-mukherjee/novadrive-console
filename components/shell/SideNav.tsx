"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SCREENS, screenFor } from "@/lib/nav";

export function SideNav() {
  const active = screenFor(usePathname()).href;
  return (
    <nav aria-label="Primary" className="flex w-48 shrink-0 flex-col border-r hairline px-5 py-6">
      <Link href="/" className="mb-8 block">
        <span className="serif block text-lg leading-tight">NovaDrive</span>
        <span className="label">CRO supplier-risk console</span>
      </Link>
      <ul className="space-y-0.5">
        {SCREENS.map((s) => {
          const on = s.href === active;
          return (
            <li key={s.href}>
              <Link
                href={s.href}
                aria-current={on ? "page" : undefined}
                className={`block border-l-2 py-1.5 pl-3 ${
                  on ? "border-accent font-medium text-ink" : "border-transparent text-muted hover:text-ink"
                }`}
              >
                {s.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
