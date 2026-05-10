import { Router, Request, Response } from "express";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";
import { auditMajorRequirements } from "../lib/majorAudit";

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
}

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// ─── Types ────────────────────────────────────────────────────────────────────

type ParsedCourse = {
  courseCode: string;
  title: string;
  units: number | null;
  grade: string | null;
  quarter: string | null;
  geCategories: string[];
  writingCategories: string[];
};

type ParsedTranscript = {
  major: string | null;
  courses: ParsedCourse[];
};

// ─── Claude vision parser ─────────────────────────────────────────────────────

async function parseWithClaude(pdfBuffer: Buffer): Promise<ParsedTranscript> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
  const Anthropic = (require("@anthropic-ai/sdk") as any).default ?? require("@anthropic-ai/sdk");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client: any = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: pdfBuffer.toString("base64"),
            },
          } as never,
          {
            type: "text",
            text: `Extract the student's declared major and every course from this UC Davis transcript. Return ONLY a valid JSON object — no markdown, no explanation.

The object must have:
{
  "major": major name string exactly as written on the transcript, or null if not present,
  "courses": [...]
}

Each course object must have:
  "courseCode": "DEPT NNN" (e.g. "EEC 161", "MUS 141")
  "title": full course title string
  "units": number (e.g. 4) or null
  "grade": letter grade (e.g. "A+", "A-", "B", "P", "NP") or "IP" for in-progress courses, or null
  "quarter": season + year string (e.g. "Fall 2024", "Winter 2025", "Summer 2023", "Spring 2026") or null

Rules:
- Include ALL courses including in-progress ones (grade = "IP").
- For summer sessions (e.g. "SUMMER SESSION 2 2023") use "Summer 2023" as the quarter.
- Courses listed under "WORK IN PROGRESS" or "IN PROGRESS" get grade "IP".
- Handle two-column layouts correctly by reading each column top-to-bottom.`,
          },
        ],
      },
    ],
  });

  const raw = response.content[0].type === "text" ? response.content[0].text : "";
  const objectMatch = raw.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    const parsed = JSON.parse(objectMatch[0]) as ParsedTranscript;
    return { major: parsed.major ?? null, courses: parsed.courses ?? [] };
  }
  const arrayMatch = raw.match(/\[[\s\S]*\]/);
  if (!arrayMatch) throw new Error("Claude returned no transcript JSON");
  return { major: null, courses: JSON.parse(arrayMatch[0]) as ParsedCourse[] };
}

// ─── Heuristic fallback parser ────────────────────────────────────────────────

// Use /g so exec loop works; lookahead instead of trailing \b so A-/A+/etc. match correctly.
const GRADE_PATTERN = /\b(A[+-]?|B[+-]?|C[+-]?|D[+-]?|NP|P|F|W|IP|In\s+Prog(?:ress)?)(?=\s|$|\r)/gi;

function normalizeGrade(raw: string): string {
  const lower = raw.toLowerCase().replace(/\s+/g, " ").trim();
  if (lower.startsWith("in prog")) return "IP";
  return raw.toUpperCase();
}

const COURSE_CODE     = /\b([A-Z]{2,4})\s+(\d{2,3}[A-Z]?(?:-[A-Z]?)?)\b/;
const QUARTER_HDR     = /(FALL|WINTER|SPRING|SUMMER)\s+(?:QUARTER\s+)?(\d{4})/i;
const IN_PROGRESS_HDR = /\bIN\s*PROGRESS\b/i;

function formatQuarter(season: string, year: string): string {
  return `${season.charAt(0) + season.slice(1).toLowerCase()} ${year}`;
}

function deduplicateCourses(courses: ParsedCourse[]): ParsedCourse[] {
  const groups = new Map<string, ParsedCourse[]>();
  for (const c of courses) {
    const key = `${c.courseCode}|${c.grade}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(c);
  }
  const result: ParsedCourse[] = [];
  for (const entries of groups.values()) {
    const withQ    = entries.filter((e) => e.quarter !== null);
    const withoutQ = entries.filter((e) => e.quarter === null);
    if (withQ.length > 0 && withoutQ.length > 0) result.push(...withQ);
    else result.push(...entries);
  }
  return result;
}

function parseMajorHeuristic(text: string): string | null {
  for (const rawLine of text.split("\n").slice(0, 80)) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    const currentMajorMatch = line.match(/\bCURRENT\s+MAJOR(?:\(S\))?\s*:?\s*([A-Za-z][A-Za-z\s&-]{2,80})/i);
    if (currentMajorMatch) return currentMajorMatch[1].trim();

    const match = line.match(/\b(?:Major|Program|Plan)\b\s*:?\s*([A-Za-z][A-Za-z\s&-]{2,80})/i);
    if (!match) continue;
    const major = match[1]
      .replace(/\b(?:Degree|College|Class|Level|Catalog|Term|Minor)\b.*$/i, "")
      .trim();
    if (major.length > 2) return major;
  }
  return null;
}

function parseTranscriptHeuristic(text: string): ParsedTranscript {
  const courses: ParsedCourse[] = [];
  let currentQuarter: string | null = null;
  let inProgressSection = false;
  let inProgressQuarter: string | null = null;

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    // Quarter header first so inProgressQuarter captures the right value
    const qm = line.match(QUARTER_HDR);
    if (qm) currentQuarter = formatQuarter(qm[1], qm[2]);

    if (IN_PROGRESS_HDR.test(line)) {
      inProgressSection = true;
      if (inProgressQuarter === null) inProgressQuarter = currentQuarter;
    }

    const cm = line.match(COURSE_CODE);
    if (!cm) continue;

    GRADE_PATTERN.lastIndex = 0;
    let gm: RegExpExecArray | null = null;
    let _m: RegExpExecArray | null = null;
    while ((_m = GRADE_PATTERN.exec(line)) !== null) gm = _m;

    if (!gm && !inProgressSection) continue;

    const courseCode = `${cm[1]} ${cm[2]}`;
    const codeEnd    = line.indexOf(cm[0]) + cm[0].length;
    const gradeStart = gm ? gm.index! : line.length;
    const afterCode  = line.slice(codeEnd, gradeStart).trim();

    const um    = afterCode.match(/\b(\d+\.?\d*)\b/g) ?? [];
    const units = um.length > 0 ? parseFloat(um[um.length - 1]) : null;
    const title = afterCode.replace(/\s*\b\d+\.?\d*\b\s*$/, "").trim() || courseCode;

    if (units !== null && (units < 0.5 || units > 10)) continue;

    const grade   = gm ? normalizeGrade(gm[1]) : "IP";
    const quarter = (grade === "IP") ? (inProgressQuarter ?? currentQuarter) : currentQuarter;
    courses.push({ courseCode, title, units, grade, quarter, geCategories: [], writingCategories: [] });
  }

  return { major: parseMajorHeuristic(text), courses: deduplicateCourses(courses) };
}

// ─── Route ────────────────────────────────────────────────────────────────────

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

    const hasKey = process.env.ANTHROPIC_API_KEY &&
                   process.env.ANTHROPIC_API_KEY !== "your-anthropic-api-key-here";

    try {
      let parsed: ParsedTranscript;

      if (hasKey) {
        console.log("[transcript] Using Claude vision parser");
        parsed = await parseWithClaude(file.buffer);
      } else {
        console.log("[transcript] Using heuristic parser (no ANTHROPIC_API_KEY)");
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;
        const { text } = await pdfParse(file.buffer);
        parsed = parseTranscriptHeuristic(text);
      }

      // Enrich with GE / writing data from the Course table
      const courses = parsed.courses;
      const codes = courses.map((c) => c.courseCode);
      const { data: dbCourses } = await getSupabase()
        .from("Course")
        .select("courseCode, geCategories, writingCategories")
        .in("courseCode", codes);

      if (dbCourses) {
        const lookup = new Map(dbCourses.map((r: { courseCode: string; geCategories: string[]; writingCategories: string[] }) => [r.courseCode, r]));
        for (const c of courses) {
          const match = lookup.get(c.courseCode);
          if (match) {
            c.geCategories = match.geCategories ?? [];
            c.writingCategories = match.writingCategories ?? [];
          }
        }
      }

      let majorAudit = null;
      try {
        majorAudit = await auditMajorRequirements(getSupabase(), courses, parsed.major);
      } catch (auditErr) {
        console.error("[major audit error]", auditErr);
      }

      res.json({ courses, major: parsed.major, majorAudit, method: hasKey ? "claude" : "heuristic" });
    } catch (err) {
      console.error("[transcript error]", err);
      res.status(500).json({ error: "Failed to parse transcript." });
    }
  }
);

export default router;
