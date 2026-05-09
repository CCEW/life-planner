"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// ─── Types ────────────────────────────────────────────────────────────────────

type CalEvent = {
  id: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?:   { dateTime?: string; date?: string };
  location?: string;
};

// ─── Icons ────────────────────────────────────────────────────────────────────

function BookIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A5BA9B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatEventTime(ev: CalEvent): string {
  const start = ev.start?.dateTime ?? ev.start?.date;
  const end   = ev.end?.dateTime   ?? ev.end?.date;
  if (!start) return "";

  const s = new Date(start);
  const e = end ? new Date(end) : null;

  const datePart = s.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  if (ev.start?.dateTime) {
    const timePart = s.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    const endPart  = e ? e.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";
    return `${datePart} · ${timePart}${endPart ? ` – ${endPart}` : ""}`;
  }
  return `${datePart} (all day)`;
}

// Group events by date label
function groupEventsByDay(events: CalEvent[]): Record<string, CalEvent[]> {
  return events.reduce<Record<string, CalEvent[]>>((acc, ev) => {
    const raw = ev.start?.dateTime ?? ev.start?.date ?? "";
    const label = raw
      ? new Date(raw).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
      : "Unknown date";
    (acc[label] ??= []).push(ev);
    return acc;
  }, {});
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

  const [connected, setConnected] = useState(false);
  const [events,    setEvents]    = useState<CalEvent[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);

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

  const grouped = groupEventsByDay(events);

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F2E8]">

      {/* ── Navbar ── */}
      <nav className="bg-[#1B3968] px-8 py-3.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-[#6A9879]/25 flex items-center justify-center">
            <BookIcon />
          </div>
          <span className="text-white text-sm font-medium tracking-wide">Student Life Helper</span>
        </div>
        <Link href="/dashboard" className="flex items-center gap-1.5 text-white/70 text-[13px] hover:text-white transition-colors">
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

                {/* Event list */}
                {loading ? (
                  <div className="flex items-center justify-center py-10">
                    <p className="text-[13px] text-[#B3C1BB] animate-pulse">Loading events…</p>
                  </div>
                ) : events.length === 0 ? (
                  <div className="flex items-center justify-center py-10">
                    <p className="text-[13px] text-[#B3C1BB]">No upcoming events in the next 30 days.</p>
                  </div>
                ) : (
                  <div className="overflow-y-auto max-h-72 flex flex-col gap-4 pr-1">
                    {Object.entries(grouped).map(([day, dayEvents]) => (
                      <div key={day}>
                        <p className="text-[11px] font-semibold text-[#94AAA1] uppercase tracking-wide mb-1.5">{day}</p>
                        <div className="flex flex-col gap-1.5">
                          {dayEvents.map((ev) => (
                            <div
                              key={ev.id}
                              className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-white/80 border border-[#B3C1BB]/30"
                            >
                              <div className="w-1.5 h-1.5 rounded-full bg-[#1B3968] mt-1.5 shrink-0" />
                              <div className="min-w-0">
                                <p className="text-[13px] font-medium text-[#1a1a1a] truncate">
                                  {ev.summary ?? "(No title)"}
                                </p>
                                <p className="text-[11px] text-[#94AAA1] mt-0.5">
                                  {formatEventTime(ev)}
                                </p>
                                {ev.location && (
                                  <p className="text-[11px] text-[#B3C1BB] mt-0.5 truncate">{ev.location}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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
            <div className="min-h-[110px] flex items-center justify-center">
              <p className="text-[12px] text-[#B3C1BB]">No courses added yet</p>
            </div>
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
