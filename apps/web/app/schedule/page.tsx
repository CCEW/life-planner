"use client";

import { Suspense, useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { chatWithAI } from "../../lib/api";

const API = "/api/proxy";

const TRANSCRIPT_COURSES_STORAGE_KEY = "life-planner:transcript-courses";

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
  geCategories: string[];
  writingCategories: string[];
};

type OfferedCourse = {
  id: string;
  termCode: string;
  courseCode: string;
  section: string | null;
  crn: string | null;
  title: string;
  unitsMin: number | null;
  unitsMax: number | null;
  unitsText: string | null;
  geCategories: string[];
  writingCategories: string[];
  instructors: string[];
  meetings: { time_days?: string }[];
  consentRequired: boolean | null;
  openSeats: number;
  waitlist: number;
};

type MajorRequirement = {
  id: string;
  name: string;
  groupLabel: string | null;
  subsection: string | null;
  met: boolean;
  progress: number;
  required: number;
  unitBased: boolean;
  completedCourseCodes: string[];
  candidateCourseCodes: string[];
  missingCourseCodes: string[];
  notes: string[];
};

type MajorAudit = {
  major: {
    id: string;
    code: string | null;
    name: string;
    degree: string | null;
    catalogYear: string | null;
  };
  summary: {
    met: number;
    total: number;
  };
  requirements: MajorRequirement[];
};

type AiMessage = {
  role: "user" | "assistant";
  content: string;
};

type CourseRecommendation = {
  courseId: string;
  courseCode: string;
  title: string;
  units: number;
  department: string;
  requirementNames: string[];
  availableThisQuarter: boolean;
  availableSeats?: number;
  score: number;
};

type AiChatResponse = {
  reply: string;
  recommendations?: {
    light: CourseRecommendation[];
    moderate: CourseRecommendation[];
    heavy: CourseRecommendation[];
  } | null;
  recommendationSource?: string;
  warning?: string | null;
};

type SavedTranscriptResponse = {
  courses?: Course[];
  major?: string | null;
  majorAudit?: MajorAudit | null;
};

// ─── GE / Writing requirement checker ────────────────────────────────────────

type ReqItem = { key: string; label: string; val: number; min: number; dividerBefore?: boolean };

function computeRequirements(courses: Course[]): ReqItem[] {
  const ge: Record<string, number> = {};
  const wr: Record<string, number> = {};
  for (const c of courses) {
    // Only count completed courses; skip in-progress, no-pass, and withdrawals
    if (!c.units || !c.grade || ["IP", "NP", "W"].includes(c.grade)) continue;
    for (const g of (c.geCategories ?? [])) ge[g] = (ge[g] ?? 0) + c.units;
    for (const w of (c.writingCategories ?? [])) wr[w] = (wr[w] ?? 0) + c.units;
  }
  const AH = ge["AH"] ?? 0;
  const SS = ge["SS"] ?? 0;
  const SE = ge["SE"] ?? 0;
  // Each category caps at 20 units toward the 52-unit total
  const cappedTotal = Math.min(AH, 20) + Math.min(SS, 20) + Math.min(SE, 20);
  const WE = wr["WE"] ?? 0;
  const OL = wr["OL"] ?? 0;
  return [
    // ── Topical Breadth ──────────────────────────────────────────────────────
    { key: "AH",    label: "Arts & Humanities (AH)",          val: AH,          min: 12 },
    { key: "SS",    label: "Social Sciences (SS)",             val: SS,          min: 12 },
    { key: "SE",    label: "Science & Engineering (SE)",       val: SE,          min: 12 },
    { key: "total", label: "Total Topical Breadth", val: cappedTotal, min: 52 },
    // ── Writing / Core Literacy ───────────────────────────────────────────────
    { key: "WE",    label: "Writing Experience (WE)",          val: WE,      min: 6,  dividerBefore: true },
    { key: "WE+OL", label: "WE + Oral Literacy",               val: WE + OL, min: 9  },
    { key: "VL",    label: "Visual Literacy (VL)",             val: wr["VL"]   ?? 0, min: 3 },
    { key: "ACGH",  label: "Am. Cultures, Gov & Hist (ACGH)",  val: wr["ACGH"] ?? 0, min: 3 },
    { key: "DD",    label: "Domestic Diversity (DD)",          val: wr["DD"]   ?? 0, min: 3 },
    { key: "WC",    label: "World Cultures (WC)",              val: wr["WC"]   ?? 0, min: 3 },
    { key: "QL",    label: "Quantitative Literacy (QL)",       val: wr["QL"]   ?? 0, min: 3 },
    { key: "SL",    label: "Scientific Literacy (SL)",         val: wr["SL"]   ?? 0, min: 3 },
  ];
}

type CourseSuggestion = OfferedCourse & {
  matchedRequirementLabels: string[];
  score: number;
};

type MajorCourseSuggestion = OfferedCourse & {
  matchedRequirementNames: string[];
  score: number;
};

type RequirementSuggestion = OfferedCourse & {
  matchedRequirementLabels?: string[];
  matchedRequirementNames?: string[];
  score: number;
};

type RequirementsTab = "ge" | "major";
type RequirementNeed = { source: "ge" | "writing"; category: string; label: string };

function normalizeCourseCode(code: string): string {
  const compact = code.replace(/\s+/g, "").toUpperCase();
  const match = compact.match(/^([A-Z]{2,4})0*(\d+)([A-Z].*)?$/);
  if (!match) return compact;
  return `${match[1]}${match[2]}${match[3] ?? ""}`;
}

function getCourseUnits(course: Pick<OfferedCourse, "unitsMin" | "unitsMax" | "unitsText">): string {
  if (course.unitsText) return course.unitsText.replace(/\.0$/, "");
  if (course.unitsMin && course.unitsMax && course.unitsMin !== course.unitsMax) {
    return `${course.unitsMin}-${course.unitsMax}`;
  }
  return course.unitsMin ? String(course.unitsMin) : "—";
}

function formatMeetings(meetings?: OfferedCourse["meetings"]): string {
  const times = (meetings ?? [])
    .map((meeting) => meeting.time_days)
    .filter((time): time is string => Boolean(time));
  return times.length > 0 ? times.join(" · ") : "Time TBA";
}

function hasProperMeetingTimes(meetings?: OfferedCourse["meetings"]): boolean {
  return (meetings ?? []).some((meeting) => {
    const timeDays = meeting.time_days?.trim() ?? "";
    return /\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}\s*(AM|PM)/i.test(timeDays);
  });
}

function recommendGeCourses(courses: Course[], offerings: OfferedCourse[], addedIds: Set<string>): CourseSuggestion[] {
  const reqs = computeRequirements(courses);
  const reqMap = Object.fromEntries(reqs.map((r) => [r.key, r]));
  const unmetReqs = reqs.filter((r) => r.val < r.min);
  const topicalKeys = ["AH", "SS", "SE"];
  const taken = new Set(courses.map((c) => normalizeCourseCode(c.courseCode)));

  const needs: RequirementNeed[] = unmetReqs.flatMap((req): RequirementNeed[] => {
    if (topicalKeys.includes(req.key)) {
      return [{ source: "ge" as const, category: req.key, label: req.label }];
    }
    if (req.key === "total") {
      return topicalKeys
        .filter((key) => (reqMap[key]?.val ?? 0) < 20)
        .map((key) => ({ source: "ge" as const, category: key, label: req.label }));
    }
    if (req.key === "WE+OL") {
      return ["WE", "OL"].map((category) => ({ source: "writing" as const, category, label: req.label }));
    }
    return [{ source: "writing" as const, category: req.key, label: req.label }];
  });

  if (needs.length === 0) return [];

  return offerings
    .filter((course) => (
      course.openSeats > 0 &&
      !course.consentRequired &&
      hasProperMeetingTimes(course.meetings) &&
      !addedIds.has(course.id) &&
      !taken.has(normalizeCourseCode(course.courseCode))
    ))
    .map((course) => {
      const matchedRequirementLabels = Array.from(new Set(
        needs
          .filter((need) => (
            need.source === "ge"
              ? course.geCategories.includes(need.category)
              : course.writingCategories.includes(need.category)
          ))
          .map((need) => need.label)
      ));

      return {
        ...course,
        matchedRequirementLabels,
        score: (matchedRequirementLabels.length * 100) + Math.min(course.openSeats, 40),
      };
    })
    .filter((course) => course.matchedRequirementLabels.length > 0)
    .sort((a, b) => b.score - a.score || b.openSeats - a.openSeats || a.courseCode.localeCompare(b.courseCode))
    .slice(0, 6);
}

function recommendMajorCourses(courses: Course[], offerings: OfferedCourse[], audit: MajorAudit | null, addedIds: Set<string>): MajorCourseSuggestion[] {
  if (!audit) return [];
  const taken = new Set(courses.map((c) => normalizeCourseCode(c.courseCode)));
  const unmetRequirements = audit.requirements.filter((requirement) => !requirement.met);
  const needsByCode = new Map<string, string[]>();

  for (const requirement of unmetRequirements) {
    for (const code of requirement.candidateCourseCodes) {
      const normalized = normalizeCourseCode(code);
      if (taken.has(normalized)) continue;
      needsByCode.set(normalized, [...(needsByCode.get(normalized) ?? []), requirement.name]);
    }
  }

  if (needsByCode.size === 0) return [];

  return offerings
    .filter((course) => (
      course.openSeats > 0 &&
      !course.consentRequired &&
      hasProperMeetingTimes(course.meetings) &&
      !addedIds.has(course.id) &&
      !taken.has(normalizeCourseCode(course.courseCode)) &&
      needsByCode.has(normalizeCourseCode(course.courseCode))
    ))
    .map((course) => {
      const matchedRequirementNames = Array.from(new Set(needsByCode.get(normalizeCourseCode(course.courseCode)) ?? []));
      return {
        ...course,
        matchedRequirementNames,
        score: (matchedRequirementNames.length * 100) + Math.min(course.openSeats, 40),
      };
    })
    .sort((a, b) => b.score - a.score || b.openSeats - a.openSeats || a.courseCode.localeCompare(b.courseCode))
    .slice(0, 6);
}

function suggestionMatches(course: RequirementSuggestion): string[] {
  return course.matchedRequirementNames ?? course.matchedRequirementLabels ?? [];
}

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

function formatEventTime(event: CalEvent): string {
  const start = event.start?.dateTime ?? event.start?.date;
  const end = event.end?.dateTime ?? event.end?.date;
  if (!start) return "";

  const startDate = new Date(start);
  const endDate = end ? new Date(end) : null;
  const datePart = startDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  if (!event.start?.dateTime) return `${datePart} (all day)`;

  const startTime = startDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const endTime = endDate ? endDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";
  return `${datePart} ${startTime}${endTime ? `-${endTime}` : ""}`;
}

function summarizeEventsForAI(events: CalEvent[]) {
  return events.slice(0, 12).map((event) => ({
    title: event.summary ?? "(No title)",
    time: formatEventTime(event),
    location: event.location,
  }));
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

function ExpandIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function renderMessageContent(content: string): React.ReactNode[] {
  return content.split(/(\*\*[^*]+\*\*)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index} className="font-semibold">{part.slice(2, -2)}</strong>;
    }
    return <span key={index}>{part}</span>;
  });
}

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

function SchedulePlannerContent() {
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
  const [geOfferings, setGeOfferings] = useState<OfferedCourse[]>([]);
  const [geOfferingsLoading, setGeOfferingsLoading] = useState(true);
  const [geOfferingsError, setGeOfferingsError] = useState<string | null>(null);
  const [plannedCourses, setPlannedCourses] = useState<OfferedCourse[]>([]);
  const [requirementsTab, setRequirementsTab] = useState<RequirementsTab>("ge");
  const [dismissedSuggestionIds, setDismissedSuggestionIds] = useState<Set<string>>(new Set());
  const [studentMajor, setStudentMajor] = useState<string | null>(null);
  const [majorAudit, setMajorAudit] = useState<MajorAudit | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([
    {
      role: "assistant",
      content: "Tell me what kind of quarter you want, and I can suggest classes using your course data and calendar context.",
    },
  ]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiExpanded, setAiExpanded] = useState(false);
  const [recommendationSource, setRecommendationSource] = useState<string | null>(null);
  const plannedCourseIds = useMemo(
    () => new Set(plannedCourses.map((course) => course.id)),
    [plannedCourses]
  );
  const geSuggestions = useMemo(
    () => recommendGeCourses(courses, geOfferings, plannedCourseIds),
    [courses, geOfferings, plannedCourseIds]
  );
  const majorSuggestions = useMemo(
    () => recommendMajorCourses(courses, geOfferings, majorAudit, plannedCourseIds),
    [courses, geOfferings, majorAudit, plannedCourseIds]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadSavedTranscript() {
      setTranscriptLoading(true);
      setTranscriptError(null);

      try {
        const res = await fetch(`${API}/api/transcript/me`, {
          credentials: "include",
        });

        if (res.status === 401) return;
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "transcript_fetch_failed");

        if (cancelled) return;

        const savedCourses = Array.isArray((data as SavedTranscriptResponse).courses)
          ? (data as SavedTranscriptResponse).courses!
          : [];

        if (savedCourses.length > 0) {
          setCourses(savedCourses);
          localStorage.setItem(TRANSCRIPT_COURSES_STORAGE_KEY, JSON.stringify(savedCourses));
        } else {
          setCourses([]);
          setStudentMajor(null);
          setMajorAudit(null);
          localStorage.removeItem(TRANSCRIPT_COURSES_STORAGE_KEY);
        }

        setStudentMajor(data.major ?? data.majorAudit?.major?.name ?? null);
        setMajorAudit(data.majorAudit ?? null);
      } catch {
        if (!cancelled) {
          setTranscriptError("Could not load saved transcript.");
        }
      } finally {
        if (!cancelled) setTranscriptLoading(false);
      }
    }

    loadSavedTranscript();

    return () => {
      cancelled = true;
    };
  }, []);

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
      localStorage.setItem(TRANSCRIPT_COURSES_STORAGE_KEY, JSON.stringify(data.courses ?? []));
      setStudentMajor(data.major ?? data.majorAudit?.major?.name ?? null);
      setMajorAudit(data.majorAudit ?? null);
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
        setEvents([]);
        setError("Google Calendar needs to be reconnected.");
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
    const timers: ReturnType<typeof setTimeout>[] = [];
    const scheduleFetchEvents = () => {
      timers.push(setTimeout(() => {
        fetchEvents();
      }, 0));
    };
    const scheduleError = (message: string) => {
      timers.push(setTimeout(() => {
        setError(message);
      }, 0));
    };

    if (conn === "true") {
      // Clean URL then load events
      router.replace("/schedule");
      scheduleFetchEvents();
    } else if (err) {
      scheduleError(
        err === "oauth_failed"
          ? "Google sign-in failed. Please try again."
          : "Something went wrong. Please try again."
      );
      router.replace("/schedule");
    } else {
      // Check if already connected (cookie may still be valid)
      scheduleFetchEvents();
    }

    return () => {
      timers.forEach(clearTimeout);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    async function loadGeOfferings() {
      setGeOfferingsLoading(true);
      setGeOfferingsError(null);
      try {
        const res = await fetch(`${API}/api/courses/offered?termCode=202610&scope=all`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error("ge_offerings_failed");
        const data = await res.json();
        setGeOfferings(Array.isArray(data.courses) ? data.courses : []);
      } catch {
        setGeOfferingsError("Could not load next-quarter GE offerings.");
      } finally {
        setGeOfferingsLoading(false);
      }
    }

    loadGeOfferings();
  }, []);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [aiMessages, aiLoading]);

  useEffect(() => {
    if (!aiExpanded) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [aiExpanded]);

  async function sendAiMessage(prompt?: string) {
    const content = (prompt ?? aiInput).trim();
    if (!content || aiLoading) return;

    const userMessage: AiMessage = { role: "user", content };
    const history = aiMessages.slice(1);

    setAiMessages((prev) => [...prev, userMessage]);
    setAiInput("");
    setAiError(null);
    setAiLoading(true);

    try {
      const { data } = await chatWithAI(content, history, {
        targetQuarter: "Fall 2026",
        scheduleContext: {
          calendarConnected: connected,
          events: summarizeEventsForAI(events),
        },
      });
      const response = data as AiChatResponse;

      setAiMessages((prev) => [...prev, { role: "assistant", content: response.reply }]);
      setRecommendationSource(response.recommendationSource ?? null);
      setAiError(response.warning ?? null);
    } catch (err: any) {
      const message =
        err?.response?.data?.message ??
        "The AI advisor could not respond. Make sure you are signed in and the API is running.";
      setAiError(message);
      setAiMessages((prev) => [...prev, { role: "assistant", content: message }]);
    } finally {
      setAiLoading(false);
    }
  }

  function handleAddPlannedCourse(course: OfferedCourse) {
    setPlannedCourses((current) => (
      current.some((item) => item.id === course.id) ? current : [...current, course]
    ));
  }

  function handleRemovePlannedCourse(courseId: string) {
    setPlannedCourses((current) => current.filter((course) => course.id !== courseId));
  }

  async function handleDisconnect() {
    await fetch(`${API}/api/calendar/disconnect`, { method: "POST", credentials: "include" });
    setConnected(false);
    setEvents([]);
  }

  const showingMajorSuggestions = requirementsTab === "major";
  const requirementSuggestions: RequirementSuggestion[] = showingMajorSuggestions ? majorSuggestions : geSuggestions;
  const visibleSuggestions = requirementSuggestions.filter((c) => !dismissedSuggestionIds.has(c.id)).slice(0, 3);
  const hiddenCount = requirementSuggestions.filter((c) => !dismissedSuggestionIds.has(c.id)).length - visibleSuggestions.length;

  function renderAiAdvisor(isExpanded: boolean) {
    return (
      <div className={`${isExpanded ? "h-full min-h-0" : "min-h-[300px]"} flex flex-col gap-3`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <SparkleIcon />
            <p className="text-[12px] text-[#5a6872] leading-relaxed">
              Ask about next-quarter classes, workload, or schedule fit.
            </p>
          </div>
          {!isExpanded && (
            <button
              type="button"
              onClick={() => setAiExpanded(true)}
              aria-label="Expand AI advisor"
              className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#B3C1BB]/45 bg-white/80 text-[#5a6872] hover:border-[#1B3968]/50 hover:text-[#1B3968] transition-colors"
            >
              <ExpandIcon />
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {["Recommend 3 classes for next quarter", "Make this a lighter quarter", "What should I take with my calendar?"].map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => sendAiMessage(prompt)}
              disabled={aiLoading}
              className="text-[11px] px-2.5 py-1.5 rounded-lg border border-[#B3C1BB]/40 bg-white/70 text-[#5a6872] hover:border-[#1B3968]/40 disabled:opacity-50 transition-colors"
            >
              {prompt}
            </button>
          ))}
        </div>

        <div className={`${isExpanded ? "flex-1 min-h-0" : "flex-1 min-h-[150px] max-h-[260px]"} overflow-y-auto rounded-lg bg-white/65 border border-[#B3C1BB]/30 p-3 space-y-2`}>
          {aiMessages.map((message, index) => (
            <div key={`${message.role}-${index}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[88%] rounded-lg px-3 py-2 text-[12px] leading-relaxed whitespace-pre-wrap ${
                  message.role === "user" ? "bg-[#1B3968] text-white" : "bg-[#F8F8F6] border border-[#B3C1BB]/30 text-[#1a1a1a]"
                }`}
              >
                {renderMessageContent(message.content)}
              </div>
            </div>
          ))}
          {aiLoading && (
            <div className="flex justify-start">
              <div className="rounded-lg px-3 py-2 text-[12px] bg-[#F8F8F6] border border-[#B3C1BB]/30 text-[#94AAA1]">
                Thinking...
              </div>
            </div>
          )}
          <div ref={chatBottomRef} />
        </div>

        {aiError && <p className="text-[11px] text-[#9B5C47] bg-[#FFF7F0] border border-[#EAC5B3] rounded-lg px-3 py-2">{aiError}</p>}
        {recommendationSource && !aiError && (
          <p className="text-[10px] text-[#B3C1BB] px-1">AI recommendation source: {recommendationSource}</p>
        )}

        <form
          className="w-full flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            sendAiMessage();
          }}
        >
          <input
            type="text"
            value={aiInput}
            onChange={(event) => setAiInput(event.target.value)}
            disabled={aiLoading}
            placeholder="Ask a question..."
            aria-label="Ask the AI advisor"
            className="flex-1 min-w-0 text-[12px] px-3 py-2 rounded-lg border border-[#B3C1BB]/50 bg-white/80 placeholder:text-[#B3C1BB] focus:outline-none focus:border-[#1B3968] focus:ring-1 focus:ring-[#1B3968]/10 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={aiLoading || !aiInput.trim()}
            className="px-3 py-2 rounded-lg bg-[#1B3968] text-white text-[12px] font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            Ask
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F2E8]">

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
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_380px] items-start gap-6 px-8 py-8 max-w-7xl mx-auto w-full">

        {/* ── Left column ── */}
        <div className="flex flex-col gap-6">

          {/* Google Calendar panel */}
          <Panel label="Your Google Calendar" className="flex flex-col">
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
            <div className="min-h-[220px]">
              {plannedCourses.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#B3C1BB]/70 bg-white/60 flex flex-col items-center justify-center gap-3 py-16 min-h-[220px]">
                  <ClockIcon />
                  <p className="text-[14px] font-medium text-[#94AAA1]">Study Schedule</p>
                  <p className="text-[12px] text-[#B3C1BB] text-center max-w-[220px] leading-relaxed">
                    Add recommended GE courses to start building your next-quarter schedule.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2 max-h-[360px] overflow-y-auto">
                  {plannedCourses.map((course) => (
                    <div key={course.id} className="rounded-lg bg-white/70 border border-[#B3C1BB]/30 px-3 py-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[12px] font-bold text-[#1B3968]">
                            {course.courseCode}{course.section ? ` ${course.section}` : ""}
                          </p>
                          <p className="text-[11px] text-[#1a1a1a] truncate">{course.title}</p>
                        </div>
                        <button
                          onClick={() => handleRemovePlannedCourse(course.id)}
                          className="text-[11px] text-[#94AAA1] hover:text-red-400 transition-colors shrink-0"
                        >
                          Remove
                        </button>
                      </div>
                      <p className="text-[11px] text-[#5a6872] mt-1">{formatMeetings(course.meetings)}</p>
                      <p className="text-[10px] text-[#94AAA1] mt-1">
                        {course.instructors.length > 0 ? course.instructors.join(", ") : "Instructor TBA"} · CRN {course.crn ?? "TBA"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Panel>

          <Panel label="AI Advisor" className="flex flex-col">
            {renderAiAdvisor(false)}
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
                    onClick={() => {
                      setCourses([]);
                      setTranscriptError(null);
                      setStudentMajor(null);
                      setMajorAudit(null);
                      localStorage.removeItem(TRANSCRIPT_COURSES_STORAGE_KEY);
                    }}
                    className="text-[11px] text-[#94AAA1] hover:text-red-400 transition-colors"
                  >
                    Clear
                  </button>
                </div>
                <div className="overflow-y-auto max-h-52 flex flex-col gap-1">
                  {[...courses].sort((a, b) => quarterKey(b.quarter) - quarterKey(a.quarter)).map((c, i) => (
                    <div key={i} className="flex items-center justify-between px-2.5 py-2 rounded-lg bg-white/70 border border-[#B3C1BB]/30">
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-bold text-[#1B3968]">{c.courseCode}</p>
                        <p className="text-[11px] text-[#1a1a1a] truncate">{c.title}</p>
                        <p className="text-[10px] text-[#94AAA1]">{c.quarter ?? "—"}</p>
                        {(c.geCategories?.length > 0 || c.writingCategories?.length > 0) && (
                          <div className="flex flex-wrap gap-0.5 mt-1">
                            {c.geCategories?.map((g) => (
                              <span key={g} className="text-[9px] px-1 py-0.5 rounded bg-[#1B3968]/10 text-[#1B3968] font-medium">{g}</span>
                            ))}
                            {c.writingCategories?.map((w) => (
                              <span key={w} className="text-[9px] px-1 py-0.5 rounded bg-[#6A9879]/15 text-[#487A62] font-medium">{w}</span>
                            ))}
                          </div>
                        )}
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

          <Panel label="Requirements" className="flex flex-col">
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-white/70 border border-[#B3C1BB]/30 p-1 mb-3">
              {[
                { key: "ge" as const, label: "GE" },
                { key: "major" as const, label: "Major" },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => { setRequirementsTab(tab.key); setDismissedSuggestionIds(new Set()); }}
                  className={`text-[12px] font-medium rounded-md py-1.5 transition-colors ${
                    requirementsTab === tab.key
                      ? "bg-[#1B3968] text-white"
                      : "text-[#5a6872] hover:text-[#1B3968]"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {requirementsTab === "ge" ? (
              courses.length === 0 ? (
                <div className="min-h-[110px] flex items-center justify-center">
                  <p className="text-[12px] text-[#B3C1BB]">Upload your transcript to check requirements</p>
                </div>
              ) : (() => {
                const reqs = computeRequirements(courses);
                const ReqRow = ({ label, val, min }: { label: string; val: number; min: number }) => {
                  const met = val >= min;
                  return (
                    <div className="flex items-center justify-between py-1 border-b border-[#B3C1BB]/20 last:border-0">
                      <span className="text-[11px] text-[#1a1a1a]">{label}</span>
                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        <span className="text-[11px] text-[#5a6872]">{val}/{min}+ u</span>
                        <span className={`text-[10px] font-bold ${met ? "text-[#487A62]" : "text-red-400"}`}>
                          {met ? "✓" : "✗"}
                        </span>
                      </div>
                    </div>
                  );
                };
                return (
                  <div className="flex flex-col">
                    {reqs.map((r) => (
                      <div key={r.key}>
                        {r.dividerBefore && <hr className="my-2 border-[#B3C1BB]/40" />}
                        <ReqRow label={r.label} val={r.val} min={r.min} />
                      </div>
                    ))}
                  </div>
                );
              })()
            ) : (
              courses.length === 0 ? (
                <div className="min-h-[110px] flex items-center justify-center">
                  <p className="text-[12px] text-[#B3C1BB]">Upload your transcript to check requirements</p>
                </div>
              ) : !majorAudit ? (
                <div className="min-h-[110px] flex items-center justify-center">
                  <p className="text-[12px] text-[#B3C1BB] text-center px-2">
                    {studentMajor
                      ? `No structured requirements found for ${studentMajor}.`
                      : "No major detected on this transcript."}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col">
                  <div className="mb-2 pb-2 border-b border-[#B3C1BB]/30">
                    <p className="text-[12px] font-bold text-[#1B3968]">
                      {majorAudit.major.name}{majorAudit.major.degree ? ` ${majorAudit.major.degree}` : ""}
                    </p>
                    <p className="text-[10px] text-[#94AAA1]">
                      {majorAudit.summary.met}/{majorAudit.summary.total} requirements met{majorAudit.major.catalogYear ? ` · ${majorAudit.major.catalogYear}` : ""}
                    </p>
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    {majorAudit.requirements.map((requirement) => (
                      <div key={requirement.id} className="py-1.5 border-b border-[#B3C1BB]/20 last:border-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[11px] text-[#1a1a1a] leading-tight">{requirement.name}</p>
                            {requirement.groupLabel && (
                              <p className="text-[9px] text-[#94AAA1] mt-0.5">{requirement.groupLabel}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[11px] text-[#5a6872]">
                              {requirement.progress}/{requirement.required}{requirement.unitBased ? " u" : ""}
                            </span>
                            <span className={`text-[10px] font-bold ${requirement.met ? "text-[#487A62]" : "text-red-400"}`}>
                              {requirement.met ? "✓" : "✗"}
                            </span>
                          </div>
                        </div>
                        {!requirement.met && requirement.missingCourseCodes.length > 0 && (
                          <p className="text-[9px] text-[#94AAA1] mt-1 line-clamp-2">
                            Options: {requirement.missingCourseCodes.slice(0, 8).join(", ")}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            )}
          </Panel>

          <Panel label="Next quarter suggestions" className="flex flex-col">
            <div className="min-h-[140px] flex flex-col gap-2 pt-1">
              {courses.length === 0 ? (
                <p className="text-[12px] text-[#B3C1BB] text-center py-8 px-2">
                  Upload your transcript to get course suggestions for Fall 2026.
                </p>
              ) : geOfferingsLoading ? (
                <p className="text-[12px] text-[#94AAA1] text-center py-8 animate-pulse">Loading course offerings…</p>
              ) : geOfferingsError ? (
                <p className="text-[11px] text-red-400 text-center py-8 px-2">{geOfferingsError}</p>
              ) : showingMajorSuggestions && !majorAudit ? (
                <p className="text-[12px] text-[#B3C1BB] text-center py-8 px-2">
                  Major suggestions appear once a supported major is detected.
                </p>
              ) : requirementSuggestions.length === 0 ? (
                <p className="text-[12px] text-[#487A62] text-center py-8 px-2">
                  Your current transcript meets the tracked {showingMajorSuggestions ? "major" : "GE"} requirements.
                </p>
              ) : visibleSuggestions.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8">
                  <p className="text-[12px] text-[#94AAA1]">You&apos;ve dismissed all suggestions.</p>
                  <button
                    type="button"
                    onClick={() => setDismissedSuggestionIds(new Set())}
                    className="text-[11px] text-[#1B3968] font-medium hover:underline"
                  >
                    Start over
                  </button>
                </div>
              ) : (
                <>
                  {visibleSuggestions.map((course) => (
                    <div key={course.id} className="px-3 py-2.5 rounded-lg bg-white/70 border border-[#B3C1BB]/30">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[12px] font-bold text-[#1B3968]">
                            {course.courseCode}{course.section ? ` ${course.section}` : ""}
                          </p>
                          <p className="text-[11px] text-[#1a1a1a] truncate">{course.title}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[10px] text-[#5a6872]">{getCourseUnits(course)} u</span>
                          <button
                            type="button"
                            onClick={() => handleAddPlannedCourse(course)}
                            className="px-2 py-1 rounded-md bg-[#1B3968] text-white text-[10px] font-medium hover:opacity-90 transition-opacity"
                          >
                            Add
                          </button>
                          <button
                            type="button"
                            aria-label="Dismiss suggestion"
                            onClick={() => setDismissedSuggestionIds((prev) => new Set([...prev, course.id]))}
                            className="w-5 h-5 flex items-center justify-center rounded text-[#B3C1BB] hover:text-[#9B3A2F] hover:bg-[#FFF4F2] transition-colors text-[12px] leading-none"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                      <p className="text-[10px] text-[#5a6872] mt-1.5">{formatMeetings(course.meetings)}</p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {[...course.geCategories, ...course.writingCategories].map((tag) => (
                          <span key={tag} className="text-[9px] px-1 py-0.5 rounded bg-[#6A9879]/15 text-[#487A62] font-medium">{tag}</span>
                        ))}
                      </div>
                      <p className="text-[10px] text-[#94AAA1] mt-1.5">
                        Covers {suggestionMatches(course).join(", ")} · {course.openSeats} open seat{course.openSeats !== 1 ? "s" : ""} · CRN {course.crn ?? "TBA"}
                      </p>
                    </div>
                  ))}
                  <div className="flex items-center justify-between px-1">
                    <p className="text-[10px] text-[#B3C1BB]">
                      Matched to {showingMajorSuggestions ? "major" : "GE"} requirements marked ✗.
                      {hiddenCount > 0 && ` ${hiddenCount} more available.`}
                    </p>
                    {dismissedSuggestionIds.size > 0 && (
                      <button
                        type="button"
                        onClick={() => setDismissedSuggestionIds(new Set())}
                        className="text-[10px] text-[#1B3968] hover:underline shrink-0"
                      >
                        Start over
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </Panel>

        </div>
      </main>

      {aiExpanded && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 sm:px-8">
          <button
            type="button"
            aria-label="Close expanded AI advisor"
            onClick={() => setAiExpanded(false)}
            className="absolute inset-0 bg-[#1a1a1a]/35 backdrop-blur-[1px]"
          />
          <section className="relative z-10 flex max-h-[88vh] min-h-[520px] w-full max-w-3xl flex-col rounded-2xl border border-[#B3C1BB]/55 bg-[#F8F8F6] p-4 shadow-2xl sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-3 border-b border-[#B3C1BB]/30 pb-3">
              <div>
                <p className="text-[13px] font-semibold text-[#1a1a1a]">AI Advisor</p>
                <p className="text-[11px] text-[#94AAA1]">Schedule and course planning</p>
              </div>
              <button
                type="button"
                onClick={() => setAiExpanded(false)}
                aria-label="Close expanded AI advisor"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#B3C1BB]/45 bg-white/80 text-[#5a6872] hover:border-[#1B3968]/50 hover:text-[#1B3968] transition-colors"
              >
                <CloseIcon />
              </button>
            </div>
            <div className="min-h-0 flex-1 flex flex-col overflow-hidden">
              {renderAiAdvisor(true)}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default function SchedulePlannerPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F4F2E8]" />}>
      <SchedulePlannerContent />
    </Suspense>
  );
}
