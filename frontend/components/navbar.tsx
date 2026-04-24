"use client";

import Link from "next/link";
import { Bell, ChevronDown, ChevronUp, Menu, Search, User, X } from "lucide-react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [loggedIn, setLoggedIn] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return Boolean(localStorage.getItem("token"));
  });
  const router = useRouter();

  useEffect(() => {
    function syncAuthState() {
      setLoggedIn(Boolean(localStorage.getItem("token")));
    }

    window.addEventListener("storage", syncAuthState);
    window.addEventListener("auth-changed", syncAuthState);

    return () => {
      window.removeEventListener("storage", syncAuthState);
      window.removeEventListener("auth-changed", syncAuthState);
    };
  }, []);

  return (
    <nav className="sticky top-0 z-40 overflow-hidden border-b border-[color:var(--border)] bg-[rgba(255,255,255,0.88)] backdrop-blur-xl">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[color:var(--green)] via-[color:var(--accent)] to-[color:var(--navy)]" />
      <div className="pointer-events-none absolute -left-12 -top-16 h-40 w-40 rounded-full bg-[color:var(--accent-soft)] blur-3xl" />
      <div className="pointer-events-none absolute -right-8 -top-16 h-40 w-40 rounded-full bg-[color:var(--navy-tint)] blur-3xl" />

      <div className="mx-auto flex max-w-screen-2xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 sm:gap-8">
          <Link href="/" className="flex items-center text-[1.45rem] font-black tracking-tight text-[color:var(--foreground)]">
            <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-[color:var(--green)]" />
            <span>PeerStud</span>
            <span className="ml-2 inline-block h-2.5 w-2.5 rounded-full bg-[color:var(--navy)]" />
          </Link>

          <div className={`hidden items-center gap-2 md:flex ${desktopCollapsed ? "hidden" : ""}`}>
            <Link href="/" className="rounded-full px-4 py-2 text-sm font-medium text-[color:var(--ink-muted)] hover:bg-white/70 hover:text-[color:var(--foreground)]">
              Home
            </Link>

            {loggedIn && (
              <Link href="/dashboard" className="rounded-full px-4 py-2 text-sm font-medium text-[color:var(--ink-muted)] hover:bg-white/70 hover:text-[color:var(--foreground)]">
                Dashboard
              </Link>
            )}
          </div>
        </div>

        <button
          onClick={() => setDesktopCollapsed((previous) => !previous)}
          className="hidden rounded-full border border-[color:var(--border)] bg-white/80 p-2 text-[color:var(--foreground)] md:inline-flex"
          aria-expanded={!desktopCollapsed}
          aria-label={desktopCollapsed ? "Expand navigation" : "Collapse navigation"}
          title={desktopCollapsed ? "Expand navigation" : "Collapse navigation"}
        >
          {desktopCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
        </button>

        <button
          onClick={() => setMobileMenuOpen((previous) => !previous)}
          className="rounded-full border border-[color:var(--border)] bg-white/75 p-2 text-[color:var(--foreground)] md:hidden"
          aria-expanded={mobileMenuOpen}
          aria-controls="site-mobile-menu"
          aria-label={mobileMenuOpen ? "Close main menu" : "Open main menu"}
        >
          {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>

        {loggedIn ? (
          <div className={`relative items-center gap-3 ${desktopCollapsed ? "hidden md:hidden" : "hidden md:flex"}`}>
            <Link
              href="/dashboard/tutors"
              className="hidden items-center gap-2 rounded-full border border-[color:var(--border)] bg-white/70 px-4 py-2 text-sm font-medium text-[color:var(--foreground)] shadow-sm hover:-translate-y-0.5 lg:flex"
            >
              <Search size={20} />
              Search Tutors
            </Link>
            <Link
              href="/dashboard/virtual-sessions"
              className="hidden items-center gap-2 rounded-full border border-[color:var(--border)] bg-white/70 px-4 py-2 text-sm font-medium text-[color:var(--foreground)] shadow-sm hover:-translate-y-0.5 md:flex"
            >
              <Bell size={20} />
              Reminders
            </Link>
            <button
              onClick={() => setOpen(!open)}
              className="flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-white/75 px-4 py-2 text-[color:var(--foreground)] shadow-sm hover:-translate-y-0.5"
            >
              <User size={22} />
              Profile
            </button>

            {open && (
              <div className="absolute right-0 top-full mt-3 w-48 rounded-3xl border border-[color:var(--border)] bg-white p-4 shadow-2xl backdrop-blur-xl">
                <Link
                  href="/profile"
                  className="mb-2 block rounded-2xl px-3 py-2 text-sm font-medium text-[color:var(--foreground)] hover:bg-white"
                  onClick={() => setOpen(false)}
                >
                  My Account
                </Link>
                <div
                  className="cursor-pointer rounded-2xl px-3 py-2 text-sm font-medium text-[color:var(--accent-strong)] hover:bg-white"
                  onClick={() => {
                    localStorage.removeItem("token");
                    window.dispatchEvent(new Event("auth-changed"));
                    setLoggedIn(false);
                    setOpen(false);
                    router.push("/");
                  }}
                >
                  Logout
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className={`items-center gap-3 text-sm font-medium text-[color:var(--foreground)] ${desktopCollapsed ? "hidden md:hidden" : "hidden md:flex"}`}>
            <Link href="/login" className="rounded-full px-4 py-2 text-[color:var(--ink-muted)] hover:bg-white/70 hover:text-[color:var(--foreground)]">
              Login
            </Link>

            <Link
              href="/register"
              className="rounded-full primary-button px-5 py-2.5 shadow-sm hover:-translate-y-0.5"
            >
              Get Started
            </Link>
          </div>
        )}
      </div>

      {mobileMenuOpen && (
        <div id="site-mobile-menu" className="border-t border-[color:var(--border)] bg-white px-4 py-4 md:hidden">
          <div className="mx-auto flex max-w-screen-2xl flex-col gap-2">
            <Link href="/" onClick={() => setMobileMenuOpen(false)} className="rounded-2xl px-4 py-3 text-sm font-medium text-[color:var(--foreground)] hover:bg-white">
              Home
            </Link>
            {loggedIn && (
              <>
                <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)} className="rounded-2xl px-4 py-3 text-sm font-medium text-[color:var(--foreground)] hover:bg-white">
                  Dashboard
                </Link>
                <Link href="/dashboard/tutors" onClick={() => setMobileMenuOpen(false)} className="rounded-2xl px-4 py-3 text-sm font-medium text-[color:var(--foreground)] hover:bg-white">
                  Search Tutors
                </Link>
                <Link href="/dashboard/virtual-sessions" onClick={() => setMobileMenuOpen(false)} className="rounded-2xl px-4 py-3 text-sm font-medium text-[color:var(--foreground)] hover:bg-white">
                  Reminders
                </Link>
              </>
            )}
            {!loggedIn && (
              <>
                <Link href="/login" onClick={() => setMobileMenuOpen(false)} className="rounded-2xl px-4 py-3 text-sm font-medium text-[color:var(--foreground)] hover:bg-white">
                  Login
                </Link>
                <Link href="/register" onClick={() => setMobileMenuOpen(false)} className="rounded-2xl primary-button px-4 py-3 text-sm font-semibold text-white">
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
