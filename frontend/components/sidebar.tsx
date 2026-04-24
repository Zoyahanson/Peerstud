"use client";

import { useState } from "react";
import { BarChart3, BookOpen, CalendarRange, ChevronLeft, ChevronRight, Home, Menu, MessageSquare, Search, Settings, Trophy, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview", icon: Home },
  { href: "/dashboard/virtual-sessions", label: "Virtual Sessions", icon: CalendarRange },
  { href: "/dashboard/community", label: "Community", icon: MessageSquare },
  { href: "/dashboard/tutors", label: "Find Tutors", icon: Search },
  { href: "/dashboard/progress", label: "Progress", icon: BarChart3 },
  { href: "/dashboard/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/dashboard/resources", label: "Resources", icon: BookOpen },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
] as const;

export default function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const bottomNavItems = NAV_ITEMS.slice(0, 4);

  return (
    <>
      <div className="fixed bottom-24 right-4 z-40 md:hidden">
        <button
          onClick={() => setMobileOpen((previous) => !previous)}
          className="flex items-center gap-2 rounded-full primary-button px-4 py-3 text-sm shadow-sm"
          aria-expanded={mobileOpen}
          aria-controls="mobile-dashboard-nav"
          aria-label={mobileOpen ? "Close dashboard navigation" : "Open dashboard navigation"}
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          Menu
        </button>
      </div>

      {mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-[rgba(21,18,15,0.32)] md:hidden"
          aria-label="Close navigation overlay"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        id="mobile-dashboard-nav"
        className={`fixed left-0 top-0 z-40 h-full w-[86vw] max-w-[20rem] px-4 py-6 transition-transform duration-300 md:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-hidden={!mobileOpen}
      >
        <div className="h-full overflow-y-auto rounded-[2rem] border border-white/10 bg-[color:var(--sidebar-bg)] p-4 shadow-2xl backdrop-blur-xl">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="section-kicker-light">Navigation</p>
              <h2 className="mt-1 text-xl font-black tracking-tight text-white">Dashboard</h2>
            </div>
            <button
              onClick={() => setMobileOpen(false)}
              className="rounded-full border border-white/20 bg-white/10 p-2 text-[color:var(--sidebar-text)]"
              aria-label="Close dashboard navigation"
            >
              <X size={20} />
            </button>
          </div>

          <nav className="space-y-2.5" aria-label="Mobile dashboard navigation">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`group flex items-center gap-3 rounded-2xl px-3 py-3 transition ${
                    active
                      ? "bg-white/[0.12] text-white font-semibold"
                      : "text-[color:var(--sidebar-text)] hover:bg-white/[0.08] hover:text-white"
                  }`}
                >
                  <span className={active ? "text-[color:var(--accent)]" : ""}><Icon size={22} /></span>
                  <span className="font-medium">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>

      <aside className={`hidden shrink-0 px-4 py-6 transition-[width] duration-300 md:block ${desktopCollapsed ? "w-[6.8rem]" : "w-[19rem]"}`}>
        <div className="sticky top-24 rounded-[2rem] border border-white/10 bg-[color:var(--sidebar-bg)] p-4 shadow-xl backdrop-blur-xl">
          <div className="mb-5 flex items-start justify-between gap-2">
            {!desktopCollapsed && (
              <div>
                <p className="section-kicker-light">Navigation</p>
                <h2 className="mt-1 text-xl font-black tracking-tight text-white">Dashboard</h2>
              </div>
            )}
            <button
              onClick={() => setDesktopCollapsed((prev) => !prev)}
              className="rounded-full border border-white/20 bg-white/10 p-1.5 text-[color:var(--sidebar-text)] hover:bg-white/20"
              aria-label={desktopCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={desktopCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {desktopCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            </button>
          </div>

          <nav className="space-y-2.5">
          {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={`group flex items-center gap-3 rounded-2xl px-3 py-3 transition ${
                active
                  ? "bg-white/[0.12] text-white font-semibold"
                  : "text-[color:var(--sidebar-text)] hover:bg-white/[0.08] hover:text-white"
              }`}
            >
              <span className={active ? "text-[color:var(--accent)]" : ""}><Icon size={22} /></span>
              {!desktopCollapsed && <span className="font-medium">{item.label}</span>}
            </Link>
          );
          })}
        </nav>
        </div>
      </aside>

      <nav className="fixed inset-x-3 bottom-3 z-30 rounded-[1.8rem] border border-[color:var(--border)] bg-white p-2 shadow-2xl backdrop-blur-xl md:hidden" aria-label="Quick mobile navigation">
        <div className="grid grid-cols-4 gap-2">
          {bottomNavItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`flex flex-col items-center gap-1 rounded-[1.2rem] px-2 py-2 text-center text-[11px] font-medium ${
                  active
                    ? "bg-[color:var(--accent-soft)] text-[color:var(--accent-strong)]"
                    : "text-[color:var(--ink-muted)]"
                }`}
              >
                <Icon size={20} />
                <span>{item.label.replace("Virtual ", "")}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
