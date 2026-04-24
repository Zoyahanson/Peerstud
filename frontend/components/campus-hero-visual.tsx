type CampusHeroVisualProps = {
  className?: string;
};

export default function CampusHeroVisual({ className = "" }: CampusHeroVisualProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-[2rem] border border-[color:var(--border)] bg-white/90 p-6 shadow-2xl backdrop-blur-xl ${className}`}
      aria-hidden="true"
    >
      <div className="absolute inset-x-6 top-6 h-20 rounded-full bg-[rgba(27,46,75,0.08)] blur-3xl" />
      <div className="relative grid gap-4">
        <div className="grid grid-cols-[1.1fr_0.9fr] gap-4">
          <div className="rounded-[1.6rem] editorial-gradient p-5 text-white">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/70">Peer Match</p>
            <div className="mt-6 flex items-end gap-3">
              <div className="h-24 w-24 rounded-[1.5rem] bg-white/20" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-24 rounded-full bg-white/40" />
                <div className="h-3 w-32 rounded-full bg-white/25" />
                <div className="h-3 w-20 rounded-full bg-white/25" />
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <div className="rounded-[1.4rem] bg-[color:var(--accent-soft)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--accent-strong)]">Reminder</p>
              <div className="mt-5 h-16 rounded-[1rem] bg-white/70" />
            </div>
            <div className="rounded-[1.4rem] border border-[color:var(--border)] bg-white/80 p-4">
              <div className="h-3 w-20 rounded-full bg-[color:var(--navy-tint)]" />
              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="h-10 rounded-xl bg-[color:var(--navy-tint)]" />
                <div className="h-10 rounded-xl bg-[color:var(--accent-soft)]" />
                <div className="h-10 rounded-xl bg-[color:var(--navy-tint)]" />
              </div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-[0.88fr_1.12fr] gap-4">
          <div className="rounded-[1.5rem] border border-[color:var(--border)] bg-white/80 p-5">
            <div className="h-3 w-24 rounded-full bg-[color:var(--navy-tint)]" style={{opacity:0.7}} />
            <div className="mt-4 space-y-3">
              <div className="h-4 w-full rounded-full bg-[color:var(--navy-tint)]" />
              <div className="h-4 w-5/6 rounded-full bg-[color:var(--navy-tint)]" />
              <div className="h-4 w-4/6 rounded-full bg-[color:var(--navy-tint)]" />
            </div>
          </div>
          <div className="rounded-[1.5rem] bg-[color:var(--navy-tint)] p-5">
            <div className="grid grid-cols-4 items-end gap-3">
              <div className="h-14 rounded-t-xl bg-[rgba(27,46,75,0.35)]" />
              <div className="h-24 rounded-t-xl bg-[rgba(16,185,129,0.6)]" />
              <div className="h-16 rounded-t-xl bg-[rgba(27,46,75,0.35)]" />
              <div className="h-28 rounded-t-xl bg-[rgba(16,185,129,0.80)]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
