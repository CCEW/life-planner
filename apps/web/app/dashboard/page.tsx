import Link from "next/link";
import Image from "next/image";
import { cookies } from "next/headers";
import AccountMenu from "./AccountMenu";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getFullName(): Promise<string> {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return "there";
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
    return payload.user_metadata?.full_name ?? payload.email ?? "there";
  } catch {
    return "there";
  }
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function CalendarCardIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#487A62" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function UsersCardIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#487A62" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function MicroscopeCardIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#487A62" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 18h8" />
      <path d="M3 22h18" />
      <path d="M14 22a7 7 0 1 0 0-14h-1" />
      <path d="M9 14h2" />
      <path d="M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2Z" />
      <path d="M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

// ─── Feature data ─────────────────────────────────────────────────────────────

const features = [
  {
    title: "Schedule planner",
    href: "/schedule",
    badge: "AI-powered",
    badgeClass: "bg-emerald-100 text-emerald-700",
    cta: "Open planner",
    description:
      "Builds your personalized weekly study schedule and recommends what classes to take next quarter — all tailored to your workload, commitments, and the patterns AI learns from your Google Calendar.",
    tags: ["Google Calendar sync", "Course suggestions", "Workload-aware", "AI chat advisor"],
    icon: <CalendarCardIcon />,
  },
  {
    title: "Aggie Mate",
    href: "/aggie-mate",
    badge: "Study matching",
    badgeClass: "bg-blue-100 text-blue-600",
    cta: "Find classmates",
    description:
      "Find classmates in your exact courses who are free at the same time as you — so you can skip the group chat chaos and go straight to studying. Look up a friend by name to instantly see shared classes and overlapping free time.",
    tags: ["Same class only", "Free time matching", "Friend lookup"],
    icon: <UsersCardIcon />,
  },
  {
    title: "Professor search",
    href: "/professor-search",
    badge: "Research labs",
    badgeClass: "bg-rose-100 text-rose-600",
    cta: "Browse faculty",
    description:
      "Browse UC Davis faculty by major and research area. Click any professor to get a ready-to-send cold email draft expressing interest in their lab — just add your resume and transcript.",
    tags: ["All departments", "Cold email draft", "Lab availability"],
    icon: <MicroscopeCardIcon />,
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const fullName = await getFullName();
  return (
    <div className="min-h-screen flex flex-col bg-[#F4F2E8]">

      {/* ── Navbar ── */}
      <nav className="bg-[#1B3968] px-8 py-1.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Image src="/logo2.png" alt="Student Life Helper" width={70} height={70} className="object-contain" />
          <span className="text-white text-[30px] font-medium tracking-wide">
            Student Life Helper
          </span>
        </div>

        <AccountMenu fullName={fullName} />
      </nav>

      {/* ── Main content ── */}
      <main className="flex-1 px-6 sm:px-12 py-12 flex flex-col items-center">

        {/* Greeting */}
        <h1 className="text-[28px] sm:text-[36px] font-bold text-[#1a1a1a] mb-2 text-center leading-tight">
          Welcome back, <span className="text-[#487A62]">{fullName}</span> — what would you like to do today?
        </h1>
        <p className="text-[15px] text-[#6B7280] mb-10 text-center">
          Choose a tool to get started.
        </p>

        {/* Feature cards */}
        <div className="flex flex-col gap-4 w-full max-w-3xl">
          {features.map((feat) => (
            <div
              key={feat.href}
              className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm overflow-hidden flex flex-col sm:flex-row"
            >
              {/* Left panel */}
              <div className="sm:w-52 shrink-0 px-6 py-6 flex flex-col gap-3 sm:border-r border-[#E5E7EB]">
                <div className="w-10 h-10 rounded-xl bg-[#E8F5EE] flex items-center justify-center">
                  {feat.icon}
                </div>
                <div>
                  <p className="text-[16px] font-semibold text-[#1a1a1a] mb-1.5">{feat.title}</p>
                  <span className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full ${feat.badgeClass}`}>
                    {feat.badge}
                  </span>
                </div>
                <Link
                  href={feat.href}
                  className="flex items-center gap-1 text-[13px] font-medium text-[#487A62] hover:text-[#1B3968] transition-colors mt-auto"
                >
                  {feat.cta} <ChevronRightIcon />
                </Link>
              </div>

              {/* Right panel */}
              <div className="flex-1 px-6 py-6 flex flex-col gap-4">
                <p className="text-[14px] text-[#4B5563] leading-relaxed">{feat.description}</p>
                <div className="flex flex-wrap gap-2 mt-auto">
                  {feat.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[12px] text-[#6B7280] bg-[#F3F4F6] px-3 py-1 rounded-full border border-[#E5E7EB]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="px-8 py-4 border-t border-[#E5E7EB] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Image src="/logo2.png" alt="Student Life Helper" width={24} height={24} className="object-contain" />
          <p className="text-[12px] text-[#9CA3AF]">
            Student Life Helper · UC Davis · Free to use
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[12px] text-[#9CA3AF] cursor-pointer hover:text-[#6B7280]">Privacy</span>
          <span className="text-[12px] text-[#9CA3AF] cursor-pointer hover:text-[#6B7280]">Terms</span>
          <span className="text-[12px] text-[#9CA3AF] cursor-pointer hover:text-[#6B7280]">Support</span>
        </div>
      </footer>
    </div>
  );
}
