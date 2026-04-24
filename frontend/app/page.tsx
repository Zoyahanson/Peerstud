import Link from "next/link";

export default function Home() {
  return (
    <main className="page-main">
      <section className="page-content">
        <div className="page-card-strong p-6 text-left sm:p-8 lg:p-10">
          <h1 className="page-title max-w-3xl">PeerStud</h1>
          <p className="page-subtitle max-w-2xl">Schedule sessions, find tutors, and stay organized.</p>

          <form action="/dashboard/tutors" method="GET" className="mt-8 grid gap-3 rounded-[1.7rem] border border-[color:var(--border)] bg-white/75 p-4 sm:grid-cols-[1fr_auto]" role="search" aria-label="Search tutors by subject">
            <label className="sr-only" htmlFor="home-subject-search">Search by subject or course</label>
            <input
              id="home-subject-search"
              name="subject"
              type="search"
              placeholder="Search subjects, courses, or tutor strengths"
              className="field-shell min-h-12 text-sm"
            />
            <button type="submit" className="primary-button min-h-12 px-5 text-sm hover:-translate-y-0.5">
              Search Tutors
            </button>
          </form>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link href="/register" className="primary-button inline-flex min-h-12 items-center justify-center px-6 text-base hover:-translate-y-0.5">
              Start Scheduling
            </Link>
            <Link href="/login" className="secondary-button inline-flex min-h-12 items-center justify-center px-6 text-base hover:-translate-y-0.5">
              Sign In
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}


