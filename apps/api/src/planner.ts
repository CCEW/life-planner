import { execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

type Units = [number | null, number | null];

type TranscriptCourse = {
  subject: string;
  number: string;
  key: string;
  displayCode: string;
  title: string;
  grade: string | null;
  units: number;
  status: "completed" | "in_progress";
};

type CatalogCourse = {
  course_subject_code: string;
  course_number: string;
  units: Units;
  GE: string[];
  writing: string[];
  grade_mode: string | null;
};

type OfferedClass = {
  course_subject_code: string;
  course_number: string;
  course_code: string;
  section: string;
  crn: string | null;
  title: string;
  GE: string[];
  writing: string[];
  instructors: string[];
  units: Units;
  units_text: string | null;
  meetings: { time_days: string | null }[];
};

type RequirementResult = {
  id: string;
  title: string;
  status: "complete" | "in_progress" | "missing";
  required: string;
  completedCourses: TranscriptCourse[];
  inProgressCourses: TranscriptCourse[];
  missing: string[];
  suggestions: OfferedClass[];
};

type GeBucket = {
  code: string;
  name: string;
  requiredUnits: number;
  earnedUnits: number;
  missingUnits: number;
  courses: TranscriptCourse[];
  suggestions: OfferedClass[];
  notes?: string[];
};

type PlannerData = {
  catalog: Map<string, CatalogCourse>;
  offered: OfferedClass[];
};

const TOPICAL = [
  ["AH", "Arts & Humanities"],
  ["SE", "Science & Engineering"],
  ["SS", "Social Sciences"],
] as const;

const NON_GE_COURSES = new Set(["MUS 141", "MUS 146", "MUS 131E", "UWP 7M", "UWP 22"]);

const GE_REQUIREMENT_RULES = {
  topicalBreadth: {
    totalUnits: 52,
    areas: {
      AH: { name: "Arts & Humanities", minUnits: 12, maxUnits: 20 },
      SE: { name: "Science & Engineering", minUnits: 12, maxUnits: 20 },
      SS: { name: "Social Sciences", minUnits: 12, maxUnits: 20 },
    },
    rule: "A course certified in more than one Topical Breadth area may count units in only one area.",
  },
  coreLiteracies: {
    totalUnits: 35,
    literacyWithWordsAndImages: {
      totalUnits: 20,
      englishComposition: { units: 8, source: "College-specific English Composition requirement; tracked separately for Engineering." },
      writingExperience: { code: "WE", minUnits: 6 },
      oralOrExtraWriting: { codes: ["OL", "WE"], minUnits: 3 },
      visualLiteracy: { code: "VL", minUnits: 3 },
      weOrOlCombined: {
        minUnits: 9,
        minWritingExperienceUnits: 6,
        rule: "At least 6 of the 9 WE/OL units must be Writing Experience (WE); the remainder may be WE or Oral Skills (OL).",
      },
    },
    civicAndCulturalLiteracy: {
      totalUnits: 9,
      ACGH: { minUnits: 3 },
      DD: { minUnits: 3 },
      WC: { minUnits: 3 },
    },
    QL: { minUnits: 3 },
    SL: { minUnits: 3 },
    rule: "A course certified in more than one Core Literacy area may count units in only one core literacy area.",
  },
  excludedFromGeByLocalPolicy: [...NON_GE_COURSES],
};

const CORE_LITERACY_REQUIREMENTS = [
  ["WE_OR_OL", "Writing Experience or Oral Skills", 9],
  ["VL", "Visual Literacy", 3],
  ["ACGH", "American Cultures, Governance, & History", 3],
  ["DD", "Domestic Diversity", 3],
  ["WC", "World Cultures", 3],
  ["QL", "Quantitative Literacy", 3],
  ["SL", "Scientific Literacy", 3],
] as const;

const LOWER_COMPOSITION = ["ENL 3", "UWP 1", "COM 1", "COM 2", "COM 3", "COM 4", "NAS 5"];
const COMMUNICATION = ["CMN 1", "CMN 1V", "ENG 3", "ENG 3Y"];

const UPPER_CORE = ["ENG 190", "EEC 100", "EEC 110A", "EEC 130A", "EEC 140A", "EEC 150", "EEC 161", "EEC 196"];
const CORE_ELECTIVES_PRIMARY = ["EEC 110B", "EEC 130B", "EEC 140B", "EEC 170", "EEC 180"];
const CORE_ELECTIVES_LIMIT_ONE = ["EEC 151", "EEC 157A", "EEC 160"];
const DESIGN_LABS = [
  "EEC 110B",
  "EEC 112",
  "EEC 113",
  "EEC 116",
  "EEC 118",
  "EEC 132A",
  "EEC 132B",
  "EEC 132C",
  "EEC 133",
  "EEC 146A",
  "EEC 157B",
  "EEC 165",
  "EEC 172",
  "EEC 180",
  "EEC 136A",
  "EEC 136B",
  "EEC 174AY",
  "EEC 174BY",
  "EEC 181A",
  "EEC 181B",
  "EEC 193A",
  "EEC 193B",
  "EEC 195A",
  "EEC 195B",
];
const SENIOR_DESIGN_SEQUENCES = [
  ["EEC 134A", "EEC 134B"],
  ["EEC 136A", "EEC 136B"],
  ["EEC 174AY", "EEC 174BY"],
  ["EEC 175A", "EEC 175B"],
  ["EEC 181A", "EEC 181B"],
  ["EEC 193A", "EEC 193B"],
  ["EEC 195A", "EEC 195B"],
];
const ECS_ADDITIONAL = ["ECS 150", "ECS 152B", "ECS 163", "ECS 175", "ECS 177", "ECS 178"];

function compactWhitespace(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeNumber(number: string): string {
  const match = number.match(/^0*([0-9]+)([A-Z]*)$/i);
  if (!match) return number.toUpperCase();
  return `${Number(match[1])}${match[2].toUpperCase()}`;
}

function normalizeCourseKey(subject: string, number: string): string {
  return `${subject.toUpperCase()} ${normalizeNumber(number)}`;
}

function parseUnits(value: string): number {
  return Number.parseFloat(value.replace(/^\./, "0."));
}

function isPassingGrade(grade: string): boolean {
  return !["F", "NP", "U", "W", "I"].includes(grade);
}

function isLetterGrade(grade: string | null): boolean {
  return !!grade && /^[ABCDF][+-]?$/.test(grade);
}

function courseNumberValue(number: string): number {
  const match = normalizeNumber(number).match(/^([0-9]+)/);
  return match ? Number(match[1]) : 999;
}

function parseTranscriptText(text: string): { completed: TranscriptCourse[]; inProgress: TranscriptCourse[]; rawText: string } {
  const normalized = text.replace(/\r/g, "\n");
  const completed = new Map<string, TranscriptCourse>();
  const completedPattern =
    /\b([A-Z]{2,4})\s+([0-9]{1,3}[A-Z]{0,3})\s+(.{3,70}?)\s+(A\+|A-|A|B\+|B-|B|C\+|C-|C|D\+|D-|D|P|S|NP|U|F)\s+(\d+\.\d{2})\s+(-?\d*\.\d{2})/g;

  for (const match of normalized.matchAll(completedPattern)) {
    const [, subject, number, title, grade, unitsText] = match;
    if (!isPassingGrade(grade)) continue;
    const key = normalizeCourseKey(subject, number);
    const course: TranscriptCourse = {
      subject: subject.toUpperCase(),
      number: normalizeNumber(number),
      key,
      displayCode: key,
      title: compactWhitespace(title),
      grade,
      units: parseUnits(unitsText),
      status: "completed",
    };
    const previous = completed.get(key);
    if (!previous || course.units >= previous.units) completed.set(key, course);
  }

  const inProgress = new Map<string, TranscriptCourse>();
  const workSections = normalized.split(/WORK IN PROGRESS:|IN PROGRESS WORK CONTINUED:/i).slice(1);
  const workText = workSections.join("\n").split(/IN PROGRESS CREDITS|TRANSCRIPT TOTALS/i)[0] ?? "";
  const inProgressPattern = /\b([A-Z]{2,4})\s+([0-9]{1,3}[A-Z]{0,3})\s+(.{3,70}?)\s+(\d+\.\d{2})/g;
  for (const match of workText.matchAll(inProgressPattern)) {
    const [, subject, number, title, unitsText] = match;
    const key = normalizeCourseKey(subject, number);
    if (completed.has(key)) continue;
    inProgress.set(key, {
      subject: subject.toUpperCase(),
      number: normalizeNumber(number),
      key,
      displayCode: key,
      title: compactWhitespace(title),
      grade: null,
      units: parseUnits(unitsText),
      status: "in_progress",
    });
  }

  return { completed: [...completed.values()], inProgress: [...inProgress.values()], rawText: normalized };
}

function findDataFile(fileName: string): string {
  const candidates = [
    path.resolve(__dirname, "../../../packages/db", fileName),
    path.resolve(process.cwd(), "packages/db", fileName),
    path.resolve(process.cwd(), "../../packages/db", fileName),
    path.resolve(process.cwd(), "../ucdavis_scraper", fileName),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error(`Missing data file: ${fileName}`);
  return found;
}

function loadPlannerData(): PlannerData {
  const catalogPath = findDataFile("undergrad_courses_all_with_ge.json");
  const offeredPathCandidates = ["undergraduate_offered_classes_202610.json", "offered_classes_202610.json", "eec_offered_classes_202610.json"];
  const offeredPath = offeredPathCandidates.map((file) => {
    try {
      return findDataFile(file);
    } catch {
      return null;
    }
  }).find(Boolean);

  const catalogPayload = JSON.parse(fs.readFileSync(catalogPath, "utf-8")) as CatalogCourse[];
  const catalog = new Map<string, CatalogCourse>();
  for (const course of catalogPayload) {
    catalog.set(normalizeCourseKey(course.course_subject_code, course.course_number), course);
  }

  const offered: OfferedClass[] = [];
  if (offeredPath) {
    const offeredPayload = JSON.parse(fs.readFileSync(offeredPath, "utf-8"));
    for (const subject of offeredPayload.subjects ?? []) {
      offered.push(...(subject.classes ?? []));
    }
  }

  return { catalog, offered };
}

function pickCourses(keys: string[], completed: Map<string, TranscriptCourse>, inProgress: Map<string, TranscriptCourse>) {
  return {
    completed: keys.map((key) => completed.get(key)).filter(Boolean) as TranscriptCourse[],
    inProgress: keys.map((key) => inProgress.get(key)).filter(Boolean) as TranscriptCourse[],
  };
}

function suggestSpecificCourses(data: PlannerData, allowedKeys: string[], completed: Set<string>, limit = 8): OfferedClass[] {
  const allowed = new Set(allowedKeys);
  const suggestions: OfferedClass[] = [];
  for (const offered of data.offered) {
    const key = normalizeCourseKey(offered.course_subject_code, offered.course_number);
    if (!allowed.has(key) || completed.has(key)) continue;
    if (!suggestions.some((item) => item.course_code === offered.course_code && item.section === offered.section)) {
      suggestions.push(offered);
    }
    if (suggestions.length >= limit) break;
  }
  return suggestions;
}

function requirementResult(params: {
  id: string;
  title: string;
  required: string;
  completedCourses: TranscriptCourse[];
  inProgressCourses?: TranscriptCourse[];
  complete: boolean;
  inProgress?: boolean;
  missing: string[];
  suggestions?: OfferedClass[];
}): RequirementResult {
  return {
    id: params.id,
    title: params.title,
    required: params.required,
    status: params.complete ? "complete" : params.inProgress ? "in_progress" : "missing",
    completedCourses: params.completedCourses,
    inProgressCourses: params.inProgressCourses ?? [],
    missing: params.complete ? [] : params.missing,
    suggestions: params.suggestions ?? [],
  };
}

function checkExactGroup(
  id: string,
  title: string,
  keys: string[],
  completed: Map<string, TranscriptCourse>,
  inProgress: Map<string, TranscriptCourse>,
  data: PlannerData,
): RequirementResult {
  const picked = pickCourses(keys, completed, inProgress);
  const missing = keys.filter((key) => !completed.has(key));
  const missingAfterProgress = keys.filter((key) => !completed.has(key) && !inProgress.has(key));
  return requirementResult({
    id,
    title,
    required: `${keys.length} courses`,
    completedCourses: picked.completed,
    inProgressCourses: picked.inProgress,
    complete: missing.length === 0,
    inProgress: missing.length > 0 && missingAfterProgress.length === 0,
    missing,
    suggestions: suggestSpecificCourses(data, missingAfterProgress, new Set(completed.keys())),
  });
}

function upperCompositionKeys(courses: TranscriptCourse[]): string[] {
  return courses
    .filter((course) => {
      if (course.subject !== "UWP") return false;
      const number = course.number;
      if (number === "101") return true;
      if (/^102[A-L]$/.test(number)) return true;
      return /^104[A-T]$/.test(number);
    })
    .map((course) => course.key);
}

function checkElectricalEngineeringRequirements(
  completedCourses: TranscriptCourse[],
  inProgressCourses: TranscriptCourse[],
  data: PlannerData,
): { sections: { title: string; requirements: RequirementResult[] }[]; summary: { complete: number; inProgress: number; missing: number } } {
  const completed = new Map(completedCourses.map((course) => [course.key, course]));
  const inProgress = new Map(inProgressCourses.map((course) => [course.key, course]));
  const completedKeys = new Set(completed.keys());

  const lower: RequirementResult[] = [
    checkExactGroup("math", "Math", ["MAT 21A", "MAT 21B", "MAT 21C", "MAT 21D", "MAT 22A", "MAT 22B"], completed, inProgress, data),
    checkExactGroup("physics", "Physics", ["PHY 9A", "PHY 9B", "PHY 9C", "PHY 9D"], completed, inProgress, data),
    (() => {
      const keys = ["CHE 2A", "CHE 2AH"];
      const picked = pickCourses(keys, completed, inProgress);
      return requirementResult({
        id: "chemistry",
        title: "Chemistry",
        required: "CHE 2A or CHE 2AH",
        completedCourses: picked.completed.slice(0, 1),
        inProgressCourses: picked.inProgress.slice(0, 1),
        complete: picked.completed.length > 0,
        inProgress: picked.completed.length === 0 && picked.inProgress.length > 0,
        missing: ["CHE 2A or CHE 2AH"],
        suggestions: suggestSpecificCourses(data, keys, completedKeys),
      });
    })(),
    checkExactGroup("engineering", "Lower Division Engineering", ["EEC 1", "EEC 7", "EEC 10", "EEC 18", "ENG 6", "ENG 17"], completed, inProgress, data),
    (() => {
      const lowerComp = pickCourses(LOWER_COMPOSITION, completed, inProgress);
      const upperCompletedKeys = upperCompositionKeys(completedCourses);
      const upperProgressKeys = upperCompositionKeys(inProgressCourses);
      const upperCompleted = upperCompletedKeys.map((key) => completed.get(key)).filter(Boolean) as TranscriptCourse[];
      const upperProgress = upperProgressKeys.map((key) => inProgress.get(key)).filter(Boolean) as TranscriptCourse[];
      const complete = lowerComp.completed.length > 0 && upperCompleted.length > 0;
      const progress = !complete && (lowerComp.completed.length + lowerComp.inProgress.length > 0) && (upperCompleted.length + upperProgress.length > 0);
      return requirementResult({
        id: "composition",
        title: "Composition",
        required: "One lower composition course and one upper-division UWP course",
        completedCourses: [...lowerComp.completed.slice(0, 1), ...upperCompleted.slice(0, 1)],
        inProgressCourses: [...lowerComp.inProgress.slice(0, 1), ...upperProgress.slice(0, 1)],
        complete,
        inProgress: progress,
        missing: [
          ...(lowerComp.completed.length ? [] : ["Lower composition: ENL 3, UWP 1, COM 1-4, or NAS 5"]),
          ...(upperCompleted.length ? [] : ["Upper composition: UWP 101, 102A-L, or 104A-T"]),
        ],
        suggestions: suggestSpecificCourses(data, [...LOWER_COMPOSITION, "UWP 101", "UWP 102A", "UWP 102B", "UWP 102E"], completedKeys),
      });
    })(),
    (() => {
      const picked = pickCourses(COMMUNICATION, completed, inProgress);
      return requirementResult({
        id: "communication",
        title: "Communication",
        required: "CMN 1 or ENG 3",
        completedCourses: picked.completed.slice(0, 1),
        inProgressCourses: picked.inProgress.slice(0, 1),
        complete: picked.completed.length > 0,
        inProgress: picked.completed.length === 0 && picked.inProgress.length > 0,
        missing: ["CMN 1 or ENG 3"],
        suggestions: suggestSpecificCourses(data, COMMUNICATION, completedKeys),
      });
    })(),
  ];

  const upper: RequirementResult[] = [
    checkExactGroup("upper-core", "Upper Division Core", UPPER_CORE, completed, inProgress, data),
    (() => {
      const eligible = completedCourses.filter((course) => {
        const number = courseNumberValue(course.number);
        if (number < 100) return false;
        if (["CHE", "ENG", "MAT", "PHY", "STA"].includes(course.subject)) return !UPPER_CORE.includes(course.key);
        return false;
      });
      const units = eligible.reduce((sum, course) => sum + course.units, 0);
      return requirementResult({
        id: "technical-electives",
        title: "Technical Electives",
        required: "9 units",
        completedCourses: eligible,
        complete: units >= 9,
        missing: [`${Math.max(0, 9 - units)} more units`],
      });
    })(),
  ];

  const corePrimary = CORE_ELECTIVES_PRIMARY.map((key) => completed.get(key)).filter(Boolean) as TranscriptCourse[];
  const coreLimitOne = CORE_ELECTIVES_LIMIT_ONE.map((key) => completed.get(key)).filter(Boolean) as TranscriptCourse[];
  const selectedCoreElectives = [...corePrimary, ...coreLimitOne.slice(0, 1)].slice(0, 2);
  const coreProgress = [...CORE_ELECTIVES_PRIMARY, ...CORE_ELECTIVES_LIMIT_ONE].map((key) => inProgress.get(key)).filter(Boolean) as TranscriptCourse[];
  const designCompleted = DESIGN_LABS.map((key) => completed.get(key)).filter(Boolean) as TranscriptCourse[];
  const designProgress = DESIGN_LABS.map((key) => inProgress.get(key)).filter(Boolean) as TranscriptCourse[];
  const seniorCompletedSequence = SENIOR_DESIGN_SEQUENCES.find((sequence) => sequence.every((key) => completed.has(key)));
  const seniorProgressSequence = SENIOR_DESIGN_SEQUENCES.find((sequence) => sequence.every((key) => completed.has(key) || inProgress.has(key)));
  const upperElectivePool = completedCourses.filter((course) => {
    const isEec = course.subject === "EEC" && courseNumberValue(course.number) >= 100 && !UPPER_CORE.includes(course.key);
    const isEcs = ECS_ADDITIONAL.includes(course.key);
    return isLetterGrade(course.grade) && (isEec || isEcs);
  });
  const upperElectiveUnits = upperElectivePool.reduce((sum, course) => sum + course.units, 0);

  const udElectives: RequirementResult[] = [
    requirementResult({
      id: "core-electives",
      title: "Core Electives",
      required: "2 courses",
      completedCourses: selectedCoreElectives,
      inProgressCourses: coreProgress,
      complete: selectedCoreElectives.length >= 2,
      inProgress: selectedCoreElectives.length + coreProgress.length >= 2,
      missing: [`${Math.max(0, 2 - selectedCoreElectives.length)} more core elective course(s)`],
      suggestions: suggestSpecificCourses(data, [...CORE_ELECTIVES_PRIMARY, ...CORE_ELECTIVES_LIMIT_ONE], completedKeys),
    }),
    requirementResult({
      id: "design-labs",
      title: "Design Laboratory Electives",
      required: "2 courses",
      completedCourses: designCompleted.slice(0, 2),
      inProgressCourses: designProgress.slice(0, 2),
      complete: designCompleted.length >= 2,
      inProgress: designCompleted.length + designProgress.length >= 2,
      missing: [`${Math.max(0, 2 - designCompleted.length)} more design lab course(s)`],
      suggestions: suggestSpecificCourses(data, DESIGN_LABS, completedKeys),
    }),
    requirementResult({
      id: "senior-design",
      title: "Senior Design Project",
      required: "One approved A/B sequence",
      completedCourses: seniorCompletedSequence?.map((key) => completed.get(key)).filter(Boolean) as TranscriptCourse[] ?? [],
      inProgressCourses: seniorProgressSequence?.map((key) => inProgress.get(key)).filter(Boolean) as TranscriptCourse[] ?? [],
      complete: !!seniorCompletedSequence,
      inProgress: !seniorCompletedSequence && !!seniorProgressSequence,
      missing: ["One full senior design sequence, such as EEC 174AY + EEC 174BY"],
      suggestions: suggestSpecificCourses(data, SENIOR_DESIGN_SEQUENCES.flat(), completedKeys),
    }),
    requirementResult({
      id: "additional-electives",
      title: "Additional Electives",
      required: "3 additional courses",
      completedCourses: upperElectivePool.slice(0, 3),
      complete: upperElectivePool.length >= 3,
      missing: [`${Math.max(0, 3 - upperElectivePool.length)} more additional elective course(s)`],
      suggestions: data.offered
        .filter((course) => {
          const key = normalizeCourseKey(course.course_subject_code, course.course_number);
          return !completedKeys.has(key) && (course.course_subject_code === "EEC" || ECS_ADDITIONAL.includes(key));
        })
        .slice(0, 8),
    }),
    requirementResult({
      id: "upper-electives-total",
      title: "Upper Division Electives Total",
      required: "8 courses and 32 units",
      completedCourses: upperElectivePool,
      complete: upperElectivePool.length >= 8 && upperElectiveUnits >= 32,
      missing: [
        `${Math.max(0, 8 - upperElectivePool.length)} more course(s)`,
        `${Math.max(0, 32 - upperElectiveUnits)} more unit(s)`,
      ],
    }),
  ];

  const all = [...lower, ...upper, ...udElectives];
  return {
    sections: [
      { title: "Lower Division Requirements", requirements: lower },
      { title: "Upper Division Requirements", requirements: upper },
      { title: "Upper Division Electives", requirements: udElectives },
    ],
    summary: {
      complete: all.filter((item) => item.status === "complete").length,
      inProgress: all.filter((item) => item.status === "in_progress").length,
      missing: all.filter((item) => item.status === "missing").length,
    },
  };
}

function catalogCourseFor(course: TranscriptCourse, catalog: Map<string, CatalogCourse>): CatalogCourse | undefined {
  return catalog.get(course.key);
}

function isCompositionCourse(course: TranscriptCourse): boolean {
  return LOWER_COMPOSITION.includes(course.key) || upperCompositionKeys([course]).includes(course.key);
}

function isGeEligible(course: TranscriptCourse, catalog: CatalogCourse | undefined): boolean {
  if (!catalog) return false;
  if (NON_GE_COURSES.has(course.key)) return false;
  if (isCompositionCourse(course)) return false;
  return true;
}

function geSuggestions(data: PlannerData, code: string, completedKeys: Set<string>, limit = 8): OfferedClass[] {
  return data.offered
    .filter((course) => {
      const key = normalizeCourseKey(course.course_subject_code, course.course_number);
      if (completedKeys.has(key)) return false;
      if (["AH", "SE", "SS"].includes(code)) return course.GE?.includes(code);
      if (code === "WE_OR_OL") return course.writing?.includes("OL") || course.writing?.includes("WE");
      return course.writing?.includes(code);
    })
    .slice(0, limit);
}

function preferredTopicalArea(course: TranscriptCourse, options: string[]): string | null {
  if (course.subject === "MUS" && options.includes("AH")) return "AH";
  if (["ECN", "MGT"].includes(course.subject) && options.includes("SS")) return "SS";
  if (course.key === "ENG 190" && options.includes("SS")) return "SS";
  if (["EEC", "ENG", "MAT", "PHY", "CHE"].includes(course.subject) && options.includes("SE")) return "SE";
  return null;
}

const TOPICAL_PREFERRED_KEYS: Record<string, string[]> = {
  AH: ["MUS 3A", "MUS 11"],
  SE: ["EEC 196", "ENG 6", "ENG 17", "MAT 21A", "MAT 21B", "ENG 3Y", "EEC 1", "EEC 7", "EEC 10", "EEC 18"],
  SS: ["ECN 1A", "ECN 1B", "ENG 190", "MGT 11A"],
};

function sortByTopicalPreference(code: string, courses: TranscriptCourse[]): TranscriptCourse[] {
  const preferred = TOPICAL_PREFERRED_KEYS[code] ?? [];
  return [...courses].sort((a, b) => {
    const aIndex = preferred.includes(a.key) ? preferred.indexOf(a.key) : Number.MAX_SAFE_INTEGER;
    const bIndex = preferred.includes(b.key) ? preferred.indexOf(b.key) : Number.MAX_SAFE_INTEGER;
    if (aIndex !== bIndex) return aIndex - bIndex;
    return a.key.localeCompare(b.key);
  });
}

const CORE_PREFERRED_KEYS: Record<string, string[]> = {
  VL: ["ENG 17", "MUS 11"],
  ACGH: ["ECN 1A", "ECN 1B"],
  DD: [],
  WC: ["MUS 11"],
  QL: ["MAT 21B", "MAT 22B", "MAT 21A", "ECN 1A", "ECN 1B"],
  SL: ["MAT 21A", "CHE 2A", "PHY 9A"],
};

function sortByCorePreference(code: string, courses: TranscriptCourse[]): TranscriptCourse[] {
  const preferred = CORE_PREFERRED_KEYS[code] ?? [];
  return [...courses].sort((a, b) => {
    const aIndex = preferred.includes(a.key) ? preferred.indexOf(a.key) : Number.MAX_SAFE_INTEGER;
    const bIndex = preferred.includes(b.key) ? preferred.indexOf(b.key) : Number.MAX_SAFE_INTEGER;
    if (aIndex !== bIndex) return aIndex - bIndex;
    return a.key.localeCompare(b.key);
  });
}

function allocateGe(completedCourses: TranscriptCourse[], data: PlannerData) {
  const completedKeys = new Set(completedCourses.map((course) => course.key));
  const topicalBuckets = new Map<string, GeBucket>(
    TOPICAL.map(([code, name]) => [
      code,
      { code, name, requiredUnits: 12, earnedUnits: 0, missingUnits: 12, courses: [], suggestions: [] },
    ]),
  );

  const usedTopicalCourses = new Set<string>();
  for (const area of ["AH", "SE", "SS"]) {
    const bucket = topicalBuckets.get(area)!;
    const candidates = completedCourses.filter((course) => {
      if (usedTopicalCourses.has(course.key)) return false;
      const catalog = catalogCourseFor(course, data.catalog);
      if (!isGeEligible(course, catalog)) return false;
      const options = catalog?.GE?.filter((code) => topicalBuckets.has(code)) ?? [];
      if (!options.includes(area)) return false;
      const preferred = preferredTopicalArea(course, options);
      return !preferred || preferred === area;
    });

    for (const course of sortByTopicalPreference(area, candidates)) {
      if (bucket.earnedUnits >= 20) break;
      const countedUnits = Math.min(course.units, 20 - bucket.earnedUnits);
      bucket.earnedUnits += countedUnits;
      bucket.courses.push(course);
      usedTopicalCourses.add(course.key);
      bucket.missingUnits = Math.max(0, bucket.requiredUnits - bucket.earnedUnits);
    }
  }

  for (const bucket of topicalBuckets.values()) {
    bucket.suggestions = bucket.missingUnits > 0 ? geSuggestions(data, bucket.code, completedKeys) : [];
  }

  const coreBuckets = new Map<string, GeBucket>(
    CORE_LITERACY_REQUIREMENTS.map(([code, name, units]) => [
      code,
      { code, name, requiredUnits: units, earnedUnits: 0, missingUnits: units, courses: [], suggestions: [] },
    ]),
  );

  const usedCoreCourses = new Set<string>();
  for (const code of ["VL", "ACGH", "DD", "WC", "QL", "SL"]) {
    const bucket = coreBuckets.get(code)!;
    const candidates = completedCourses.filter((course) => {
      if (usedCoreCourses.has(course.key)) return false;
      const catalog = catalogCourseFor(course, data.catalog);
      return isGeEligible(course, catalog) && !!catalog?.writing?.includes(code);
    });
    for (const course of sortByCorePreference(code, candidates)) {
      if (bucket.earnedUnits >= bucket.requiredUnits) break;
      bucket.earnedUnits += course.units;
      bucket.courses.push(course);
      usedCoreCourses.add(course.key);
    }
    bucket.missingUnits = Math.max(0, bucket.requiredUnits - bucket.earnedUnits);
  }

  const wordsBucket = coreBuckets.get("WE_OR_OL")!;
  let writingExperienceUnits = 0;
  let oralSkillsUnits = 0;
  const wordCandidates = completedCourses.filter((course) => {
    if (usedCoreCourses.has(course.key)) return false;
    const catalog = catalogCourseFor(course, data.catalog);
    return isGeEligible(course, catalog) && !!catalog?.writing?.some((code) => code === "WE" || code === "OL");
  });
  for (const course of wordCandidates.sort((a, b) => {
    const aCatalog = catalogCourseFor(a, data.catalog);
    const bCatalog = catalogCourseFor(b, data.catalog);
    const aIsWe = aCatalog?.writing?.includes("WE") ? 0 : 1;
    const bIsWe = bCatalog?.writing?.includes("WE") ? 0 : 1;
    if (aIsWe !== bIsWe) return aIsWe - bIsWe;
    return a.key.localeCompare(b.key);
  })) {
    if (wordsBucket.earnedUnits >= wordsBucket.requiredUnits) break;
    const catalog = catalogCourseFor(course, data.catalog);
    wordsBucket.earnedUnits += course.units;
    if (catalog?.writing?.includes("WE")) {
      writingExperienceUnits += course.units;
    } else if (catalog?.writing?.includes("OL")) {
      oralSkillsUnits += course.units;
    }
    wordsBucket.courses.push(course);
    usedCoreCourses.add(course.key);
  }
  wordsBucket.missingUnits = Math.max(0, wordsBucket.requiredUnits - wordsBucket.earnedUnits);
  const missingWritingExperienceUnits = Math.max(0, 6 - writingExperienceUnits);
  const missingCombinedUnits = Math.max(0, 9 - wordsBucket.earnedUnits);
  wordsBucket.notes = [
    `${wordsBucket.earnedUnits} of 9 WE/OL units counted.`,
    `${writingExperienceUnits} of 6 required Writing Experience (WE) units counted.`,
    `${oralSkillsUnits} Oral Skills (OL) unit(s) counted.`,
  ];
  if (missingCombinedUnits > 0 || missingWritingExperienceUnits > 0) {
    wordsBucket.notes.push(
      `Still needed: ${missingCombinedUnits} more WE/OL unit(s), including ${missingWritingExperienceUnits} more WE unit(s).`,
    );
  }

  for (const bucket of coreBuckets.values()) {
    bucket.suggestions = bucket.missingUnits > 0 ? geSuggestions(data, bucket.code, completedKeys) : [];
  }

  return {
    topicalBreadth: [...topicalBuckets.values()],
    coreLiteracies: [...coreBuckets.values()],
    topicalSummary: {
      earnedUnits: [...topicalBuckets.values()].reduce((sum, bucket) => sum + bucket.earnedUnits, 0),
      requiredUnits: 52,
    },
    coreSummary: {
      earnedUnits: [...coreBuckets.values()].reduce((sum, bucket) => sum + Math.min(bucket.earnedUnits, bucket.requiredUnits), 0),
      requiredUnits: 35,
    },
  };
}

async function extractTextWithPdftotext(pdfBuffer: Buffer): Promise<string> {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "life-planner-"));
  const pdfPath = path.join(tempDir, "transcript.pdf");
  await fs.promises.writeFile(pdfPath, pdfBuffer);

  const candidates = [
    "pdftotext",
    "C:\\Users\\Elbert\\AppData\\Local\\Microsoft\\WinGet\\Packages\\oschwartz10612.Poppler_Microsoft.Winget.Source_8wekyb3d8bbwe\\poppler-25.07.0\\Library\\bin\\pdftotext.exe",
    "C:\\Users\\Elbert\\AppData\\Local\\Programs\\MiKTeX\\miktex\\bin\\x64\\pdftotext.exe",
  ];

  try {
    for (const command of candidates) {
      try {
        const { stdout } = await execFileAsync(command, ["-layout", pdfPath, "-"], { maxBuffer: 10 * 1024 * 1024 });
        if (stdout.trim()) return stdout;
      } catch {
        continue;
      }
    }
    throw new Error("Could not run pdftotext. Install Poppler or add pdftotext to PATH.");
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
}

export async function analyzeTranscriptPdf(pdfBase64: string) {
  const pdfBuffer = Buffer.from(pdfBase64.replace(/^data:application\/pdf;base64,/, ""), "base64");
  const text = await extractTextWithPdftotext(pdfBuffer);
  const transcript = parseTranscriptText(text);
  const data = loadPlannerData();
  const requirements = checkElectricalEngineeringRequirements(transcript.completed, transcript.inProgress, data);
  const ge = allocateGe([...transcript.completed, ...transcript.inProgress], data);

  return {
    major: "Electrical Engineering",
    transcript: {
      completedCourseCount: transcript.completed.length,
      inProgressCourseCount: transcript.inProgress.length,
      completedCourses: transcript.completed.sort((a, b) => a.key.localeCompare(b.key)),
      inProgressCourses: transcript.inProgress.sort((a, b) => a.key.localeCompare(b.key)),
    },
    requirements,
    ge,
    geRequirementRules: GE_REQUIREMENT_RULES,
    dataSources: {
      catalogCourses: data.catalog.size,
      offeredSections: data.offered.length,
      suggestionNote:
        data.offered.length < 100
          ? "Only the current local offered-course scrape is loaded. Run the full undergraduate offered-classes scraper for broader suggestions."
          : "Suggestions are based on the local offered-classes scrape.",
    },
  };
}
