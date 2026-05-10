"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";

// ─── Data ─────────────────────────────────────────────────────────────────────

type Professor = {
  id?: string;
  name: string;
  email: string;
  dept: string;
  department?: string;
  interests: string[];
  title: string;
  labName: string;
  labDescription: string;
  about: string;
  office: string;
  phoneNumber?: string;
  personalSite?: string;
  sourceUrl?: string;
  topMatchedRequirementCourses?: unknown[];
};

type SortOption = "name-asc" | "name-desc" | "compatibility";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";


function compatibilitySummary(): string {
  return "Compatibility will appear after transcript/course history is available. This page only loads professor and course-match data for now.";
}

function cleanDisplay(value: string | null | undefined): string {
  const cleaned = value?.trim() ?? "";
  return cleaned.toLowerCase() === "info not applicable" ? "" : cleaned;
}

function joinDisplay(values: Array<string | null | undefined>): string {
  return values.map(cleanDisplay).filter(Boolean).join(" · ");
}

function externalHref(value: string | null | undefined): string {
  const href = cleanDisplay(value);
  if (!href) {
    return "";
  }
  return /^https?:\/\//i.test(href) ? href : `https://${href}`;
}

function searchTokens(value: string | null | undefined): string[] {
  return cleanDisplay(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function exactWordSearchMatch(value: string | null | undefined, query: string): boolean {
  const queryTokens = searchTokens(query);

  if (queryTokens.length === 0) {
    return true;
  }

  const valueTokens = new Set(searchTokens(value));
  if (valueTokens.size === 0) {
    return false;
  }

  return queryTokens.every((queryToken) => valueTokens.has(queryToken));
}

function professorMatchesQuery(professor: Professor, query: string): boolean {
  const fields = [
    professor.name,
    professor.dept,
    professor.department,
    ...(professor.interests ?? []),
  ];

  return fields.some((field) => exactWordSearchMatch(field, query));
}

function easeOutCubic(progress: number): number {
  return 1 - Math.pow(1 - progress, 3);
}

function readStoredUserEmail(): string {
  if (typeof window === "undefined") {
    return "";
  }

  const storages = [window.localStorage, window.sessionStorage];
  const directKeys = ["userEmail", "email", "ucdavisEmail", "currentUserEmail"];

  for (const storage of storages) {
    for (const key of directKeys) {
      const value = storage.getItem(key);
      const directMatch = value?.match(/[A-Z0-9._%+-]+@ucdavis\.edu/i);
      if (directMatch) {
        return directMatch[0];
      }
    }

    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      const value = key ? storage.getItem(key) : null;
      const match = value?.match(/[A-Z0-9._%+-]+@ucdavis\.edu/i);
      if (match) {
        return match[0];
      }
    }
  }

  return "";
}

function emailTemplate(prof: Professor): string {
  const primaryInterest = prof.interests[0] ?? prof.dept ?? "your research";
  const secondaryInterest = prof.interests[1] ?? primaryInterest;

  return `Dear Professor ${prof.name.replace("Dr. ", "")},

I am a UC Davis undergraduate student majoring in [Your Major], and I came across your research on ${primaryInterest} and ${secondaryInterest}. I found your work particularly compelling and would love to learn more.

I am writing to inquire about any opportunities to contribute to your lab as a research assistant. I am a motivated student eager to gain hands-on research experience, and I believe my background in [relevant coursework/skills] aligns well with the work your lab is doing.

I have attached my resume for your review. I would be grateful for the opportunity to speak with you at your convenience.

Thank you for your time and consideration.

Sincerely,
[Your Name]
[Your Email]
[Your Phone]`;
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function professorInitials(name: string): string {
  const cleaned = name
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(?:Dr|PhD|Ph\.D|Ph\.D\.|P\.E|P\.E\.|M\.S|M\.S\.)\b/gi, " ")
    .replace(/[^a-z\s-]/gi, " ")
    .trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return "?";
  }

  return `${parts[0][0]}${parts.length > 1 ? parts[parts.length - 1][0] : ""}`.toUpperCase();
}

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
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94AAA1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function CompatibilityBadge() {
  return (
    <div className="relative group shrink-0" onClick={(e) => e.stopPropagation()}>
      <div
        className="h-12 w-12 rounded-full border border-[#B3C1BB]/60 bg-[#F8F8F6] shadow-sm flex items-center justify-center"
        aria-label="Compatibility unavailable until transcript is loaded"
      >
        <span className="text-[18px] font-semibold text-[#94AAA1]">?</span>
      </div>
      <div className="pointer-events-none absolute right-0 top-14 z-20 w-64 rounded-xl border border-[#B3C1BB]/40 bg-white px-3 py-2 text-[11px] leading-relaxed text-[#5a6872] shadow-lg opacity-0 transition-opacity group-hover:opacity-100">
        {compatibilitySummary()}
      </div>
    </div>
  );
}

function UserIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6A9879" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function MapPinIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94AAA1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 1 1 18 0z" /><circle cx="12" cy="10" r="3" />
    </svg>
  );
}

// ─── Professor detail modal ───────────────────────────────────────────────────

function ProfessorModal({
  prof,
  onClose,
  onDraft,
  isDrafted,
}: {
  prof: Professor;
  onClose: () => void;
  onDraft: (p: Professor) => void;
  isDrafted: boolean;
}) {
  const initials = professorInitials(prof.name);
  const personalSiteHref = externalHref(prof.personalSite);

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Panel */}
      <div
        className="relative bg-[#F4F2E8] rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#94AAA1] hover:text-[#1a1a1a] transition-colors z-10"
          aria-label="Close"
        >
          <XIcon />
        </button>

        {/* Header */}
        <div className="bg-[#1B3968] px-6 py-6 rounded-t-2xl flex items-start gap-4">
          {/* Avatar */}
          <div className="w-14 h-14 rounded-xl bg-[#6A9879]/30 border border-[#6A9879]/40 flex items-center justify-center shrink-0">
            <span className="text-white text-lg font-semibold">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-[17px] font-semibold leading-tight">{prof.name}</p>
            {cleanDisplay(prof.title) && (
              <p className="text-white/60 text-[13px] mt-0.5">{prof.title}</p>
            )}
            {cleanDisplay(prof.dept) && (
              <p className="text-[#A5BA9B] text-[12px] mt-0.5">{prof.dept}</p>
            )}
            {cleanDisplay(prof.office) && (
              <div className="flex items-center gap-1.5 mt-2">
                <MapPinIcon />
                <span className="text-white/50 text-[11px]">{prof.office}</span>
              </div>
            )}
          </div>
          {personalSiteHref && (
            <a
              href={personalSiteHref}
              target="_blank"
              rel="noreferrer"
              className="mt-12 shrink-0 rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-white/20"
            >
              Personal Site
            </a>
          )}
        </div>

        <div className="px-6 py-5 flex flex-col gap-5">

          {/* About */}
          {cleanDisplay(prof.about) && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <UserIcon />
              <p className="text-[12px] font-semibold text-[#5a6872] uppercase tracking-wide">About</p>
            </div>
            <p className="text-[13px] text-[#5a6872] leading-relaxed">{prof.about}</p>
          </div>
          )}

          {/* Keywords */}
          {(prof.interests ?? []).length > 0 && (
          <div>
            <p className="text-[12px] font-semibold text-[#5a6872] uppercase tracking-wide mb-2">Keywords</p>
            <div className="flex flex-wrap gap-2">
              {(prof.interests ?? []).map((i) => (
                <span key={i} className="text-[12px] px-2.5 py-1 rounded-full bg-[#E4E8DC] text-[#487A62] font-medium">
                  {i}
                </span>
              ))}
            </div>
          </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-3 pt-1">
            <button
              onClick={() => { onDraft(prof); onClose(); }}
              className={`min-w-[10rem] flex-1 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-150 ${
                isDrafted
                  ? "bg-[#487A62] text-white"
                  : "bg-[#1B3968] text-white hover:opacity-90"
              }`}
            >
              {isDrafted ? "✓ Email drafted" : "Draft cold email"}
            </button>
            {cleanDisplay(prof.email) && (
              <a
                href={`mailto:${prof.email}`}
                className="px-4 py-2.5 rounded-xl border border-[#B3C1BB]/60 text-[13px] font-medium text-[#1B3968] hover:bg-[#EBF0F6] transition-colors"
              >
                {prof.email}
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PaperclipIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

// ─── Reusable checkbox filter list ────────────────────────────────────────────

function FilterList({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: string[];
  selected: Set<string>;
  onToggle: (v: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-[#B3C1BB]/40 bg-white/70 p-4 flex min-h-[18rem] flex-col lg:h-[calc(100vh-230px)] lg:max-h-[680px]">
      <p className="text-[13px] font-semibold text-[#1a1a1a] mb-3 shrink-0">{label}</p>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto pr-1 scroll-smooth">
        {options.map((opt) => (
          <label key={opt} className="flex items-center gap-2 cursor-pointer group">
            <input
              type="checkbox"
              checked={selected.has(opt)}
              onChange={() => onToggle(opt)}
              className="accent-[#1B3968] w-3.5 h-3.5 shrink-0"
            />
            <span className="text-[12px] text-[#5a6872] group-hover:text-[#1a1a1a] transition-colors leading-snug">
              {opt}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProfessorSearchPage() {
  const [query,       setQuery]       = useState("");
  const [deptFilter,  setDeptFilter]  = useState<Set<string>>(new Set());
  const [intFilter,   setIntFilter]   = useState<Set<string>>(new Set());
  const [professors,  setProfessors]  = useState<Professor[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [loadError,   setLoadError]   = useState<string | null>(null);
  const [drafted,     setDrafted]     = useState<Professor | null>(null);
  const [viewedProf,  setViewedProf]  = useState<Professor | null>(null);
  const [emailBody,   setEmailBody]   = useState("");
  const [subject,     setSubject]     = useState("");
  const [resumeFile,  setResumeFile]  = useState<File | null>(null);
  const [sortBy,      setSortBy]      = useState<SortOption>("compatibility");
  const [senderEmail, setSenderEmail] = useState("");
  const resultsRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function toggleSet(set: Set<string>, value: string): Set<string> {
    const next = new Set(set);
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }
    return next;
  }

  const allDepartments = useMemo(
    () => [...new Set(professors.map((p) => cleanDisplay(p.dept)).filter(Boolean))].sort(),
    [professors]
  );

  const allInterests = useMemo(
    () => [...new Set(professors.flatMap((p) => p.interests ?? []).map(cleanDisplay).filter(Boolean))].sort(),
    [professors]
  );

  const filtered = useMemo(() => {
    const matches = professors.filter((p) => {
      const interests = (p.interests ?? []).map(cleanDisplay).filter(Boolean);
      const matchesQuery = professorMatchesQuery(p, query);
      const matchesDept = deptFilter.size === 0 || deptFilter.has(cleanDisplay(p.dept));
      const matchesInt  = intFilter.size  === 0 || interests.some((i) => intFilter.has(i));
      return matchesQuery && matchesDept && matchesInt;
    });

    return [...matches].sort((a, b) => {
      if (sortBy === "name-asc") {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === "name-desc") {
        return b.name.localeCompare(a.name);
      }
      return a.name.localeCompare(b.name);
    });
  }, [professors, query, deptFilter, intFilter, sortBy]);

  useEffect(() => {
    let alive = true;

    async function loadProfessors() {
      setLoading(true);
      setLoadError(null);

      try {
        const response = await fetch(`${API_URL}/professors`, {
          credentials: "include",
        });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error ?? "Could not load professor data.");
        }

        if (alive) {
          setProfessors(Array.isArray(payload.professors) ? payload.professors : []);
        }
      } catch (error) {
        if (alive) {
          setLoadError(error instanceof Error ? error.message : "Could not load professor data.");
          setProfessors([]);
        }
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    }

    loadProfessors();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const results = resultsRef.current;
    if (!results || results.scrollTop <= 0) {
      return;
    }

    const start = results.scrollTop;
    const startTime = performance.now();
    const duration = 850;
    let frameId: number | null = null;

    function step(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);

      if (results) {
        results.scrollTop = start * (1 - easeOutCubic(progress));
      }

      if (progress < 1) {
        frameId = window.requestAnimationFrame(step);
      }
    }

    frameId = window.requestAnimationFrame(step);

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [query, deptFilter, intFilter, sortBy]);

  useEffect(() => {
    const storedEmail = readStoredUserEmail();
    if (storedEmail) {
      window.requestAnimationFrame(() => setSenderEmail(storedEmail));
    }
  }, []);

  function handleDraft(prof: Professor) {
    setDrafted(prof);
    setSubject(`Research Opportunity Inquiry — ${prof.name}'s Lab`);
    setEmailBody(emailTemplate(prof));
  }

  function handleClearEmail() {
    setDrafted(null);
    setSubject("");
    setEmailBody("");
    setResumeFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F2E8]">
      {viewedProf && (
        <ProfessorModal
          prof={viewedProf}
          onClose={() => setViewedProf(null)}
          onDraft={handleDraft}
          isDrafted={drafted?.email === viewedProf.email}
        />
      )}

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

      <main className="flex-1 flex flex-col px-5 py-6 gap-5 w-full">

        {/* ── Search bar ── */}
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2">
            <SearchIcon />
          </span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, department, or keyword..."
            className="w-full pl-10 pr-4 py-3 rounded-2xl border border-[#B3C1BB]/50 bg-white/80 text-[14px] text-[#1a1a1a] placeholder:text-[#B3C1BB] focus:outline-none focus:border-[#1B3968] focus:ring-2 focus:ring-[#1B3968]/10 shadow-sm"
          />
        </div>

        {/* ── Three-column grid ── */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[420px_minmax(0,1fr)_320px] xl:grid-cols-[460px_minmax(0,1fr)_340px] gap-5 items-start">

          {/* ── Left: filters ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FilterList
              label="Department"
              options={allDepartments}
              selected={deptFilter}
              onToggle={(v) => setDeptFilter((s) => toggleSet(s, v))}
            />
            <FilterList
              label="Keyword"
              options={allInterests}
              selected={intFilter}
              onToggle={(v) => setIntFilter((s) => toggleSet(s, v))}
            />
          </div>

          {/* ── Middle: professor list ── */}
          <div className="rounded-2xl border border-[#B3C1BB]/40 bg-white/70 overflow-visible">
            <div className="px-5 pt-4 pb-3 border-b border-[#B3C1BB]/30 flex items-center justify-between gap-3">
              <p className="text-[13px] font-semibold text-[#1a1a1a] shrink-0">
                {loading ? "Loading professors..." : `${filtered.length} professor${filtered.length !== 1 ? "s" : ""} found`}
              </p>
              <div className="flex items-center gap-2 min-w-0">
                <label htmlFor="professor-sort" className="text-[11px] font-semibold text-[#94AAA1] uppercase tracking-wide">
                  Sort
                </label>
                <select
                  id="professor-sort"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="h-8 rounded-lg border border-[#B3C1BB]/50 bg-white px-2 text-[12px] font-medium text-[#1B3968] focus:outline-none focus:border-[#1B3968] focus:ring-2 focus:ring-[#1B3968]/10"
                >
                  <option value="compatibility">Compatibility</option>
                  <option value="name-asc">A-Z name</option>
                  <option value="name-desc">Z-A name</option>
                </select>
                <div className="relative group text-[#94AAA1]">
                  <InfoIcon />
                  <div className="pointer-events-none absolute right-0 top-6 z-20 w-64 rounded-xl border border-[#B3C1BB]/40 bg-white px-3 py-2 text-[11px] leading-relaxed text-[#5a6872] shadow-lg opacity-0 transition-opacity group-hover:opacity-100">
                    Compatibility will show after transcript/course history is available. Professor/course match evidence is loaded separately.
                  </div>
                </div>
              </div>
            </div>

            <div ref={resultsRef} className="max-h-[calc(100vh-230px)] overflow-y-auto flex flex-col divide-y divide-[#B3C1BB]/20 transition-[max-height] duration-300 ease-out">
              {loading ? (
                <div className="px-5 py-12 text-center text-[13px] text-[#94AAA1]">
                  Loading professor data...
                </div>
              ) : loadError ? (
                <div className="px-5 py-12 text-center text-[13px] text-[#B35C5C]">
                  {loadError}
                </div>
              ) : filtered.length === 0 ? (
                <div className="px-5 py-12 text-center text-[13px] text-[#B3C1BB]">
                  No professors match your filters.
                </div>
              ) : (
                filtered.map((prof) => {
                  const details = joinDisplay([prof.title, prof.dept]);
                  const interests = (prof.interests ?? []).map(cleanDisplay).filter(Boolean);

                  return (
                  <div
                    key={prof.id ?? prof.sourceUrl ?? prof.email}
                    onClick={() => setViewedProf(prof)}
                    className="px-5 py-4 flex flex-col gap-2 cursor-pointer hover:bg-[#EBF0F6]/50 transition-all duration-300 ease-out"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-semibold text-[#1a1a1a] truncate">{prof.name}</p>
                        {details && <p className="text-[12px] text-[#5a6872]">{details}</p>}
                      </div>
                      <div className="flex items-start gap-2 shrink-0">
                        <CompatibilityBadge />
                      </div>
                    </div>
                    {interests.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {interests.map((interest) => (
                        <span
                          key={interest}
                          className="text-[11px] px-2 py-0.5 rounded-full bg-[#E4E8DC] text-[#487A62] font-medium"
                        >
                          {interest}
                        </span>
                      ))}
                    </div>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDraft(prof); }}
                      className={`mt-2 self-end text-[12px] font-medium px-3 py-1.5 rounded-lg transition-all duration-150
                        ${drafted?.email === prof.email
                          ? "bg-[#1B3968] text-white"
                          : "border border-[#B3C1BB]/60 text-[#1B3968] hover:bg-[#1B3968] hover:text-white hover:border-[#1B3968]"
                        }`}
                    >
                      {drafted?.email === prof.email ? "✓ Drafted" : "Draft email"}
                    </button>
                  </div>
                  );
                })
              )}
            </div>
          </div>

          {/* ── Right: Cold Email Template ── */}
          <div className="rounded-2xl border border-[#B3C1BB]/40 bg-white/70 overflow-hidden flex flex-col">
            <div className="px-5 pt-5 pb-3 border-b border-[#B3C1BB]/30 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-[#1a1a1a]">Cold Email Template</p>
                {drafted && (
                  <p className="text-[11px] text-[#6A9879] mt-0.5 truncate">
                    Drafted for {drafted.name}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={handleClearEmail}
                disabled={!drafted && !subject && !emailBody && !resumeFile}
                className="shrink-0 rounded-lg border border-[#B3C1BB]/50 px-2.5 py-1 text-[11px] font-medium text-[#5a6872] transition-colors hover:border-[#1B3968] hover:text-[#1B3968] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-[#B3C1BB]/50 disabled:hover:text-[#5a6872]"
              >
                Clear
              </button>
            </div>

            <div className="flex flex-col gap-4 px-5 py-4 flex-1">
              {/* To */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-[#94AAA1] uppercase tracking-wide">To</label>
                <input
                  type="email"
                  value={drafted?.email ?? ""}
                  readOnly
                  placeholder="Select a professor to auto-fill"
                  className="text-[13px] px-3 py-2 rounded-lg border border-[#B3C1BB]/40 bg-[#F8F8F6] text-[#1a1a1a] placeholder:text-[#B3C1BB] focus:outline-none"
                />
              </div>

              {/* From */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-[#94AAA1] uppercase tracking-wide">From</label>
                <input
                  type="email"
                  value={senderEmail}
                  onChange={(e) => setSenderEmail(e.target.value)}
                  placeholder="username@ucdavis.edu"
                  className="text-[13px] px-3 py-2 rounded-lg border border-[#B3C1BB]/40 bg-[#F8F8F6] text-[#1a1a1a] placeholder:text-[#B3C1BB] focus:outline-none focus:border-[#1B3968] focus:ring-1 focus:ring-[#1B3968]/10"
                />
              </div>

              {/* Subject */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-[#94AAA1] uppercase tracking-wide">Subject</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Email subject…"
                  className="text-[13px] px-3 py-2 rounded-lg border border-[#B3C1BB]/40 bg-[#F8F8F6] text-[#1a1a1a] placeholder:text-[#B3C1BB] focus:outline-none focus:border-[#1B3968] focus:ring-1 focus:ring-[#1B3968]/10"
                />
              </div>

              {/* Body */}
              <div className="flex flex-col gap-1 flex-1">
                <label className="text-[11px] font-semibold text-[#94AAA1] uppercase tracking-wide">Body</label>
                <textarea
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  placeholder="Click 'Draft email' on a professor to generate a template…"
                  rows={10}
                  className="text-[12px] px-3 py-2 rounded-lg border border-[#B3C1BB]/40 bg-[#F8F8F6] text-[#1a1a1a] placeholder:text-[#B3C1BB] focus:outline-none focus:border-[#1B3968] focus:ring-1 focus:ring-[#1B3968]/10 resize-none leading-relaxed flex-1"
                />
              </div>

              {/* Resume attachment */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-[#94AAA1] uppercase tracking-wide">
                  Resume Attachment
                </label>
                <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-[#B3C1BB]/60 bg-[#F8F8F6] cursor-pointer hover:border-[#1B3968] hover:bg-[#EBF0F6] transition-colors">
                  <PaperclipIcon />
                  <span className="text-[12px] text-[#5a6872] truncate">
                    {resumeFile ? resumeFile.name : "Attach your resume (PDF)"}
                  </span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={(e) => setResumeFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>

              {/* Send button */}
              <button
                disabled={!drafted}
                className="w-full py-2.5 rounded-xl bg-[#1B3968] text-white text-[13px] font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Send email
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

