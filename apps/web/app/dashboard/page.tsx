import Link from "next/link";

// ─── Data ─────────────────────────────────────────────────────────────────────

const USERNAME = "Alex";

const features = [
  {
    title: "Schedule planner",
    href: "/schedule",
    description:
      "Builds your personalized weekly study schedule and recommends what classes to take next quarter, all tailored to your workload and commitments.",
  },
  {
    title: "Aggie Mate",
    href: "/aggie-mate",
    description:
      "Find classmates in your courses who are free at the same time as you — so you can skip the groupchat chaos and go straight to studying.",
  },
  {
    title: "Professor Search",
    href: "/professor-search",
    description:
      "Browse UC Davis faculty by major and/or research area. Click any professor to get a ready-to-send email draft expressing interest in their lab.",
  },
];

// ─── Icons ────────────────────────────────────────────────────────────────────

function BookIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#A5BA9B"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#F4F2E8]">

      {/* ── Navbar ── */}
      <nav className="bg-[#1B3968] px-8 py-3.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-[#6A9879]/25 flex items-center justify-center">
            <BookIcon />
          </div>
          <span className="text-white text-sm font-medium tracking-wide">
            Student Life Helper
          </span>
        </div>

        {/* User avatar / initials */}
        <div className="flex items-center gap-3">
          <span className="text-white/60 text-[13px] hidden sm:block">
            {USERNAME}
          </span>
          <div className="w-8 h-8 rounded-full bg-[#6A9879]/30 border border-[#6A9879]/40 flex items-center justify-center">
            <span className="text-white text-xs font-medium">
              {USERNAME[0]}
            </span>
          </div>
        </div>
      </nav>

      {/* ── Main content ── */}
      <main className="flex-1 px-10 sm:px-16 py-14 flex flex-col items-center">

        {/* Greeting */}
        <h1 className="text-[26px] sm:text-[34px] font-semibold text-[#1a1a1a] whitespace-nowrap mb-2 text-center">
          Welcome back <span className="text-[#1B3968]">{USERNAME}</span>, what would you like to do today?
        </h1>
        <p className="text-[15px] text-[#5a6872] mb-12 text-center">
          Choose a tool to get started.
        </p>

        {/* Feature rows */}
        <div className="flex flex-col gap-5 w-full max-w-4xl">
          {features.map((feat) => (
            <div
              key={feat.href}
              className="grid grid-cols-1 sm:grid-cols-[320px_1fr] gap-4 sm:gap-10 items-center group"
            >
              {/* Card button */}
              <Link
                href={feat.href}
                className="
                  flex items-center justify-between
                  rounded-2xl border border-[#B3C1BB]/50
                  bg-white/70 px-7 py-7
                  text-[19px] font-medium text-[#1a1a1a]
                  hover:border-[#1B3968] hover:bg-[#1B3968] hover:text-white
                  transition-all duration-200
                  shadow-sm hover:shadow-md
                "
              >
                <span>{feat.title}</span>
                <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-white">
                  <ChevronRightIcon />
                </span>
              </Link>

              {/* Description */}
              <p className="text-[15px] text-[#5a6872] leading-relaxed group-hover:text-[#1a1a1a] transition-colors duration-200">
                {feat.description}
              </p>
            </div>
          ))}
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="px-10 sm:px-16 py-5 border-t border-[#B3C1BB]/30">
        <p className="text-[12px] text-[#94AAA1]">
          Student Life Helper · UC Davis · Free to use
        </p>
      </footer>
    </div>
  );
}
