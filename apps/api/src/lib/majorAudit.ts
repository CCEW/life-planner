import { SupabaseClient } from "@supabase/supabase-js";

export type AuditCourse = {
  courseCode: string;
  units: number | null;
  grade: string | null;
};

type MajorRow = {
  id: string;
  code: string | null;
  name: string;
  degree: string | null;
  catalogYear: string | null;
};

type RequirementRow = {
  id: string;
  name: string;
  description: string | null;
  ruleType: "ALL" | "CHOOSE_N_COURSES" | "CHOOSE_N_UNITS" | string | null;
  optionMode: string | null;
  requiredCourses: number | null;
  requiredUnits: number | null;
  minCourses: number | null;
  minUnits: number | null;
  courses: string[] | null;
  resolvedCourses: string[] | null;
  courseSelectors: CourseSelector[] | null;
  notes: string[] | null;
  sortOrder: number | null;
  groupLabel: string | null;
  subsection: string | null;
};

type RequirementOptionRow = {
  id: string;
  requirementId: string;
  label: string;
  requiredCourses: number | null;
  countsAsCourses: number | null;
  courses: string[] | null;
};

type RequirementOptionCourseRow = {
  optionId: string;
  requirementId: string;
  courseCode: string;
};

type RequirementSubConstraintRow = {
  id: string;
  requirementId: string;
  ruleType: string;
  requiredCourses: number | null;
  requiredUnits: number | null;
  maxCourses: number | null;
  maxUnits: number | null;
  courses: string[] | null;
  resolvedCourses: string[] | null;
  description: string | null;
};

type CourseSelector = {
  type?: string;
  subject?: string;
  subjects?: string[];
  prefixes?: string[];
  min_number?: number;
  max_number?: number;
  exclude_courses?: string[];
};

export type MajorRequirementAudit = {
  id: string;
  name: string;
  groupLabel: string | null;
  subsection: string | null;
  ruleType: string;
  optionMode: string | null;
  met: boolean;
  progress: number;
  required: number;
  unitBased: boolean;
  completedCourseCodes: string[];
  candidateCourseCodes: string[];
  missingCourseCodes: string[];
  notes: string[];
};

export type MajorAuditResult = {
  major: MajorRow;
  summary: {
    met: number;
    total: number;
  };
  requirements: MajorRequirementAudit[];
};

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeCourseCode(code: string): string {
  const compact = code.replace(/\s+/g, "").toUpperCase();
  const match = compact.match(/^([A-Z]{2,4})0*(\d+)([A-Z].*)?$/);
  if (!match) return compact;
  return `${match[1]}${match[2]}${match[3] ?? ""}`;
}

function uniqueCourseCodes(codes: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const code of codes) {
    if (!code || !/^[A-Z]{2,4}\s*\d/i.test(code)) continue;
    const normalized = normalizeCourseCode(code);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(code.replace(/\s+/g, " ").trim().toUpperCase());
  }
  return result;
}

function isCompletedGrade(grade: string | null): boolean {
  if (!grade) return false;
  return !["IP", "NP", "W", "F"].includes(grade.toUpperCase());
}

function parseCourseNumber(code: string): number | null {
  const match = code.match(/\b(\d{1,3})/);
  return match ? Number(match[1]) : null;
}

function selectorMatchesCourse(selector: CourseSelector, courseCode: string): boolean {
  const normalized = courseCode.replace(/\s+/g, " ").toUpperCase();
  const [subject] = normalized.split(" ");
  const number = parseCourseNumber(normalized);
  const excluded = new Set((selector.exclude_courses ?? []).map(normalizeCourseCode));
  if (excluded.has(normalizeCourseCode(normalized))) return false;

  if (selector.type === "subject_prefix") {
    return subject === selector.subject?.toUpperCase() &&
      (selector.prefixes ?? []).some((prefix) => normalized.startsWith(`${subject} ${prefix}`));
  }

  if (selector.type === "subject_number_range") {
    const subjects = (selector.subjects ?? []).map((item) => item.toUpperCase());
    if (!subjects.includes(subject) || number === null) return false;
    if (selector.min_number !== undefined && number < selector.min_number) return false;
    if (selector.max_number !== undefined && number > selector.max_number) return false;
    return true;
  }

  return false;
}

function codesMatchingSelectors(selectors: CourseSelector[], courseCodes: string[]): string[] {
  return courseCodes.filter((code) => selectors.some((selector) => selectorMatchesCourse(selector, code)));
}

function evaluateCourseRule(
  ruleType: string,
  requiredCourses: number | null,
  requiredUnits: number | null,
  candidateCodes: string[],
  taken: Map<string, AuditCourse>
) {
  const completedCourseCodes = candidateCodes.filter((code) => taken.has(normalizeCourseCode(code)));
  const missingCourseCodes = candidateCodes.filter((code) => !taken.has(normalizeCourseCode(code)));

  if (ruleType === "CHOOSE_N_UNITS") {
    const required = Number(requiredUnits ?? 0);
    const progress = completedCourseCodes.reduce((sum, code) => (
      sum + (taken.get(normalizeCourseCode(code))?.units ?? 0)
    ), 0);
    return { met: progress >= required, progress, required, unitBased: true, completedCourseCodes, missingCourseCodes };
  }

  const required = ruleType === "ALL"
    ? candidateCodes.length
    : Number(requiredCourses ?? candidateCodes.length);
  const progress = completedCourseCodes.length;
  return { met: progress >= required, progress, required, unitBased: false, completedCourseCodes, missingCourseCodes };
}

function optionCourseCodes(
  option: RequirementOptionRow,
  optionCourses: RequirementOptionCourseRow[]
): string[] {
  return uniqueCourseCodes([
    ...(option.courses ?? []),
    ...optionCourses.filter((course) => course.optionId === option.id).map((course) => course.courseCode),
  ]);
}

export async function findMajor(
  supabase: SupabaseClient,
  majorText: string | null
): Promise<MajorRow | null> {
  if (!majorText) return null;
  const { data, error } = await supabase
    .from("Major")
    .select("id, code, name, degree, catalogYear")
    .limit(100);

  if (error) throw error;

  const target = normalizeText(majorText);
  const majors = (data ?? []) as MajorRow[];
  return majors
    .map((major) => {
      const name = normalizeText(major.name);
      const code = normalizeText(major.code ?? "");
      const score =
        target === name ? 100 :
        target.includes(name) ? 90 :
        name.includes(target) ? 80 :
        code && target.split(" ").includes(code) ? 70 :
        0;
      return { major, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.major.name.length - a.major.name.length)[0]?.major ?? null;
}

export async function auditMajorRequirements(
  supabase: SupabaseClient,
  courses: AuditCourse[],
  majorText: string | null
): Promise<MajorAuditResult | null> {
  const major = await findMajor(supabase, majorText);
  if (!major) return null;

  const completedCourses = courses.filter((course) => isCompletedGrade(course.grade));
  const taken = new Map(completedCourses.map((course) => [normalizeCourseCode(course.courseCode), course]));
  const takenCodes = completedCourses.map((course) => course.courseCode);

  const { data: requirementData, error: requirementError } = await supabase
    .from("Requirement")
    .select("*")
    .eq("majorId", major.id)
    .order("sortOrder", { ascending: true });
  if (requirementError) throw requirementError;

  const requirements = (requirementData ?? []) as RequirementRow[];
  const requirementIds = requirements.map((requirement) => requirement.id);

  const [optionResponse, optionCourseResponse, subConstraintResponse] = requirementIds.length === 0
    ? [
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ]
    : await Promise.all([
        supabase.from("RequirementOption").select("*").in("requirementId", requirementIds),
        supabase.from("RequirementOptionCourse").select("*").in("requirementId", requirementIds),
        supabase.from("RequirementSubConstraint").select("*").in("requirementId", requirementIds),
      ]);

  if (optionResponse.error) throw optionResponse.error;
  if (optionCourseResponse.error) throw optionCourseResponse.error;
  if (subConstraintResponse.error) throw subConstraintResponse.error;

  const options = (optionResponse.data ?? []) as RequirementOptionRow[];
  const optionCourses = (optionCourseResponse.data ?? []) as RequirementOptionCourseRow[];
  const subConstraints = (subConstraintResponse.data ?? []) as RequirementSubConstraintRow[];

  const audits = requirements.map((requirement) => {
    const requirementOptions = options.filter((option) => option.requirementId === requirement.id);
    const requirementSubConstraints = subConstraints.filter((constraint) => constraint.requirementId === requirement.id);
    const baseCodes = uniqueCourseCodes([...(requirement.resolvedCourses ?? []), ...(requirement.courses ?? [])]);
    const selectorCodes = codesMatchingSelectors(requirement.courseSelectors ?? [], takenCodes);
    const candidateCodes = uniqueCourseCodes([...baseCodes, ...selectorCodes]);

    if (requirementSubConstraints.length > 0) {
      const subAudits = requirementSubConstraints.map((constraint) => {
        const subCodes = uniqueCourseCodes([...(constraint.resolvedCourses ?? []), ...(constraint.courses ?? [])]);
        return evaluateCourseRule(
          constraint.ruleType,
          constraint.requiredCourses,
          constraint.requiredUnits,
          subCodes,
          taken
        );
      });
      return {
        id: requirement.id,
        name: requirement.name,
        groupLabel: requirement.groupLabel,
        subsection: requirement.subsection,
        ruleType: requirement.ruleType ?? "ALL",
        optionMode: requirement.optionMode,
        met: subAudits.every((audit) => audit.met),
        progress: subAudits.filter((audit) => audit.met).length,
        required: subAudits.length,
        unitBased: false,
        completedCourseCodes: uniqueCourseCodes(subAudits.flatMap((audit) => audit.completedCourseCodes)),
        candidateCourseCodes: uniqueCourseCodes(subAudits.flatMap((audit) => [...audit.missingCourseCodes, ...audit.completedCourseCodes])),
        missingCourseCodes: uniqueCourseCodes(subAudits.flatMap((audit) => audit.missingCourseCodes)),
        notes: requirement.notes ?? [],
      };
    }

    if (requirementOptions.length > 0 && requirement.optionMode === "COMPLETE_ONE_OPTION") {
      const optionAudits = requirementOptions.map((option) => {
        const codes = optionCourseCodes(option, optionCourses);
        return evaluateCourseRule(
          "CHOOSE_N_COURSES",
          option.requiredCourses ?? requirement.requiredCourses ?? codes.length,
          null,
          codes,
          taken
        );
      });
      const best = optionAudits.sort((a, b) => Number(b.met) - Number(a.met) || b.progress - a.progress)[0];
      return {
        id: requirement.id,
        name: requirement.name,
        groupLabel: requirement.groupLabel,
        subsection: requirement.subsection,
        ruleType: requirement.ruleType ?? "CHOOSE_N_COURSES",
        optionMode: requirement.optionMode,
        met: best?.met ?? false,
        progress: best?.progress ?? 0,
        required: best?.required ?? 1,
        unitBased: false,
        completedCourseCodes: best?.completedCourseCodes ?? [],
        candidateCourseCodes: uniqueCourseCodes(requirementOptions.flatMap((option) => optionCourseCodes(option, optionCourses))),
        missingCourseCodes: best?.missingCourseCodes ?? [],
        notes: requirement.notes ?? [],
      };
    }

    const bundleCredit = requirementOptions.reduce((sum, option) => {
      const codes = optionCourseCodes(option, optionCourses);
      const completed = codes.every((code) => taken.has(normalizeCourseCode(code)));
      return completed ? sum + (option.countsAsCourses ?? 0) : sum;
    }, 0);
    const ruleAudit = evaluateCourseRule(
      requirement.ruleType ?? "ALL",
      requirement.requiredCourses ?? requirement.minCourses,
      requirement.requiredUnits ?? requirement.minUnits,
      candidateCodes,
      taken
    );
    const progress = ruleAudit.unitBased ? ruleAudit.progress : ruleAudit.progress + bundleCredit;

    return {
      id: requirement.id,
      name: requirement.name,
      groupLabel: requirement.groupLabel,
      subsection: requirement.subsection,
      ruleType: requirement.ruleType ?? "ALL",
      optionMode: requirement.optionMode,
      met: progress >= ruleAudit.required,
      progress,
      required: ruleAudit.required,
      unitBased: ruleAudit.unitBased,
      completedCourseCodes: ruleAudit.completedCourseCodes,
      candidateCourseCodes: uniqueCourseCodes([
        ...candidateCodes,
        ...requirementOptions.flatMap((option) => optionCourseCodes(option, optionCourses)),
      ]),
      missingCourseCodes: ruleAudit.missingCourseCodes,
      notes: requirement.notes ?? [],
    };
  });

  return {
    major,
    summary: {
      met: audits.filter((audit) => audit.met).length,
      total: audits.length,
    },
    requirements: audits,
  };
}
