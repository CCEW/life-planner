"use client";

import { useState, Fragment } from "react";
import Link from "next/link";
import Image from "next/image";

// ─── Static placeholder data (replace with real API data later) ───────────────

const MY_COURSES = [
  { code: "ECS 20", name: "Discrete Math" },
  { code: "MAT 21A", name: "Calculus" },
  { code: "ECS 36A", name: "Programming & Problem Solving" },
];

const SAMPLE_MATCHES = [
  { name: "Jordan Lee",  course: "ECS 20 — Discrete Math",           overlap: "Mon 10am–12pm" },
  { name: "Sam Patel",   course: "MAT 21A — Calculus",               overlap: "Wed 2pm–4pm"   },
  { name: "Riley Chen",  course: "ECS 36A — Programming",            overlap: "Fri 11am–1pm"  },
];

// ─── Grid config ──────────────────────────────────────────────────────────────

const DAYS  = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 8 am → 8 pm

function formatHour(h: number) {
  if (h === 12) return "12pm";
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function ArrowLeftIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94AAA1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AggiematePage() {
  // Set of "Day-Hour" keys the user marked as free, e.g. "Mon-10"
  const [freeCells, setFreeCells] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode]   = useState<"add" | "remove">("add");
  const [showMatches, setShowMatches] = useState(false);

  function cellKey(day: string, hour: number) {
    return `${day}-${hour}`;
  }

  function toggleCell(day: string, hour: number, mode?: "add" | "remove") {
    const key = cellKey(day, hour);
    const m   = mode ?? (freeCells.has(key) ? "remove" : "add");
    setFreeCells((prev) => {
      const next = new Set(prev);
      m === "add" ? next.add(key) : next.delete(key);
      return next;
    });
    return m;
  }

  function handleMouseDown(day: string, hour: number) {
    const key = cellKey(day, hour);
    const mode = freeCells.has(key) ? "remove" : "add";
    setDragMode(mode);
    setIsDragging(true);
    toggleCell(day, hour, mode);
  }

  function handleMouseEnter(day: string, hour: number) {
    if (isDragging) toggleCell(day, hour, dragMode);
  }

  function handleMouseUp() {
    setIsDragging(false);
  }

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className="min-h-screen flex flex-col bg-[#F4F2E8] select-none"
      onMouseUp={handleMouseUp}
    >
      {/* ── Navbar ── */}
      <nav className="bg-[#B4E1FF] px-8 py-1.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <Image src="/logo2.png" alt="Student Life Helper" width={100} height={100} className="object-contain" />
          <span className="text-[#241715] text-[30px] font-medium tracking-wide">Student Life Helper</span>
        </div>
        <Link href="/dashboard" className="flex items-center gap-1.5 text-[#2C1A1D] text-[13px] hover:text-[#2C1A1D]/70 transition-colors">
          <ArrowLeftIcon />
          Return to home page
        </Link>
      </nav>

      {/* ── Main grid ── */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 px-8 py-8 max-w-6xl mx-auto w-full">

        {/* ── Left column ── */}
        <div className="flex flex-col gap-5">

          {/* Your courses */}
          <div className="rounded-2xl border border-[#B3C1BB]/40 bg-white/70 overflow-hidden">
            <div className="px-5 pt-5 pb-3">
              <p className="text-[15px] font-semibold text-[#1a1a1a]">Your courses</p>
              <p className="text-[12px] text-[#94AAA1] mt-0.5">Enrolled this quarter</p>
            </div>

            <div className="border-t border-[#B3C1BB]/30 px-5 py-3 flex flex-col gap-2">
              {MY_COURSES.map((c) => (
                <div key={c.code} className="flex items-center gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#6A9879] shrink-0" />
                  <span className="text-[13px] text-[#1a1a1a]">
                    <span className="font-medium">{c.code}</span> — {c.name}
                  </span>
                </div>
              ))}
            </div>

            {/* Look up a friend */}
            <div className="border-t border-[#B3C1BB]/30 px-5 py-4">
              <p className="text-[12px] font-medium text-[#5a6872] mb-2">Look up a friend</p>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2">
                  <SearchIcon />
                </span>
                <input
                  type="text"
                  placeholder="Search by name or UC Davis email…"
                  className="w-full pl-8 pr-3 py-2 text-[13px] rounded-lg border border-[#B3C1BB]/50 bg-[#F8F8F6] placeholder:text-[#B3C1BB] focus:outline-none focus:border-[#1B3968] focus:ring-1 focus:ring-[#1B3968]/10"
                />
              </div>
            </div>
          </div>

          {/* Your availability */}
          <div className="rounded-2xl border border-[#B3C1BB]/40 bg-white/70 overflow-hidden flex flex-col">
            <div className="px-5 pt-5 pb-3">
              <p className="text-[15px] font-semibold text-[#1a1a1a]">Your availability</p>
              <p className="text-[12px] text-[#94AAA1] mt-0.5">
                Click or drag blocks to mark when you are free
              </p>
            </div>

            {/* Weekly grid */}
            <div className="px-4 pb-4 overflow-x-auto">
              <div
                className="grid"
                style={{ gridTemplateColumns: "40px repeat(5, 1fr)" }}
              >
                {/* Header row */}
                <div />
                {DAYS.map((d) => (
                  <div key={d} className="text-center text-[11px] font-semibold text-[#5a6872] pb-1">
                    {d}
                  </div>
                ))}

                {/* Hour rows */}
                {HOURS.map((hour) => (
                  <Fragment key={hour}>
                    {/* Time label */}
                    <div
                      key={`label-${hour}`}
                      className="text-[10px] text-[#94AAA1] pr-1 pt-0.5 text-right leading-none"
                      style={{ gridColumn: 1 }}
                    >
                      {formatHour(hour)}
                    </div>

                    {/* Day cells */}
                    {DAYS.map((day) => {
                      const key  = cellKey(day, hour);
                      const free = freeCells.has(key);
                      return (
                        <div
                          key={key}
                          onMouseDown={() => handleMouseDown(day, hour)}
                          onMouseEnter={() => handleMouseEnter(day, hour)}
                          className={`
                            border border-[#E4E8DC] cursor-pointer transition-colors duration-75
                            h-6
                            ${free
                              ? "bg-[#6A9879] border-[#487A62]"
                              : "bg-[#F8F8F6] hover:bg-[#E4E8DC]"}
                          `}
                        />
                      );
                    })}
                  </Fragment>
                ))}
              </div>

              <div className="flex items-center gap-4 mt-3 px-1">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm bg-[#6A9879]" />
                  <span className="text-[11px] text-[#5a6872]">Free</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm bg-[#F8F8F6] border border-[#B3C1BB]/50" />
                  <span className="text-[11px] text-[#5a6872]">Busy</span>
                </div>
              </div>
            </div>

            {/* Find study partners button */}
            <div className="px-5 pb-5 mt-auto">
              <button
                onClick={() => setShowMatches(true)}
                className="w-full py-2.5 rounded-xl border border-[#B3C1BB]/60 bg-white text-[14px] font-medium text-[#1a1a1a] hover:bg-[#1B3968] hover:text-white hover:border-[#1B3968] transition-all duration-200"
              >
                Find study partners
              </button>
            </div>
          </div>
        </div>

        {/* ── Right column: Matches ── */}
        <div className="rounded-2xl border border-[#B3C1BB]/40 bg-white/70 overflow-hidden flex flex-col">
          <div className="px-5 pt-5 pb-4 flex items-center justify-between border-b border-[#B3C1BB]/30">
            <p className="text-[15px] font-semibold text-[#1a1a1a]">Matches</p>
            <span className="text-[13px] font-medium text-[#5a6872]">
              {showMatches ? `${SAMPLE_MATCHES.length} matches found` : "—"}
            </span>
          </div>

          <div className="flex-1 px-5 py-4 flex flex-col gap-3">
            {!showMatches ? (
              <div className="flex-1 flex flex-col items-center justify-center py-16 gap-2">
                <p className="text-[13px] text-[#B3C1BB] text-center max-w-[200px] leading-relaxed">
                  Mark your availability and click <span className="font-medium text-[#5a6872]">Find study partners</span> to see matches
                </p>
              </div>
            ) : (
              SAMPLE_MATCHES.map((match) => (
                <div
                  key={match.name}
                  className="rounded-xl border border-[#B3C1BB]/40 bg-[#F8F8F6] px-4 py-4 flex flex-col gap-1.5"
                >
                  <p className="text-[14px] font-semibold text-[#1a1a1a]">{match.name}</p>
                  <p className="text-[13px] text-[#5a6872]">{match.course}</p>
                  <p className="text-[12px] text-[#6A9879] font-medium">{match.overlap}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
