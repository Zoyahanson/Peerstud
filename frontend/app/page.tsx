import Link from "next/link";

export default function Home() {
  return (
    <main className="page-main">
      <section className="page-content">
        <div className="glass-panel-strong relative overflow-hidden rounded-[2.2rem] p-6 sm:p-8 lg:p-10">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(16,185,129,0.25),transparent_65%)]" />
          <div className="pointer-events-none absolute -bottom-20 left-1/4 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(27,46,75,0.18),transparent_65%)]" />

          <p className="section-kicker">Mutual Exchange Learning</p>
          <h1 className="mt-3 max-w-4xl text-4xl font-black tracking-tight text-[color:var(--foreground)] sm:text-5xl">
            Find Your Perfect Study Partner
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[color:var(--ink-muted)]">
            Match with peers who can help where you are weak, while you support where they are strong. Build balanced sessions for real progress.
          </p>

          <div className="mt-7 flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/register" className="primary-button inline-flex min-h-12 items-center justify-center px-6 text-base hover:-translate-y-0.5">
                Find a Peer Tutor
              </Link>

              <Link href="/register" className="secondary-button inline-flex min-h-12 items-center justify-center px-6 text-base hover:-translate-y-0.5">
                Become a Tutor
              </Link>
            </div>

            <Link href="/login" className="text-sm font-medium text-[color:var(--accent-strong)] hover:underline">
              Already have an account? Log in
            </Link>
          </div>

        </div>
      </section>
    </main>
  );
}


