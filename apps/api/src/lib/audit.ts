import { prisma } from "@life-planner/db";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

type RuleType = "ALL" | "CHOOSE_N_COURSES" | "CHOOSE_N_UNITS" | "MAX_N_UNITS" | "MAX_N_COURSES";
type OptionMode = "COMPLETE_ONE_OPTION" | "AREA_POOLS" | "COURSE_BUNDLE_EQUIVALENTS" | null;

interface CompletedCourse {
  courseId: string;
  courseCode: string;
  units: number;
  grade: string | null;
  term: string | null;
  title: string | null;
}

interface CourseSelector {
  type: "subject_number_range" | "subject_prefix";
  subjects?: string[];
  subject?: string;
  min_number?: number;
  max_number?: number;
  prefixes?: string[];
  exclude_courses?: string[];
}

interface MajorRow {
  id: string;
  name: string;
  code: string | null;
  degree: string | null;
  catalogYear: string | null;
  totalUnits: number;
  auditLogic: Record<string, unknown> | null;
}

interface RequirementRow {
  id: string;
  structuredId: string | null;
  majorId: string;
  majorCode: string | null;
  name: string;
  description: string | null;
  sortOrder: number | null;
  category: string | null;
  groupId: string | null;
  groupLabel: string | null;
  subsection: string | null;
  ruleType: RuleType | null;
  optionMode: OptionMode;
  requiredCourses: number | null;
  requiredUnits: number | null;
  minCourses: number | null;
  minUnits: number | null;
  minLevel: number | null;
  categoryUnits: number | null;
  canDoubleCount: boolean | null;
  courses: string[] | null;
  resolvedCourses: string[] | null;
  unresolvedListedCourses: string[] | null;
  courseSelectors: CourseSelector[] | null;
  notes: string[] | null;
}

interface RequirementCourseRow {
  requirementId: string;
  courseId: string;
  courseCode: string | null;
}

interface RequirementOptionRow {
  id: string;
  requirementId: string;
  structuredRequirementId: string;
  label: string;
  optionOrder: number | null;
  optionMode: OptionMode;
  requiredCourses: number | null;
  countsAsCourses: number | null;
  courses: string[] | null;
}

interface RequirementOptionCourseRow {
  optionId: string;
  requirementId: string;
  courseCode: string;
}

interface RequirementSubConstraintRow {
  id: string;
  requirementId: string;
  structuredRequirementId: string;
  subOrder: number | null;
  ruleType: RuleType;
  requiredCourses: number | null;
  requiredUnits: number | null;
  maxCourses: number | null;
  maxUnits: number | null;
  courses: string[] | null;
  resolvedCourses: string[] | null;
  description: string | null;
}

interface SelectedCourse {
  courseCode: string;
  units: number;
  grade: string | null;
  term: string | null;
  title: string | null;
  optionLabel?: string;
  bundleCourses?: string[];
  countsAsCourses?: number;
}

export interface RequirementAuditResult {
  requirementId: string;
  name: string;
  description: string | null;
  minCourses: number | null;
  minUnits: number | null;
  minLevel: number | null;
  satisfiedCourses: string[];
  completedUnits: number;
  isSatisfied: boolean;
  percentComplete: number;
  groupId?: string | null;
  groupLabel?: string | null;
  subsection?: string | null;
  ruleType?: RuleType | null;
  optionMode?: OptionMode;
  requiredCourses?: number | null;
  requiredUnits?: number | null;
  missingCourses?: string[];
  missingCourseCount?: number;
  missingUnits?: number;
  selectedCourses?: SelectedCourse[];
  bestOptionLabel?: string | null;
  manualReviewNotes?: string[];
  constraintViolations?: Array<{ constraintId: string; message: string; courseCodes: string[] }>;
}

export interface DegreeAuditResult {
  majorId: string;
  majorName: string;
  totalUnitsRequired: number;
  completedUnits: number;
  requirements: RequirementAuditResult[];
  overallPercent: number;
  isComplete: boolean;
  source?: "structured-supabase" | "legacy-prisma";
  degree?: string | null;
  catalogYear?: string | null;
  auditNotes?: string[];
}

interface StructuredCatalog {
  major: MajorRow;
  requirements: RequirementRow[];
  requirementCourses: RequirementCourseRow[];
  options: RequirementOptionRow[];
  optionCourses: RequirementOptionCourseRow[];
  subConstraints: RequirementSubConstraintRow[];
}

const COURSE_RE = /\b([A-Z]{2,4})\s*0*([0-9]{1,3}[A-Z]{0,3})\b/i;
const FAILING_GRADES = new Set(["F", "NP", "U", "I", "Y", "NG", "IP", "NR", "RE"]);

function getSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return null;

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function normalizeCourseCode(value: unknown): string | null {
  if (value == null) return null;
  const match = String(value).toUpperCase().match(COURSE_RE);
  if (!match) return null;
  return `${match[1]} ${Number(match[2].replace(/[A-Z]+$/i, ""))}${match[2].match(/[A-Z]+$/i)?.[0] ?? ""}`;
}

function courseNumber(courseCode: string) {
  const match = courseCode.match(/\s(\d+)/);
  return match ? Number(match[1]) : 0;
}

function courseSubject(courseCode: string) {
  return courseCode.split(" ")[0];
}

function isPassing(status: string | null, grade: string | null) {
  if (status && status !== "completed") return false;
  if (!grade) return true;
  return !FAILING_GRADES.has(grade.trim().toUpperCase());
}

function chunks<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let i = 0; i < values.length; i += size) result.push(values.slice(i, i + size));
  return result;
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

function cleanCodes(values: Array<string | null | undefined>) {
  return unique(values.map(normalizeCourseCode).filter((value): value is string => Boolean(value)));
}

function selectorMatches(selector: CourseSelector, courseCode: string) {
  const excluded = new Set(cleanCodes(selector.exclude_courses ?? []));
  if (excluded.has(courseCode)) return false;

  const subject = courseSubject(courseCode);
  const number = courseNumber(courseCode);
  const numberPart = courseCode.split(" ")[1] ?? "";

  if (selector.type === "subject_number_range") {
    return (
      (selector.subjects ?? []).includes(subject) &&
      number >= (selector.min_number ?? Number.NEGATIVE_INFINITY) &&
      number <= (selector.max_number ?? Number.POSITIVE_INFINITY)
    );
  }

  if (selector.type === "subject_prefix") {
    return selector.subject === subject && (selector.prefixes ?? []).some((prefix) => numberPart.startsWith(prefix));
  }

  return false;
}

function requirementCourseSet(req: RequirementRow, linked: RequirementCourseRow[]) {
  return new Set(
    cleanCodes([
      ...(req.resolvedCourses ?? []),
      ...(req.courses ?? []),
      ...linked.filter((row) => row.requirementId === req.id).map((row) => row.courseCode),
    ])
  );
}

function selectedFrom(course: CompletedCourse, extra: Partial<SelectedCourse> = {}): SelectedCourse {
  return {
    courseCode: course.courseCode,
    units: course.units,
    grade: course.grade,
    term: course.term,
    title: course.title,
    ...extra,
  };
}

function byUsefulOrder(a: CompletedCourse, b: CompletedCourse) {
  if (b.units !== a.units) return b.units - a.units;
  return a.courseCode.localeCompare(b.courseCode);
}

async function fetchMajor(supabase: SupabaseClient, majorNameOrCode: string) {
  const normalized = majorNameOrCode.trim();
  const byCode = await supabase
    .from("Major")
    .select("id,name,code,degree,catalogYear,totalUnits,auditLogic")
    .eq("code", normalized.toUpperCase())
    .limit(1);
  if (!byCode.error && byCode.data?.[0]) return byCode.data[0] as MajorRow;

  const byName = await supabase
    .from("Major")
    .select("id,name,code,degree,catalogYear,totalUnits,auditLogic")
    .eq("name", normalized)
    .limit(1);
  if (!byName.error && byName.data?.[0]) return byName.data[0] as MajorRow;

  const fuzzy = await supabase
    .from("Major")
    .select("id,name,code,degree,catalogYear,totalUnits,auditLogic")
    .ilike("name", `%${normalized}%`)
    .limit(1);
  if (!fuzzy.error && fuzzy.data?.[0]) return fuzzy.data[0] as MajorRow;

  if (byCode.error) throw byCode.error;
  return null;
}

async function getUserMajor(supabase: SupabaseClient | null, userId: string, explicitMajor?: string) {
  if (explicitMajor?.trim()) return explicitMajor.trim();

  if (supabase) {
    const { data } = await supabase.from("User").select("major").eq("id", userId).limit(1);
    const major = data?.[0]?.major;
    if (typeof major === "string" && major.trim()) return major.trim();
  }

  const user = await prisma.user.findUnique({ where: { id: userId } }).catch(() => null);
  return user?.major ?? null;
}

async function fetchStructuredCatalog(supabase: SupabaseClient, majorNameOrCode: string): Promise<StructuredCatalog | null> {
  const major = await fetchMajor(supabase, majorNameOrCode);
  if (!major) return null;

  const { data: requirements, error: requirementsError } = await supabase
    .from("Requirement")
    .select(
      "id,structuredId,majorId,majorCode,name,description,sortOrder,category,groupId,groupLabel,subsection,ruleType,optionMode,requiredCourses,requiredUnits,minCourses,minUnits,minLevel,categoryUnits,canDoubleCount,courses,resolvedCourses,unresolvedListedCourses,courseSelectors,notes"
    )
    .eq("majorId", major.id)
    .order("sortOrder", { ascending: true })
    .limit(1000);

  if (requirementsError) throw requirementsError;
  const requirementRows = (requirements ?? []) as RequirementRow[];
  const requirementIds = requirementRows.map((req) => req.id);
  if (requirementIds.length === 0) return null;

  const [requirementCourses, options, optionCourses, subConstraints] = await Promise.all([
    fetchRowsByRequirementIds<RequirementCourseRow>(
      supabase,
      "RequirementCourse",
      "requirementId,courseId,courseCode",
      requirementIds
    ),
    fetchRowsByRequirementIds<RequirementOptionRow>(
      supabase,
      "RequirementOption",
      "id,requirementId,structuredRequirementId,label,optionOrder,optionMode,requiredCourses,countsAsCourses,courses",
      requirementIds
    ),
    fetchRowsByRequirementIds<RequirementOptionCourseRow>(
      supabase,
      "RequirementOptionCourse",
      "optionId,requirementId,courseCode",
      requirementIds
    ),
    fetchRowsByRequirementIds<RequirementSubConstraintRow>(
      supabase,
      "RequirementSubConstraint",
      "id,requirementId,structuredRequirementId,subOrder,ruleType,requiredCourses,requiredUnits,maxCourses,maxUnits,courses,resolvedCourses,description",
      requirementIds
    ),
  ]);

  return { major, requirements: requirementRows, requirementCourses, options, optionCourses, subConstraints };
}

async function fetchRowsByRequirementIds<T>(
  supabase: SupabaseClient,
  table: string,
  select: string,
  requirementIds: string[]
) {
  const rows: T[] = [];

  for (const idChunk of chunks(requirementIds, 100)) {
    const { data, error } = await supabase.from(table).select(select).in("requirementId", idChunk).limit(2000);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
  }

  return rows;
}

async function fetchCompletedCourses(supabase: SupabaseClient, userId: string) {
  const { data: userCourses, error } = await supabase
    .from("UserCourse")
    .select("courseId,status,grade,quarter,units")
    .eq("userId", userId)
    .eq("status", "completed")
    .limit(1000);

  if (error) throw error;

  const records = (userCourses ?? []) as Array<{
    courseId: string;
    status: string | null;
    grade: string | null;
    quarter: string | null;
    units: number | null;
  }>;
  const courseIds = unique(records.map((record) => record.courseId));
  const coursesById = new Map<string, { id: string; courseCode: string; title: string | null; units: number }>();

  for (const idChunk of chunks(courseIds, 150)) {
    const { data, error: courseError } = await supabase
      .from("Course")
      .select("id,courseCode,title,units")
      .in("id", idChunk)
      .limit(1000);
    if (courseError) throw courseError;
    for (const course of data ?? []) {
      coursesById.set(course.id, course as { id: string; courseCode: string; title: string | null; units: number });
    }
  }

  const completed = new Map<string, CompletedCourse>();
  for (const record of records) {
    const course = coursesById.get(record.courseId);
    if (!course || !isPassing(record.status, record.grade)) continue;

    const normalized = normalizeCourseCode(course.courseCode);
    if (!normalized) continue;

    completed.set(normalized, {
      courseId: record.courseId,
      courseCode: normalized,
      units: record.units ?? course.units ?? 4,
      grade: record.grade,
      term: record.quarter,
      title: course.title,
    });
  }

  return completed;
}

function matchesRequirement(req: RequirementRow, linked: RequirementCourseRow[], courseCode: string) {
  if (requirementCourseSet(req, linked).has(courseCode)) return true;
  return (req.courseSelectors ?? []).some((selector) => selectorMatches(selector, courseCode));
}

function eligibleCompleted(
  req: RequirementRow,
  catalog: StructuredCatalog,
  completed: Map<string, CompletedCourse>,
  used: Set<string>
) {
  return Array.from(completed.values())
    .filter((course) => (req.canDoubleCount || !used.has(course.courseCode)) && matchesRequirement(req, catalog.requirementCourses, course.courseCode))
    .sort(byUsefulOrder);
}

function manualReviewNotes(req: RequirementRow, subConstraints: RequirementSubConstraintRow[]) {
  const notes = [...(req.notes ?? [])].filter((note) =>
    /advisor|petition|approved|excess|exclude|cannot be reused|catalog-approved|exam/i.test(note)
  );

  if ((req.unresolvedListedCourses ?? []).length > 0) {
    notes.push(`Unresolved listed items: ${(req.unresolvedListedCourses ?? []).join(", ")}`);
  }

  for (const sub of subConstraints) {
    if ((sub.resolvedCourses ?? []).length === 0 && (sub.courses ?? []).length > 0) {
      notes.push(sub.description ?? `Sub-constraint needs manual policy review: ${(sub.courses ?? []).join(", ")}`);
    }
  }

  return notes;
}

function evaluateRequirement(
  req: RequirementRow,
  catalog: StructuredCatalog,
  completed: Map<string, CompletedCourse>,
  used: Set<string>
): RequirementAuditResult {
  const options = catalog.options.filter((option) => option.requirementId === req.id).sort((a, b) => (a.optionOrder ?? 0) - (b.optionOrder ?? 0));
  const optionCoursesByOption = new Map<string, string[]>();
  for (const row of catalog.optionCourses.filter((course) => course.requirementId === req.id)) {
    const courses = optionCoursesByOption.get(row.optionId) ?? [];
    const code = normalizeCourseCode(row.courseCode);
    if (code) courses.push(code);
    optionCoursesByOption.set(row.optionId, courses);
  }

  const subConstraints = catalog.subConstraints.filter((sub) => sub.requirementId === req.id);
  const baseRequiredCourses = req.requiredCourses ?? req.minCourses ?? null;
  const baseRequiredUnits = req.requiredUnits ?? req.minUnits ?? null;
  let selected: SelectedCourse[] = [];
  let missingCourses: string[] = [];
  let bestOptionLabel: string | null = null;
  let complete = false;
  let requiredCourses = baseRequiredCourses;
  let requiredUnits = baseRequiredUnits;

  if (req.optionMode === "COMPLETE_ONE_OPTION") {
    requiredCourses = 1;
    let bestSelected: SelectedCourse[] = [];
    let bestMissing: string[] = [];

    for (const option of options) {
      const optionCodes = cleanCodes(optionCoursesByOption.get(option.id) ?? option.courses ?? []);
      const requiredInOption = option.requiredCourses ?? optionCodes.length;
      const optionSelected = optionCodes
        .map((code) => completed.get(code))
        .filter((course): course is CompletedCourse => course != null && Boolean(req.canDoubleCount || !used.has(course.courseCode)))
        .map((course) => selectedFrom(course, { optionLabel: option.label }));
      const optionMissing = optionCodes.filter((code) => !completed.has(code)).slice(0, Math.max(requiredInOption - optionSelected.length, 0));

      if (optionSelected.length > bestSelected.length || optionMissing.length < bestMissing.length) {
        bestSelected = optionSelected;
        bestMissing = optionMissing;
        bestOptionLabel = option.label;
      }

      if (optionSelected.length >= requiredInOption) {
        selected = optionSelected;
        missingCourses = [];
        bestOptionLabel = option.label;
        complete = true;
        break;
      }
    }

    if (!complete) {
      selected = bestSelected;
      missingCourses = bestMissing;
    }
  } else if (req.optionMode === "COURSE_BUNDLE_EQUIVALENTS") {
    const bundles: SelectedCourse[] = [];
    const bundledComponents = new Set<string>();
    for (const option of options) {
      const codes = cleanCodes(optionCoursesByOption.get(option.id) ?? option.courses ?? []);
      const completedBundle = codes
        .map((code) => completed.get(code))
        .filter((course): course is CompletedCourse => course != null && Boolean(req.canDoubleCount || !used.has(course.courseCode)));
      if (completedBundle.length >= (option.requiredCourses ?? codes.length)) {
        completedBundle.forEach((course) => bundledComponents.add(course.courseCode));
        bundles.push({
          courseCode: option.label,
          units: completedBundle.reduce((sum, course) => sum + course.units, 0),
          grade: null,
          term: null,
          title: option.label,
          optionLabel: option.label,
          bundleCourses: completedBundle.map((course) => course.courseCode),
          countsAsCourses: option.countsAsCourses ?? 1,
        });
      }
    }
    selected = [
      ...bundles,
      ...eligibleCompleted(req, catalog, completed, used)
        .filter((course) => !bundledComponents.has(course.courseCode))
        .map((course) => selectedFrom(course)),
    ].slice(0, requiredCourses ?? 1);
    complete = selected.reduce((sum, course) => sum + (course.countsAsCourses ?? 1), 0) >= (requiredCourses ?? 1);
  } else if (req.ruleType === "ALL") {
    const requiredCodes = Array.from(requirementCourseSet(req, catalog.requirementCourses)).sort();
    requiredCourses = requiredCodes.length;
    selected = requiredCodes
      .map((code) => completed.get(code))
      .filter((course): course is CompletedCourse => course != null && Boolean(req.canDoubleCount || !used.has(course.courseCode)))
      .map((course) => selectedFrom(course));
    missingCourses = requiredCodes.filter((code) => !completed.has(code));
    complete = missingCourses.length === 0;
  } else if (req.ruleType === "CHOOSE_N_UNITS") {
    requiredUnits = requiredUnits ?? 0;
    let units = 0;
    for (const course of eligibleCompleted(req, catalog, completed, used)) {
      if (units >= requiredUnits) break;
      selected.push(selectedFrom(course));
      units += course.units;
    }
    complete = units >= requiredUnits;
  } else {
    requiredCourses = requiredCourses ?? 1;
    selected = eligibleCompleted(req, catalog, completed, used)
      .slice(0, requiredCourses)
      .map((course) => selectedFrom(course));
    complete = selected.length >= requiredCourses;
  }

  const constraintViolations = checkSubConstraints(selected, subConstraints);
  if (constraintViolations.length > 0) complete = false;

  const completedCourseCount = selected.reduce((sum, course) => sum + (course.countsAsCourses ?? 1), 0);
  const completedUnits = selected.reduce((sum, course) => sum + course.units, 0);
  const missingCourseCount = Math.max((requiredCourses ?? 0) - completedCourseCount, 0);
  const missingUnits = Math.max((requiredUnits ?? 0) - completedUnits, 0);
  let percentComplete = complete ? 100 : 0;
  if (requiredUnits && requiredUnits > 0) percentComplete = Math.min(100, Math.round((completedUnits / requiredUnits) * 100));
  else if (requiredCourses && requiredCourses > 0) percentComplete = Math.min(100, Math.round((completedCourseCount / requiredCourses) * 100));

  return {
    requirementId: req.id,
    name: req.name,
    description: req.description,
    minCourses: req.minCourses,
    minUnits: req.minUnits,
    minLevel: req.minLevel,
    satisfiedCourses: selected.flatMap((course) => course.bundleCourses ?? [course.courseCode]),
    completedUnits,
    isSatisfied: complete,
    percentComplete,
    groupId: req.groupId,
    groupLabel: req.groupLabel,
    subsection: req.subsection,
    ruleType: req.ruleType,
    optionMode: req.optionMode,
    requiredCourses,
    requiredUnits,
    missingCourses,
    missingCourseCount,
    missingUnits,
    selectedCourses: selected,
    bestOptionLabel,
    manualReviewNotes: manualReviewNotes(req, subConstraints),
    constraintViolations,
  };
}

function checkSubConstraints(selected: SelectedCourse[], subConstraints: RequirementSubConstraintRow[]) {
  const violations: Array<{ constraintId: string; message: string; courseCodes: string[] }> = [];

  for (const sub of subConstraints) {
    const subCourses = new Set(cleanCodes(sub.resolvedCourses ?? sub.courses ?? []));
    if (subCourses.size === 0) continue;

    const matching = selected.filter((course) => {
      if (course.bundleCourses?.some((code) => subCourses.has(code))) return true;
      return subCourses.has(course.courseCode);
    });
    const matchingCodes = matching.flatMap((course) => course.bundleCourses ?? [course.courseCode]);
    const matchingUnits = matching.reduce((sum, course) => sum + course.units, 0);

    if (sub.ruleType === "MAX_N_COURSES" && sub.maxCourses != null && matching.length > sub.maxCourses) {
      violations.push({
        constraintId: sub.id,
        message: `At most ${sub.maxCourses} course(s) may count from this restricted list.`,
        courseCodes: matchingCodes,
      });
    }
    if (sub.ruleType === "MAX_N_UNITS" && sub.maxUnits != null && matchingUnits > sub.maxUnits) {
      violations.push({
        constraintId: sub.id,
        message: `At most ${sub.maxUnits} unit(s) may count from this restricted list.`,
        courseCodes: matchingCodes,
      });
    }
    if (sub.ruleType === "CHOOSE_N_COURSES" && sub.requiredCourses != null && matching.length < sub.requiredCourses) {
      violations.push({
        constraintId: sub.id,
        message: `At least ${sub.requiredCourses} course(s) must come from this sub-category.`,
        courseCodes: matchingCodes,
      });
    }
    if (sub.ruleType === "CHOOSE_N_UNITS" && sub.requiredUnits != null && matchingUnits < sub.requiredUnits) {
      violations.push({
        constraintId: sub.id,
        message: `At least ${sub.requiredUnits} unit(s) must come from this sub-category.`,
        courseCodes: matchingCodes,
      });
    }
  }

  return violations;
}

async function runStructuredSupabaseAudit(
  userId: string,
  majorName?: string
): Promise<DegreeAuditResult | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const resolvedMajor = await getUserMajor(supabase, userId, majorName);
  if (!resolvedMajor) return null;

  const [catalog, completed] = await Promise.all([
    fetchStructuredCatalog(supabase, resolvedMajor),
    fetchCompletedCourses(supabase, userId),
  ]);
  if (!catalog) return null;

  const used = new Set<string>();
  const requirements = catalog.requirements.map((req) => {
    const result = evaluateRequirement(req, catalog, completed, used);
    if (result.isSatisfied && !req.canDoubleCount) {
      for (const courseCode of result.satisfiedCourses) {
        const normalized = normalizeCourseCode(courseCode);
        if (normalized) used.add(normalized);
      }
    }
    return result;
  });

  const completedUnits = Array.from(completed.values()).reduce((sum, course) => sum + course.units, 0);
  const satisfiedCount = requirements.filter((req) => req.isSatisfied).length;
  const overallPercent =
    requirements.length > 0 ? Math.round((satisfiedCount / requirements.length) * 100) : 0;
  const auditLogic = catalog.major.auditLogic ?? {};
  const auditNotes = [
    typeof auditLogic.default_double_counting === "string" ? auditLogic.default_double_counting : null,
    ...(Array.isArray(auditLogic.major_specific_rules) ? auditLogic.major_specific_rules : []),
  ].filter((note): note is string => typeof note === "string");

  return {
    majorId: catalog.major.id,
    majorName: catalog.major.name,
    totalUnitsRequired: catalog.major.totalUnits,
    completedUnits,
    requirements,
    overallPercent,
    isComplete: satisfiedCount === requirements.length && requirements.length > 0,
    source: "structured-supabase",
    degree: catalog.major.degree,
    catalogYear: catalog.major.catalogYear,
    auditNotes,
  };
}

async function runLegacyPrismaAudit(userId: string, majorName?: string): Promise<DegreeAuditResult | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const resolvedMajor = majorName || user?.major;
  if (!resolvedMajor) return null;

  const major = await prisma.major.findUnique({
    where: { name: resolvedMajor },
    include: {
      requirements: {
        include: { courses: { include: { course: true } } },
      },
    },
  });
  if (!major) return null;

  const completedUserCourses = await prisma.userCourse.findMany({
    where: { userId, status: "completed" },
    include: { course: true },
  });

  const completedCodes = new Set(completedUserCourses.map((uc) => uc.course.courseCode));
  const completedUnitsByCode = new Map(
    completedUserCourses.map((uc) => [uc.course.courseCode, uc.units ?? uc.course.units])
  );

  let totalCompletedUnits = 0;
  completedUnitsByCode.forEach((u) => (totalCompletedUnits += u));

  const requirementResults: RequirementAuditResult[] = major.requirements.map((req) => {
    const eligibleCourses = req.courses.map((rc) => rc.course);

    const satisfied = eligibleCourses.filter((c) => {
      if (!completedCodes.has(c.courseCode)) return false;
      if (req.minLevel) {
        const num = parseInt(c.courseCode.replace(/[^0-9]/g, ""), 10);
        if (num < req.minLevel) return false;
      }
      return true;
    });

    const satisfiedUnits = satisfied.reduce(
      (sum, c) => sum + (completedUnitsByCode.get(c.courseCode) ?? c.units),
      0
    );

    const coursesNeeded = req.minCourses ?? 1;
    const unitsNeeded = req.minUnits ?? 0;
    const coursesMet = satisfied.length >= coursesNeeded;
    const unitsMet = satisfiedUnits >= unitsNeeded;
    const isSatisfied = coursesMet && unitsMet;

    let percent = 0;
    if (req.minCourses && req.minCourses > 0) percent = Math.min(100, Math.round((satisfied.length / req.minCourses) * 100));
    else if (req.minUnits && req.minUnits > 0) percent = Math.min(100, Math.round((satisfiedUnits / req.minUnits) * 100));
    else percent = isSatisfied ? 100 : 0;

    return {
      requirementId: req.id,
      name: req.name,
      description: req.description,
      minCourses: req.minCourses,
      minUnits: req.minUnits,
      minLevel: req.minLevel,
      satisfiedCourses: satisfied.map((c) => c.courseCode),
      completedUnits: satisfiedUnits,
      isSatisfied,
      percentComplete: percent,
    };
  });

  const satisfiedCount = requirementResults.filter((r) => r.isSatisfied).length;
  const overallPercent =
    requirementResults.length > 0 ? Math.round((satisfiedCount / requirementResults.length) * 100) : 0;

  return {
    majorId: major.id,
    majorName: major.name,
    totalUnitsRequired: major.totalUnits,
    completedUnits: totalCompletedUnits,
    requirements: requirementResults,
    overallPercent,
    isComplete: satisfiedCount === requirementResults.length && requirementResults.length > 0,
    source: "legacy-prisma",
  };
}

export async function runDegreeAudit(userId: string, majorName?: string): Promise<DegreeAuditResult | null> {
  try {
    const structured = await runStructuredSupabaseAudit(userId, majorName);
    if (structured) return structured;
  } catch (error) {
    console.warn("[degree-audit] structured Supabase audit skipped:", error instanceof Error ? error.message : error);
  }

  return runLegacyPrismaAudit(userId, majorName);
}
