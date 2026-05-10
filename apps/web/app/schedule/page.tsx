"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// ─── Types ────────────────────────────────────────────────────────────────────

type CalEvent = {
  id: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?:   { dateTime?: string; date?: string };
  location?: string;
};

type Course = {
  courseCode: string;
  title: string;
  units: number | null;
  grade: string | null;
  quarter: string | null;
};

// ─── Week helpers ─────────────────────────────────────────────────────────────

function quarterKey(q: string | null): number {
  if (!q) return -1;
  const m = q.toLowerCase().match(/(fall|summer|spring|winter)\s+(\d{4})/);
  if (!m) return -1;
  const season = { spring: 3, winter: 2, fall: 1, summer: 0 }[m[1]] ?? 0;
  return parseInt(m[2]) * 4 + season;
}

function getMondayOfWeek(offset = 0): Date {
  const today = new Date();
  const day = today.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diff + offset * 7);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function getWeekDates(offset = 0): Date[] {
  const monday = getMondayOfWeek(offset);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function eventsForDate(events: CalEvent[], date: Date): CalEvent[] {
  return events.filter((ev) => {
    const raw = ev.start?.dateTime ?? ev.start?.date;
    if (!raw) return false;
    return isSameDay(new Date(raw), date);
  }).sort((a, b) => {
    const ta = new Date(a.start?.dateTime ?? a.start?.date ?? 0).getTime();
    const tb = new Date(b.start?.dateTime ?? b.start?.date ?? 0).getTime();
    return ta - tb;
  });
}

function shortTime(ev: CalEvent): string {
  const raw = ev.start?.dateTime;
  if (!raw) return "All day";
  return new Date(raw).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
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

function CalendarIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#94AAA1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94AAA1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94AAA1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6A9879" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}


// ─── Panel shell ──────────────────────────────────────────────────────────────

function Panel({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="text-[13px] font-semibold text-[#1a1a1a] mb-2">{label}</p>
      <div className="rounded-2xl border border-[#B3C1BB]/40 bg-[#F8F8F6] p-4 h-full">
        {children}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SchedulePlannerPage() {
  const searchParams = useSearchParams();
  const router       = useRouter();

  const [connected,   setConnected]   = useState(false);
  const [events,      setEvents]      = useState<CalEvent[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [weekOffset,  setWeekOffset]  = useState(0);
  const [courses,         setCourses]         = useState<Course[]>([]);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [transcriptError,   setTranscriptError]   = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleTranscriptUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setTranscriptLoading(true);
    setTranscriptError(null);
    try {
      const form = new FormData();
      form.append("transcript", file);
      const res = await fetch(`${API}/api/transcript/upload`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) { setTranscriptError(data.error ?? "Upload failed."); return; }
      setCourses(data.courses ?? []);
    } catch {
      setTranscriptError("Could not reach the server.");
    } finally {
      setTranscriptLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // Fetch calendar events from the backend
  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/calendar/events`, {
        credentials: "include",   // send the g_access cookie
      });
      if (res.status === 401) {
        setConnected(false);
        return;
      }
      if (!res.ok) throw new Error("fetch_failed");
      const data = await res.json();
      setEvents(data.events ?? []);
      setConnected(true);
    } catch {
      setError("Could not load calendar events. Try reconnecting.");
    } finally {
      setLoading(false);
    }
  }, []);

  // On mount: handle redirect from Google OAuth
  useEffect(() => {
    const conn = searchParams.get("connected");
    const err  = searchParams.get("error");

    if (conn === "true") {
      // Clean URL then load events
      router.replace("/schedule");
      fetchEvents();
    } else if (err) {
      setError(
        err === "oauth_failed"
          ? "Google sign-in failed. Please try again."
          : "Something went wrong. Please try again."
      );
      router.replace("/schedule");
    } else {
      // Check if already connected (cookie may still be valid)
      fetchEvents();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDisconnect() {
    await fetch(`${API}/api/calendar/disconnect`, { method: "POST", credentials: "include" });
    setConnected(false);
    setEvents([]);
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F2E8]">

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
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 px-8 py-8 max-w-7xl mx-auto w-full">

        {/* ── Left column ── */}
        <div className="flex flex-col gap-6">

          {/* Google Calendar panel */}
          <Panel label="Your Google Calendar" className="flex flex-col flex-1">
            {!connected ? (
              /* ── Not connected ── */
              <div className="rounded-xl border border-dashed border-[#B3C1BB]/70 bg-white/60 flex flex-col items-center justify-center gap-3 py-16 min-h-[260px]">
                <CalendarIcon size={24} />
                <p className="text-[14px] font-medium text-[#5a6872]">Google Calendar</p>
                <p className="text-[12px] text-[#B3C1BB] text-center max-w-[220px] leading-relaxed">
                  Connect your Google Calendar to see upcoming events and let the AI build your study schedule.
                </p>
                {error && (
                  <p className="text-[12px] text-red-400 text-center max-w-[240px]">{error}</p>
                )}
                <a
                  href={`${API}/auth/google/calendar/init`}
                  className="mt-1 flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white border border-[#B3C1BB]/50 text-[13px] font-medium text-[#1a1a1a] hover:border-[#1B3968] hover:shadow-sm transition-all"
                >
                  <GoogleIcon />
                  Connect Google Calendar
                </a>
              </div>
            ) : (
              /* ── Connected: show events ── */
              <div className="flex flex-col gap-3 min-h-[260px]">
                {/* Status bar */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <CheckIcon />
                    <span className="text-[12px] text-[#6A9879] font-medium">Google Calendar connected</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={fetchEvents}
                      disabled={loading}
                      className="text-[11px] text-[#94AAA1] hover:text-[#1B3968] transition-colors"
                    >
                      {loading ? "Refreshing…" : "Refresh"}
                    </button>
                    <button
                      onClick={handleDisconnect}
                      className="text-[11px] text-[#94AAA1] hover:text-red-400 transition-colors"
                    >
                      Disconnect
                    </button>
                  </div>
                </div>

                {/* Week navigation */}
                {(() => {
                  const weekDates = getWeekDates(weekOffset);
                  const today = new Date();
                  const rangeLabel = `${weekDates[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${weekDates[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
                  return (
                    <>
                      <div className="flex items-center justify-between mb-3">
                        <button onClick={() => setWeekOffset((o) => o - 1)} className="text-[11px] px-2 py-1 rounded border border-[#B3C1BB]/40 text-[#5a6872] hover:border-[#1B3968] transition-colors">← Prev</button>
                        <span className="text-[12px] font-medium text-[#5a6872]">{rangeLabel}</span>
                        <button onClick={() => setWeekOffset((o) => o + 1)} className="text-[11px] px-2 py-1 rounded border border-[#B3C1BB]/40 text-[#5a6872] hover:border-[#1B3968] transition-colors">Next →</button>
                      </div>

                      {loading ? (
                        <div className="flex items-center justify-center py-10">
                          <p className="text-[13px] text-[#B3C1BB] animate-pulse">Loading events…</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-7 gap-1.5 overflow-y-auto max-h-80">
                          {/* Day headers */}
                          {weekDates.map((date) => {
                            const isToday = isSameDay(date, today);
                            return (
                              <div key={date.toISOString()} className={`text-center pb-1.5 border-b ${isToday ? "border-[#1B3968]" : "border-[#B3C1BB]/30"}`}>
                                <p className={`text-[10px] font-semibold uppercase tracking-wide ${isToday ? "text-[#1B3968]" : "text-[#94AAA1]"}`}>
                                  {date.toLocaleDateString("en-US", { weekday: "short" })}
                                </p>
                                <p className={`text-[13px] font-bold ${isToday ? "text-[#1B3968]" : "text-[#1a1a1a]"}`}>
                                  {date.getDate()}
                                </p>
                              </div>
                            );
                          })}

                          {/* Event columns */}
                          {weekDates.map((date) => {
                            const dayEvs = eventsForDate(events, date);
                            return (
                              <div key={date.toISOString()} className="flex flex-col gap-1 pt-1.5 min-h-[120px]">
                                {dayEvs.length === 0 ? (
                                  <p className="text-[10px] text-[#B3C1BB] text-center mt-2">—</p>
                                ) : (
                                  dayEvs.map((ev) => (
                                    <div key={ev.id} className="rounded px-1.5 py-1 bg-[#1B3968]/8 border border-[#1B3968]/15 group">
                                      <p className="text-[10px] font-medium text-[#1B3968] leading-tight line-clamp-2">
                                        {ev.summary ?? "(No title)"}
                                      </p>
                                      <p className="text-[9px] text-[#94AAA1] mt-0.5">{shortTime(ev)}</p>
                                    </div>
                                  ))
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </Panel>

          {/* Suggested study schedule */}
          <Panel label="Your suggested study schedule" className="flex flex-col flex-1">
            <div className="rounded-xl border border-dashed border-[#B3C1BB]/70 bg-white/60 flex flex-col items-center justify-center gap-3 py-16 min-h-[220px]">
              <ClockIcon />
              <p className="text-[14px] font-medium text-[#94AAA1]">Study Schedule</p>
              <p className="text-[12px] text-[#B3C1BB] text-center max-w-[220px] leading-relaxed">
                {connected
                  ? "Your AI-generated study schedule will appear here based on your calendar and courses."
                  : "Connect Google Calendar first to generate a personalized study schedule."}
              </p>
            </div>
          </Panel>
        </div>

        {/* ── Right column ── */}
        <div className="flex flex-col gap-5">

          <Panel label="Courses taken" className="flex flex-col">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handleTranscriptUpload}
            />
            {courses.length === 0 ? (
              <div className="min-h-[110px] flex flex-col items-center justify-center gap-2">
                {transcriptLoading ? (
                  <p className="text-[12px] text-[#94AAA1] animate-pulse">Reading transcript…</p>
                ) : (
                  <>
                    <p className="text-[12px] text-[#B3C1BB]">No courses added yet</p>
                    {transcriptError && (
                      <p className="text-[11px] text-red-400 text-center px-2">{transcriptError}</p>
                    )}
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="mt-1 px-3 py-1.5 rounded-lg border border-[#B3C1BB]/50 text-[12px] text-[#5a6872] hover:border-[#1B3968] hover:text-[#1B3968] transition-colors"
                    >
                      Upload transcript PDF
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[11px] text-[#94AAA1]">{courses.length} course{courses.length !== 1 ? "s" : ""} found</p>
                  <button
                    onClick={() => { setCourses([]); setTranscriptError(null); }}
                    className="text-[11px] text-[#94AAA1] hover:text-red-400 transition-colors"
                  >
                    Clear
                  </button>
                </div>
                <div className="overflow-y-auto max-h-52 flex flex-col gap-1">
                  {[...courses].sort((a, b) => quarterKey(b.quarter) - quarterKey(a.quarter)).map((c, i) => (
                    <div key={i} className="flex items-center justify-between px-2.5 py-2 rounded-lg bg-white/70 border border-[#B3C1BB]/30">
                      <div className="min-w-0">
                        <p className="text-[12px] font-bold text-[#1B3968]">{c.courseCode}</p>
                        <p className="text-[11px] text-[#1a1a1a] truncate">{c.title}</p>
                        <p className="text-[10px] text-[#94AAA1]">{c.quarter ?? "—"}</p>
                      </div>
                      {c.grade && (
                        <span className="text-[11px] font-bold text-[#487A62] shrink-0 ml-2">{c.grade}</span>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-1 text-[11px] text-[#94AAA1] hover:text-[#1B3968] transition-colors self-start"
                >
                  {transcriptLoading ? "Reading…" : "Re-upload"}
                </button>
              </div>
            )}
          </Panel>

          <Panel label="Courses still needed" className="flex flex-col">
            <div className="min-h-[110px] flex items-center justify-center">
              <p className="text-[12px] text-[#B3C1BB]">Upload your transcript to see pending courses</p>
            </div>
          </Panel>

          <Panel label="Next quarter suggestions" className="flex flex-col">
            <div className="min-h-[140px] flex flex-col gap-2 pt-1">
              {["Major requirements", "General education requirements"].map((item) => (
                <div key={item} className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-white/70 border border-[#B3C1BB]/30">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#6A9879] shrink-0" />
                  <span className="text-[13px] text-[#1a1a1a]">{item}</span>
                </div>
              ))}
              <p className="text-[11px] text-[#B3C1BB] mt-1 px-1">Suggestions refine once your transcript is uploaded.</p>
            </div>
          </Panel>

          <Panel label="AI Advisor" className="flex flex-col flex-1">
            <div className="min-h-[120px] flex flex-col items-center justify-center gap-3">
              <SparkleIcon />
              <p className="text-[12px] text-[#B3C1BB] text-center max-w-[180px] leading-relaxed">
                Ask the AI advisor anything about your schedule or courses
              </p>
              <div className="w-full flex gap-2 mt-1">
                <input
                  type="text"
                  placeholder="Ask a question…"
                  className="flex-1 text-[12px] px-3 py-2 rounded-lg border border-[#B3C1BB]/50 bg-white/80 placeholder:text-[#B3C1BB] focus:outline-none focus:border-[#1B3968] focus:ring-1 focus:ring-[#1B3968]/10"
                />
                <button className="px-3 py-2 rounded-lg bg-[#1B3968] text-white text-[12px] font-medium hover:opacity-90 transition-opacity">
                  Ask
                </button>
              </div>
            </div>
          </Panel>
        </div>
      </main>
    </div>
  );
}
