"use client";

import { useEffect, useState, Fragment } from "react";
import Link from "next/link";
import Image from "next/image";

const API = "/api/proxy";

type TranscriptCourse = {
  courseCode: string;
  title: string;
  units: number | null;
  grade: string | null;
  quarter: string | null;
};

type StudyMatch = {
  userId: string;
  name: string;
  email: string;
  commonCourses: Array<{ courseCode: string; title: string }>;
  commonFreeTimes: string[];
};

type SavedTranscriptResponse = {
  courses?: TranscriptCourse[];
};

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
  const [currentCourses, setCurrentCourses] = useState<TranscriptCourse[]>([]);
  const [freeCells, setFreeCells] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode]   = useState<"add" | "remove">("add");
  const [showMatches, setShowMatches] = useState(false);
  const [matches, setMatches] = useState<StudyMatch[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [matchesError, setMatchesError] = useState<string | null>(null);
  const [matchedUserIds, setMatchedUserIds] = useState<Set<string>>(new Set());
  const [friendQuery, setFriendQuery] = useState("");
  const [friendResults, setFriendResults] = useState<StudyMatch[]>([]);
  const [friendSearchLoading, setFriendSearchLoading] = useState(false);
  const [friendSearchError, setFriendSearchError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function syncCurrentCourses() {
      try {
        const res = await fetch(`${API}/api/transcript/me`);
        if (!res.ok) {
          if (!cancelled) setCurrentCourses([]);
          return;
        }
        const data = await res.json() as SavedTranscriptResponse;
        const courses = Array.isArray(data.courses) ? data.courses : [];
        if (!cancelled) {
          setCurrentCourses(courses.filter((course) => course.grade === "IP"));
        }
      } catch {
        if (!cancelled) setCurrentCourses([]);
      }
    }

    syncCurrentCourses();
    window.addEventListener("focus", syncCurrentCourses);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", syncCurrentCourses);
    };
  }, []);

  useEffect(() => {
    const query = friendQuery.trim();
    if (query.length < 2) {
      setFriendResults([]);
      setFriendSearchError(null);
      setFriendSearchLoading(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setFriendSearchLoading(true);
      setFriendSearchError(null);
      try {
        const res = await fetch(`${API}/api/aggie-mate/search`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query,
            freeCells: Array.from(freeCells),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Could not search for this friend.");
        if (!cancelled) setFriendResults(Array.isArray(data.results) ? data.results : []);
      } catch (err) {
        if (!cancelled) {
          setFriendResults([]);
          setFriendSearchError(err instanceof Error ? err.message : "Could not search for this friend.");
        }
      } finally {
        if (!cancelled) setFriendSearchLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [friendQuery, freeCells]);

  function cellKey(day: string, hour: number) {
    return `${day}-${hour}`;
  }

  function toggleCell(day: string, hour: number, mode?: "add" | "remove") {
    const key = cellKey(day, hour);
    const m   = mode ?? (freeCells.has(key) ? "remove" : "add");
    setFreeCells((prev) => {
      const next = new Set(prev);
      if (m === "add") next.add(key);
      else next.delete(key);
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

  async function handleFindStudyPartners() {
    setShowMatches(true);
    setMatchesError(null);

    if (currentCourses.length === 0) {
      setMatches([]);
      setMatchesError("Sync your in-progress courses from Schedule Planner first.");
      return;
    }
    if (freeCells.size === 0) {
      setMatches([]);
      setMatchesError("Mark at least one free time block first.");
      return;
    }

    setMatchesLoading(true);
    try {
      const res = await fetch(`${API}/api/aggie-mate/matches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courses: currentCourses,
          freeCells: Array.from(freeCells),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to find study partners.");
      setMatches(Array.isArray(data.matches) ? data.matches : []);
    } catch (err) {
      setMatches([]);
      setMatchesError(err instanceof Error ? err.message : "Failed to find study partners.");
    } finally {
      setMatchesLoading(false);
    }
  }

  async function handleMatch(userId: string) {
    setMatchesError(null);
    setFriendSearchError(null);
    try {
      const res = await fetch(`${API}/api/aggie-mate/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiverId: userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not match with this student.");
      setMatchedUserIds((current) => new Set(current).add(userId));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not match with this student.";
      setMatchesError(message);
      setFriendSearchError(message);
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col bg-[#F4F2E8] select-none"
      onMouseUp={handleMouseUp}
    >
      {/* ── Navbar ── */}
      <nav className="bg-[#1B3968] px-8 py-1.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Image src="/logo2.png" alt="AGGIE PLANNER" width={70} height={70} className="object-contain" />
          <span className="text-white text-[30px] font-medium tracking-wide">AGGIE PLANNER</span>
        </div>
        <Link href="/dashboard" className="flex items-center gap-1.5 text-white/85 text-[13px] hover:text-white transition-colors">
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
              {currentCourses.length === 0 ? (
                <p className="text-[12px] text-[#B3C1BB] py-2">
                  Upload your transcript in Schedule Planner to sync in-progress courses.
                </p>
              ) : (
                currentCourses.map((c) => (
                  <div key={`${c.courseCode}-${c.quarter ?? "current"}`} className="flex items-center gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#6A9879] shrink-0" />
                    <span className="text-[13px] text-[#1a1a1a]">
                      <span className="font-medium">{c.courseCode}</span> — {c.title}
                    </span>
                  </div>
                ))
              )}
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
                  value={friendQuery}
                  onChange={(event) => setFriendQuery(event.target.value)}
                  placeholder="Search by name or UC Davis email..."
                  className="w-full pl-8 pr-3 py-2 text-[13px] rounded-lg border border-[#B3C1BB]/50 bg-[#F8F8F6] placeholder:text-[#B3C1BB] focus:outline-none focus:border-[#1B3968] focus:ring-1 focus:ring-[#1B3968]/10"
                />
              </div>
              <div className="mt-3 flex flex-col gap-2">
                {friendSearchError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                    <p className="text-[12px] text-red-500">{friendSearchError}</p>
                  </div>
                )}
                {friendSearchLoading ? (
                  <p className="text-[12px] text-[#94AAA1]">Searching...</p>
                ) : friendQuery.trim().length >= 2 && friendResults.length === 0 && !friendSearchError ? (
                  <p className="text-[12px] text-[#B3C1BB] leading-relaxed">
                    No user found for that name or email.
                  </p>
                ) : (
                  friendResults.map((friend) => (
                    <div
                      key={friend.userId}
                      className="rounded-xl border border-[#B3C1BB]/40 bg-[#F8F8F6] px-3 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-[#1a1a1a] truncate">{friend.name}</p>
                          <p className="text-[11px] text-[#94AAA1] truncate">{friend.email}</p>
                        </div>
                        <button
                          onClick={() => handleMatch(friend.userId)}
                          disabled={matchedUserIds.has(friend.userId)}
                          className={`shrink-0 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                            matchedUserIds.has(friend.userId)
                              ? "bg-[#6A9879]/15 text-[#487A62]"
                              : "bg-white border border-[#B3C1BB]/60 text-[#1a1a1a] hover:bg-[#1B3968] hover:text-white hover:border-[#1B3968]"
                          }`}
                        >
                          {matchedUserIds.has(friend.userId) ? "Matched" : "Match"}
                        </button>
                      </div>
                      <p className="mt-2 text-[12px] text-[#5a6872]">
                        {friend.commonCourses.length > 0
                          ? `Shared class: ${friend.commonCourses.map((course) => `${course.courseCode} - ${course.title}`).join(", ")}`
                          : "No shared current classes found."}
                      </p>
                      <p className="mt-1 text-[11px] text-[#6A9879] font-medium">
                        {friend.commonFreeTimes.length > 0
                          ? `Free together: ${friend.commonFreeTimes.slice(0, 3).join(", ")}${friend.commonFreeTimes.length > 3 ? ` +${friend.commonFreeTimes.length - 3} more` : ""}`
                          : "Mark availability to compare free time."}
                      </p>
                    </div>
                  ))
                )}
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
                onClick={handleFindStudyPartners}
                disabled={matchesLoading}
                className="w-full py-2.5 rounded-xl border border-[#B3C1BB]/60 bg-white text-[14px] font-medium text-[#1a1a1a] hover:bg-[#1B3968] hover:text-white hover:border-[#1B3968] transition-all duration-200"
              >
                {matchesLoading ? "Finding partners..." : "Find study partners"}
              </button>
            </div>
          </div>
        </div>

        {/* ── Right column: Matches ── */}
        <div className="rounded-2xl border border-[#B3C1BB]/40 bg-white/70 overflow-hidden flex flex-col">
          <div className="px-5 pt-5 pb-4 flex items-center justify-between border-b border-[#B3C1BB]/30">
            <p className="text-[15px] font-semibold text-[#1a1a1a]">Matches</p>
            <span className="text-[13px] font-medium text-[#5a6872]">
              {showMatches ? `${matches.length} match${matches.length !== 1 ? "es" : ""} found` : "—"}
            </span>
          </div>

          <div className="flex-1 px-5 py-4 flex flex-col gap-3">
            {matchesError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <p className="text-[12px] text-red-500">{matchesError}</p>
              </div>
            )}
            {!showMatches ? (
              <div className="flex-1 flex flex-col items-center justify-center py-16 gap-2">
                <p className="text-[13px] text-[#B3C1BB] text-center max-w-[200px] leading-relaxed">
                  Mark your availability and click <span className="font-medium text-[#5a6872]">Find study partners</span> to see matches
                </p>
              </div>
            ) : matchesLoading ? (
              <div className="flex-1 flex items-center justify-center py-16">
                <p className="text-[13px] text-[#94AAA1] animate-pulse">Checking shared classes and free time...</p>
              </div>
            ) : matches.length === 0 ? (
              <div className="flex-1 flex items-center justify-center py-16">
                <p className="text-[13px] text-[#B3C1BB] text-center max-w-[220px] leading-relaxed">
                  No matching classmates yet. Try marking more free blocks or check back after classmates use Aggie Mate.
                </p>
              </div>
            ) : (
              matches.map((match) => (
                <div
                  key={match.userId}
                  className="rounded-xl border border-[#B3C1BB]/40 bg-[#F8F8F6] px-4 py-4 flex flex-col gap-1.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-[#1a1a1a]">{match.name}</p>
                      <p className="text-[12px] text-[#94AAA1] truncate">{match.email}</p>
                    </div>
                    <button
                      onClick={() => handleMatch(match.userId)}
                      disabled={matchedUserIds.has(match.userId)}
                      className={`shrink-0 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                        matchedUserIds.has(match.userId)
                          ? "bg-[#6A9879]/15 text-[#487A62]"
                          : "bg-white border border-[#B3C1BB]/60 text-[#1a1a1a] hover:bg-[#1B3968] hover:text-white hover:border-[#1B3968]"
                      }`}
                    >
                      {matchedUserIds.has(match.userId) ? "Matched" : "Match"}
                    </button>
                  </div>
                  <p className="text-[13px] text-[#5a6872]">
                    <span className="font-medium">Class in common:</span>{" "}
                    {match.commonCourses.map((course) => `${course.courseCode} — ${course.title}`).join(", ")}
                  </p>
                  <p className="text-[12px] text-[#6A9879] font-medium">
                    Free together: {match.commonFreeTimes.slice(0, 4).join(", ")}
                    {match.commonFreeTimes.length > 4 ? ` +${match.commonFreeTimes.length - 4} more` : ""}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
