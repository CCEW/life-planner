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
  departmentSubjects?: string[];
  topicScores?: Record<string, unknown>;
  topicKeywordHits?: Record<string, unknown>;
  topMatchedRequirementCourses?: unknown[];
};

type TranscriptCourse = {
  courseCode?: string;
  title?: string;
  grade?: string;
  units?: number;
  quarter?: string;
  geCategories?: string[];
  writingCategories?: string[];
};

type CompatibilityResult = {
  score: number | null;
  summary: string;
  details: string[];
};

type SortOption = "name-asc" | "name-desc" | "compatibility";
type CopyTarget = "idle" | "email" | "subject" | "body";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "based", "by", "course", "courses", "data", "design", "for", "from", "in",
  "intro", "introduction", "lab", "laboratory", "methods", "model", "models", "of", "on", "or", "part", "principles",
  "science", "sciences", "seminar", "special", "study", "systems", "technology", "the", "to", "topics", "using", "with",
]);

const GRADE_POINTS: Record<string, number> = {
  "A+": 4,
  A: 4,
  "A-": 3.7,
  "B+": 3.3,
  B: 3,
  "B-": 2.7,
  "C+": 2.3,
  C: 2,
  "C-": 1.7,
  "D+": 1.3,
  D: 1,
  "D-": 0.7,
  F: 0,
};

function cleanDisplay(value: string | null | undefined): string {
  const cleaned = value?.trim() ?? "";
  return cleaned.toLowerCase() === "info not applicable" ? "" : cleaned;
}

function professorKey(professor: Professor): string {
  return professor.id ?? professor.email ?? professor.sourceUrl ?? professor.name;
}

function normalizeCourseCode(value: string | null | undefined): string {
  const cleaned = cleanDisplay(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
  const match = cleaned.match(/^([A-Z]{2,4})\s*0*([0-9]+[A-Z]*)$/);
  return match ? `${match[1]} ${match[2]}` : cleaned.replace(/\s+/g, " ");
}

function courseSubject(value: string | null | undefined): string {
  return normalizeCourseCode(value).match(/^([A-Z]{2,4})\b/)?.[1] ?? "";
}

function normalizeKeyword(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 2)
    .map((token) => token.replace(/(?:ing|ies|s)$/i, (suffix) => (suffix === "ies" ? "y" : "")))
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token))
    .join(" ");
}

function keywordTokens(values: Array<string | null | undefined>): Set<string> {
  return new Set(
    values
      .flatMap((value) => normalizeKeyword(cleanDisplay(value)).split(/\s+/))
      .filter(Boolean)
  );
}

function gradePoints(grade: string | null | undefined): number | null {
  const normalized = cleanDisplay(grade).toUpperCase();
  if (!normalized || ["W", "I", "NG", "Y"].includes(normalized)) {
    return null;
  }
  if (normalized === "P" || normalized === "S" || normalized === "IP") {
    return 3.2;
  }
  if (normalized === "NP" || normalized === "U") {
    return 0;
  }
  return GRADE_POINTS[normalized] ?? null;
}

function gradeMultiplier(grade: string | null | undefined): number {
  const points = gradePoints(grade);
  if (points === null) {
    return 0.75;
  }
  if (points <= 0) {
    return 0;
  }
  return 0.65 + Math.min(points, 4) / 4 * 0.45;
}

function isUsableTranscriptCourse(course: TranscriptCourse): boolean {
  const normalized = cleanDisplay(course.grade).toUpperCase();
  return Boolean(normalizeCourseCode(course.courseCode)) && !["F", "NP", "U", "W"].includes(normalized);
}

function courseUnits(course: TranscriptCourse): number {
  return typeof course.units === "number" && Number.isFinite(course.units) ? Math.max(course.units, 1) : 4;
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

function stringArrayFromRecord(record: Record<string, unknown>, keys: string[]): string[] {
  return keys.flatMap((key) => {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === "string");
    }
    return typeof value === "string" ? [value] : [];
  });
}

function professorCourseRecords(professor: Professor) {
  return (professor.topMatchedRequirementCourses ?? [])
    .filter((course): course is Record<string, unknown> => Boolean(course) && typeof course === "object");
}

function professorCourseCode(record: Record<string, unknown>): string {
  const value = record.course_code ?? record.courseCode ?? record.code;
  return typeof value === "string" ? value : "";
}

function professorCourseTitle(record: Record<string, unknown>): string {
  const value = record.course_title ?? record.courseTitle ?? record.title;
  return typeof value === "string" ? value : "";
}

function professorCourseScore(record: Record<string, unknown>): number {
  const value = record.score;
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(value, 100)) : 60;
}

function departmentSubjects(professor: Professor): string[] {
  const explicit = (professor.departmentSubjects ?? []).map((subject) => subject.toUpperCase()).filter(Boolean);
  if (explicit.length > 0) {
    return explicit;
  }

  const department = cleanDisplay(professor.department ?? professor.dept).toLowerCase();
  if (department.includes("computer science")) return ["ECS"];
  if (department.includes("electrical") || department.includes("computer engineering")) return ["EEC"];
  if (department.includes("civil") || department.includes("environmental")) return ["ECI"];
  if (department.includes("mechanical") || department.includes("aerospace")) return ["EME", "EAE"];
  if (department.includes("chemical")) return ["ECH"];
  if (department.includes("biomedical")) return ["BIM"];
  if (department.includes("biological") || department.includes("agricultural")) return ["EBS"];
  if (department.includes("materials")) return ["EMS"];
  return [];
}

function gradeLabel(points: number): string {
  if (points >= 3.85) return "A range";
  if (points >= 3.15) return "B+/A- range";
  if (points >= 2.65) return "B range";
  if (points >= 2) return "C range";
  return "below C range";
}

function compatibilityColor(score: number | null): string {
  if (score === null) return "#94AAA1";
  if (score >= 80) return "#16864D";
  if (score >= 65) return "#55A469";
  if (score >= 45) return "#D0A53A";
  return "#B35C5C";
}

function authHeaders(): HeadersInit {
  if (typeof window === "undefined") {
    return {};
  }
  const token = window.localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function calculateCompatibility(professor: Professor, transcriptCourses: TranscriptCourse[]): CompatibilityResult {
  const usableCourses = transcriptCourses.filter(isUsableTranscriptCourse);
  if (usableCourses.length === 0) {
    return {
      score: null,
      summary: "Upload or parse a transcript first so compatibility can use your course history.",
      details: ["No usable transcript courses were found for this account."],
    };
  }

  const transcriptByCode = new Map(usableCourses.map((course) => [normalizeCourseCode(course.courseCode), course]));
  const professorRecords = professorCourseRecords(professor);
  const professorTerms = keywordTokens([
    professor.name,
    professor.department,
    professor.dept,
    professor.about,
    professor.labDescription,
    ...(professor.interests ?? []),
    ...professorRecords.flatMap((record) => [
      professorCourseTitle(record),
      ...stringArrayFromRecord(record, ["matched_topic_labels", "matchedTopicLabels", "evidence_terms", "evidenceTerms"]),
    ]),
  ]);
  const subjects = new Set(departmentSubjects(professor));
  const matchedCourseNotes: string[] = [];
  const relatedCourseCodes = new Set<string>();

  let directScore = 0;
  for (const record of professorRecords) {
    const code = normalizeCourseCode(professorCourseCode(record));
    const taken = transcriptByCode.get(code);
    if (!taken) continue;

    const gradeBoost = gradeMultiplier(taken.grade);
    const unitBoost = Math.min(courseUnits(taken) / 4, 1.25);
    directScore += 14 * (professorCourseScore(record) / 100) * gradeBoost * unitBoost;
    relatedCourseCodes.add(normalizeCourseCode(taken.courseCode));
    matchedCourseNotes.push(`${normalizeCourseCode(taken.courseCode)} ${cleanDisplay(taken.title)} (${cleanDisplay(taken.grade) || "grade not listed"})`);
  }
  directScore = Math.min(directScore, 35);

  let departmentScore = 0;
  const departmentMatches: TranscriptCourse[] = [];
  for (const course of usableCourses) {
    if (!subjects.has(courseSubject(course.courseCode))) continue;
    departmentMatches.push(course);
    departmentScore += Math.min(courseUnits(course), 5) * 1.1 * gradeMultiplier(course.grade);
    relatedCourseCodes.add(normalizeCourseCode(course.courseCode));
  }
  departmentScore = Math.min(departmentScore, 25);

  let topicScore = 0;
  const topicMatches: string[] = [];
  for (const course of usableCourses) {
    const courseTerms = keywordTokens([course.courseCode, course.title]);
    const overlap = [...courseTerms].filter((token) => professorTerms.has(token));
    if (overlap.length === 0) continue;

    const relevance = Math.min(overlap.length / 3, 1);
    topicScore += 6 * relevance * gradeMultiplier(course.grade) * Math.min(courseUnits(course) / 4, 1.25);
    relatedCourseCodes.add(normalizeCourseCode(course.courseCode));
    if (topicMatches.length < 4) {
      topicMatches.push(`${normalizeCourseCode(course.courseCode)} (${overlap.slice(0, 3).join(", ")})`);
    }
  }
  topicScore = Math.min(topicScore, 25);

  const relatedCourses = usableCourses.filter((course) => relatedCourseCodes.has(normalizeCourseCode(course.courseCode)));
  const gradeWeights = relatedCourses.map((course) => ({
    points: gradePoints(course.grade),
    units: courseUnits(course),
  })).filter((item): item is { points: number; units: number } => item.points !== null && item.points > 0);
  const weightedUnits = gradeWeights.reduce((sum, item) => sum + item.units, 0);
  const averagePoints = weightedUnits > 0
    ? gradeWeights.reduce((sum, item) => sum + item.points * item.units, 0) / weightedUnits
    : null;
  const gradeScore = averagePoints === null ? 0 : Math.max(0, Math.min((averagePoints - 2.3) / 1.7, 1)) * 15;
  const rawScore = directScore + departmentScore + topicScore + gradeScore;
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));

  const details = [
    departmentScore > 0
      ? `Department area: ${departmentMatches.length} ${[...subjects].join("/")} course${departmentMatches.length === 1 ? "" : "s"} contributed ${Math.round(departmentScore)} pts.`
      : "Department area: no transcript courses found in this professor's department subjects.",
    directScore > 0
      ? `Direct course match: ${matchedCourseNotes.slice(0, 3).join("; ")} contributed ${Math.round(directScore)} pts.`
      : "Direct course match: no exact match with this professor's course-topic map.",
    topicScore > 0
      ? `Research/topic overlap: ${topicMatches.join("; ")} contributed ${Math.round(topicScore)} pts.`
      : "Research/topic overlap: no strong keyword overlap found from course titles.",
    averagePoints !== null
      ? `Grade strength: related coursework averages ${gradeLabel(averagePoints)}, adding ${Math.round(gradeScore)} pts.`
      : "Grade strength: no graded related coursework available yet.",
  ];

  return {
    score,
    summary: `${score}% match from ${relatedCourses.length} related transcript course${relatedCourses.length === 1 ? "" : "s"}.`,
    details,
  };
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
[Your Name]`;
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.split(",")[1] ?? result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.select();

  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error("Clipboard unavailable.");
  }
}

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

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function FieldCopyButton({
  label,
  copied,
  disabled,
  onClick,
}: {
  label: string;
  copied: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={copied ? "Copied" : label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 transition-all hover:bg-[#EBF0F6] hover:text-[#1B3968] hover:opacity-100 disabled:pointer-events-none disabled:opacity-10 ${
        copied ? "text-[#6A9879] opacity-100" : "text-[#1B3968]/35 opacity-35"
      }`}
    >
      <CopyIcon />
    </button>
  );
}

function XIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function CompatibilityBadge({
  result,
  loading,
  error,
}: {
  result?: CompatibilityResult;
  loading: boolean;
  error?: string | null;
}) {
  const score = result?.score ?? null;
  const color = compatibilityColor(score);
  const label = loading ? "..." : score === null ? "?" : `${score}%`;
  const summary = loading
    ? "Loading your transcript courses from your account."
    : error
      ? error
    : result?.summary ?? "Sign in and upload a transcript to calculate compatibility.";
  const details = result?.details ?? [];

  return (
    <div className="relative group shrink-0" onClick={(e) => e.stopPropagation()}>
      <div
        className="h-12 w-12 rounded-full p-[3px] shadow-sm flex items-center justify-center"
        style={{ background: score === null ? "#F8F8F6" : `conic-gradient(${color} ${score * 3.6}deg, #E1E8E4 0deg)` }}
        aria-label={score === null ? "Compatibility unavailable until transcript is loaded" : `Compatibility ${score}%`}
      >
        <div className="h-full w-full rounded-full bg-[#F8F8F6] flex items-center justify-center">
          <span className="text-[12px] font-semibold" style={{ color }}>{label}</span>
        </div>
      </div>
      <div className="pointer-events-none absolute right-0 top-14 z-20 w-80 rounded-xl border border-[#B3C1BB]/40 bg-white px-3 py-2 text-[11px] leading-relaxed text-[#5a6872] shadow-lg opacity-0 transition-opacity group-hover:opacity-100">
        <p className="font-semibold text-[#1a1a1a]">{summary}</p>
        {details.length > 0 && (
          <ul className="mt-1.5 list-disc pl-4">
            {details.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        )}
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
  const [transcriptCourses, setTranscriptCourses] = useState<TranscriptCourse[]>([]);
  const [transcriptLoading, setTranscriptLoading] = useState(true);
  const [loading,     setLoading]     = useState(true);
  const [loadError,   setLoadError]   = useState<string | null>(null);
  const [transcriptError, setTranscriptError] = useState<string | null>(null);
  const [drafted,     setDrafted]     = useState<Professor | null>(null);
  const [viewedProf,  setViewedProf]  = useState<Professor | null>(null);
  const [emailBody,   setEmailBody]   = useState("");
  const [subject,     setSubject]     = useState("");
  const [resumeFile,  setResumeFile]  = useState<File | null>(null);
  const [aiDrafting,  setAiDrafting]  = useState(false);
  const [draftError,  setDraftError]  = useState("");
  const [copyStatus,  setCopyStatus]  = useState<CopyTarget>("idle");
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

  const compatibilityByProfessor = useMemo(() => {
    const scores = new Map<string, CompatibilityResult>();
    for (const professor of professors) {
      scores.set(professorKey(professor), calculateCompatibility(professor, transcriptCourses));
    }
    return scores;
  }, [professors, transcriptCourses]);

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
      const aScore = compatibilityByProfessor.get(professorKey(a))?.score;
      const bScore = compatibilityByProfessor.get(professorKey(b))?.score;
      if (aScore !== null && aScore !== undefined && bScore !== null && bScore !== undefined && bScore !== aScore) {
        return bScore - aScore;
      }
      if (aScore !== null && aScore !== undefined) {
        return -1;
      }
      if (bScore !== null && bScore !== undefined) {
        return 1;
      }
      return a.name.localeCompare(b.name);
    });
  }, [professors, query, deptFilter, intFilter, sortBy, compatibilityByProfessor]);

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
    let alive = true;

    async function loadTranscriptCourses() {
      setTranscriptLoading(true);
      setTranscriptError(null);

      try {
        const response = await fetch(`${API_URL}/api/transcript/me`, {
          credentials: "include",
          headers: authHeaders(),
        });
        const payload = await response.json().catch(() => ({}));

        if (response.status === 401) {
          if (alive) {
            setTranscriptCourses([]);
            setTranscriptError("Sign in to calculate compatibility from your transcript.");
          }
          return;
        }

        if (!response.ok) {
          throw new Error(payload.message ?? payload.error ?? "Could not load transcript courses.");
        }

        if (alive) {
          setTranscriptCourses(Array.isArray(payload.courses) ? payload.courses : []);
        }
      } catch (error) {
        if (alive) {
          setTranscriptCourses([]);
          setTranscriptError(error instanceof Error ? error.message : "Could not load transcript courses.");
        }
      } finally {
        if (alive) {
          setTranscriptLoading(false);
        }
      }
    }

    loadTranscriptCourses();

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
    setDraftError("");
    setCopyStatus("idle");
    setSubject(`Research Opportunity Inquiry — ${prof.name}'s Lab`);
    setEmailBody(emailTemplate(prof));
  }

  function handleClearEmail() {
    setDrafted(null);
    setSubject("");
    setEmailBody("");
    setDraftError("");
    setCopyStatus("idle");
    setResumeFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function handleCopyValue(value: string, target: Exclude<CopyTarget, "idle">, emptyMessage: string) {
    const text = value.trim();

    if (!text) {
      setDraftError(emptyMessage);
      return;
    }

    try {
      await copyTextToClipboard(text);
      setDraftError("");
      setCopyStatus(target);
      window.setTimeout(() => setCopyStatus("idle"), 1800);
    } catch {
      setDraftError("Could not copy the text. Please copy it manually.");
    }
  }

  async function handleAiDraft() {
    if (!drafted) {
      setDraftError("Select a professor first.");
      return;
    }
    if (!resumeFile) {
      setDraftError("Attach your resume PDF before using AI draft.");
      return;
    }
    if (resumeFile.type !== "application/pdf" && !resumeFile.name.toLowerCase().endsWith(".pdf")) {
      setDraftError("Resume must be a PDF file.");
      return;
    }
    if (resumeFile.size > 6 * 1024 * 1024) {
      setDraftError("Resume PDF is too large. Please upload a PDF under 6 MB.");
      return;
    }

    setAiDrafting(true);
    setDraftError("");
    setCopyStatus("idle");

    try {
      const dataBase64 = await fileToBase64(resumeFile);
      const response = await fetch(`${API_URL}/professors/draft-email`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          professor: drafted,
          senderEmail,
          resume: {
            fileName: resumeFile.name,
            mimeType: "application/pdf",
            dataBase64,
          },
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not draft email.");
      }

      setSubject(payload.subject ?? "");
      setEmailBody(payload.body ?? "");
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : "Could not draft email.");
    } finally {
      setAiDrafting(false);
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
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[420px_minmax(0,1fr)_360px] xl:grid-cols-[460px_minmax(0,1fr)_440px] 2xl:grid-cols-[460px_minmax(0,1fr)_500px] gap-5 items-start">

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
                    Compatibility uses your saved transcript courses, grades, professor department subjects, and professor research/course-match keywords. Higher scores mean stronger course relevance and stronger grades in that area.
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
                  const compatibility = compatibilityByProfessor.get(professorKey(prof));

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
                        <CompatibilityBadge
                          result={compatibility}
                          loading={transcriptLoading}
                          error={transcriptError}
                        />
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
                <div className="relative">
                  <input
                    type="email"
                    value={drafted?.email ?? ""}
                    readOnly
                    placeholder="Select a professor to auto-fill"
                    className="w-full text-[13px] pl-3 pr-10 py-2 rounded-lg border border-[#B3C1BB]/40 bg-[#F8F8F6] text-[#1a1a1a] placeholder:text-[#B3C1BB] focus:outline-none"
                  />
                  <FieldCopyButton
                    label="Copy professor email"
                    copied={copyStatus === "email"}
                    disabled={!drafted?.email}
                    onClick={() => handleCopyValue(drafted?.email ?? "", "email", "There is no professor email to copy yet.")}
                  />
                </div>
              </div>

              {/* From */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-[#94AAA1] uppercase tracking-wide">From</label>
                <input
                  type="email"
                  value={senderEmail}
                  onChange={(e) => {
                    setSenderEmail(e.target.value);
                    setCopyStatus("idle");
                  }}
                  placeholder="username@ucdavis.edu"
                  className="text-[13px] px-3 py-2 rounded-lg border border-[#B3C1BB]/40 bg-[#F8F8F6] text-[#1a1a1a] placeholder:text-[#B3C1BB] focus:outline-none focus:border-[#1B3968] focus:ring-1 focus:ring-[#1B3968]/10"
                />
              </div>

              {/* Subject */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-[#94AAA1] uppercase tracking-wide">Subject</label>
                <div className="relative">
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => {
                    setSubject(e.target.value);
                    setCopyStatus("idle");
                  }}
                  placeholder="Email subject…"
                  className="w-full text-[13px] pl-3 pr-10 py-2 rounded-lg border border-[#B3C1BB]/40 bg-[#F8F8F6] text-[#1a1a1a] placeholder:text-[#B3C1BB] focus:outline-none focus:border-[#1B3968] focus:ring-1 focus:ring-[#1B3968]/10"
                />
                  <FieldCopyButton
                    label="Copy subject line"
                    copied={copyStatus === "subject"}
                    disabled={!subject.trim()}
                    onClick={() => handleCopyValue(subject, "subject", "There is no subject line to copy yet.")}
                  />
                </div>
              </div>

              {/* Body */}
              <div className="flex flex-col gap-1 flex-1">
                <label className="text-[11px] font-semibold text-[#94AAA1] uppercase tracking-wide">Body</label>
                <textarea
                  value={emailBody}
                  onChange={(e) => {
                    setEmailBody(e.target.value);
                    setCopyStatus("idle");
                  }}
                  placeholder="Click 'Draft email' on a professor to generate a template…"
                  rows={16}
                  className="min-h-[24rem] text-[12px] px-3 py-2 rounded-lg border border-[#B3C1BB]/40 bg-[#F8F8F6] text-[#1a1a1a] placeholder:text-[#B3C1BB] focus:outline-none focus:border-[#1B3968] focus:ring-1 focus:ring-[#1B3968]/10 resize-none leading-relaxed flex-1"
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
                    onChange={(e) => {
                      setDraftError("");
                      setResumeFile(e.target.files?.[0] ?? null);
                    }}
                  />
                </label>
              </div>

              {draftError && (
                <p className="rounded-lg border border-[#B35C5C]/30 bg-[#FFF5F5] px-3 py-2 text-[11px] leading-relaxed text-[#B35C5C]">
                  {draftError}
                </p>
              )}

              <button
                type="button"
                onClick={handleAiDraft}
                disabled={!drafted || !resumeFile || aiDrafting}
                className="w-full py-2.5 rounded-xl border border-[#1B3968]/20 bg-[#EBF0F6] text-[#1B3968] text-[13px] font-semibold hover:bg-[#DDE8F4] transition-colors disabled:opacity-45 disabled:cursor-not-allowed disabled:hover:bg-[#EBF0F6]"
              >
                {aiDrafting ? "Drafting with Gemini..." : "AI draft with resume"}
              </button>

              {/* Copy body */}
              <button
                type="button"
                onClick={() => handleCopyValue(emailBody, "body", "There is no email body to copy yet.")}
                disabled={!emailBody.trim()}
                className="w-full py-2.5 rounded-xl bg-[#1B3968] text-white text-[13px] font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {copyStatus === "body" ? "Copied body" : "Copy body"}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

