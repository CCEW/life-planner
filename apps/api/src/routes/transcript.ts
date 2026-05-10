import { Router, Request, Response } from "express";
import multer from "multer";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// ─── Heuristic transcript parser (no AI key needed) ──────────────────────────

type ParsedCourse = {
  courseCode: string;
  title: string;
  units: number | null;
  grade: string | null;
  quarter: string | null;
};

// Use /g so matchAll works; lookahead instead of trailing \b so A-/A+/etc. match correctly.
// Standalone "I" removed — it false-positives on titles like "CIRCUITS I".
const GRADE_PATTERN = /\b(A[+-]?|B[+-]?|C[+-]?|D[+-]?|NP|P|F|W|IP|In\s+Prog(?:ress)?)(?=\s|$|\r)/gi;

function normalizeGrade(raw: string): string {
  const lower = raw.toLowerCase().replace(/\s+/g, " ").trim();
  if (lower.startsWith("in prog")) return "IP";
  return raw.toUpperCase();
}
const COURSE_CODE   = /\b([A-Z]{2,4})\s+(\d{2,3}[A-Z]?(?:-[A-Z]?)?)\b/;
const QUARTER_HDR   = /(FALL|WINTER|SPRING|SUMMER)\s+(?:QUARTER\s+)?(\d{4})/i;
const IN_PROGRESS_HDR = /\bIN\s*PROGRESS\b/i;

function formatQuarter(season: string, year: string): string {
  return `${season.charAt(0) + season.slice(1).toLowerCase()} ${year}`;
}

function deduplicateCourses(courses: ParsedCourse[]): ParsedCourse[] {
  // Group by courseCode+grade; if same course appears both with and without a quarter
  // (summary vs per-quarter section), keep only the entries that have a quarter.
  const groups = new Map<string, ParsedCourse[]>();
  for (const c of courses) {
    const key = `${c.courseCode}|${c.grade}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(c);
  }

  const result: ParsedCourse[] = [];
  for (const entries of groups.values()) {
    const withQ    = entries.filter((e) => e.quarter !== null);
    const withoutQ = entries.filter((e) => e.quarter === null);
    // If the same course appears both ways, the null-quarter ones are summary duplicates
    if (withQ.length > 0 && withoutQ.length > 0) {
      result.push(...withQ);
    } else {
      result.push(...entries);
    }
  }
  return result;
}

function parseTranscript(text: string): ParsedCourse[] {
  const courses: ParsedCourse[] = [];
  let currentQuarter: string | null = null;
  let inProgressSection = false;
  let inProgressQuarter: string | null = null; // pinned when section first detected

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    // Detect quarter header first so inProgressQuarter captures the correct quarter
    const qm = line.match(QUARTER_HDR);
    if (qm) currentQuarter = formatQuarter(qm[1], qm[2]);

    // Detect "IN PROGRESS" / "WORK IN PROGRESS" section header; pin the quarter once.
    if (IN_PROGRESS_HDR.test(line)) {
      inProgressSection = true;
      if (inProgressQuarter === null) inProgressQuarter = currentQuarter;
    }

    // Must contain a course code to be a course row
    const cm = line.match(COURSE_CODE);
    if (!cm) continue;

    // Take the LAST grade match on the line so "CIRCUITS I A-" picks "A-" not "I"
    GRADE_PATTERN.lastIndex = 0;
    let gm: RegExpExecArray | null = null;
    let _m: RegExpExecArray | null = null;
    while ((_m = GRADE_PATTERN.exec(line)) !== null) gm = _m;

    // Skip lines with no grade unless we're in an "in progress" section
    if (!gm && !inProgressSection) continue;

    const courseCode = `${cm[1]} ${cm[2]}`;

    // Everything between the course code end and the grade is title + units
    const codeEnd = line.indexOf(cm[0]) + cm[0].length;
    const gradeStart = gm ? gm.index! : line.length;
    const afterCode = line.slice(codeEnd, gradeStart).trim();

    // Pull units out of that middle segment
    const um = afterCode.match(/\b(\d+\.?\d*)\b/g) ?? [];
    const units = um.length > 0 ? parseFloat(um[um.length - 1]) : null;

    // Title is whatever's left once we strip the units number
    const title = afterCode.replace(/\s*\b\d+\.?\d*\b\s*$/, "").trim() || courseCode;

    // Ignore obviously bad rows (e.g. GPA lines that accidentally match)
    if (units !== null && (units < 0.5 || units > 10)) continue;

    const grade = gm ? normalizeGrade(gm[1]) : "IP";
    // IP courses use the pinned inProgressQuarter; graded courses use currentQuarter
    const quarter = (grade === "IP") ? (inProgressQuarter ?? currentQuarter) : currentQuarter;
    courses.push({ courseCode, title, units, grade, quarter });
  }

  return deduplicateCourses(courses);
}

// POST /api/transcript/upload
router.post(
  "/api/transcript/upload",
  upload.single("transcript"),
  async (req: Request, res: Response) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const file = (req as any).file as { buffer: Buffer } | undefined;
    if (!file) {
      res.status(400).json({ error: "No PDF file provided." });
      return;
    }

    try {
      // pdf-parse ships without TS types; require() avoids the import error
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;
      const { text } = await pdfParse(file.buffer);
      const courses = parseTranscript(text);
      res.json({ courses });
    } catch (err) {
      console.error("[transcript error]", err);
      res.status(500).json({ error: "Failed to parse transcript." });
    }
  }
);

export default router;
