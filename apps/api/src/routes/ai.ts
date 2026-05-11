import { Router, Response as ExpressResponse } from "express";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

type ChatRole = "system" | "user" | "assistant";

interface ChatMessage {
  role: ChatRole;
  content: string;
}

interface ClientHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

interface CourseRecommendation {
  courseId: string;
  courseCode: string;
  title: string;
  units: number;
  department: string;
  description: string | null;
  prerequisites: string[];
  prerequisitesMet: boolean;
  unlocksCount: number;
  requirementNames: string[];
  availableThisQuarter: boolean;
  offeredTerm?: string;
  availableSeats?: number;
  offerings?: CourseOfferingSummary[];
  score: number;
}

interface RecommendationPlan {
  light: CourseRecommendation[];
  moderate: CourseRecommendation[];
  heavy: CourseRecommendation[];
}

interface SupabaseCourse {
  id: string;
  courseCode: string;
  title: string;
  units: number;
  department: string;
  description: string | null;
  prerequisites: string[] | null;
  geCategories?: string[] | null;
  writingCategories?: string[] | null;
}

interface SupabaseMajor {
  id: string;
  name: string;
  department?: string | null;
}

interface SupabaseRequirement {
  id: string;
  name: string;
}

interface RequirementCourseRow {
  requirementId: string;
  courseId: string;
}

interface OfferedCourseRow {
  id: string;
  term: string;
  termCode: string;
  courseId: string | null;
  courseCode: string;
  title: string;
  unitsMin: number | null;
  unitsMax: number | null;
  courseSubjectCode: string;
  section: string;
  crn: string | null;
  openSeats: number | null;
  waitlist: number | null;
  instructors: string[] | null;
  meetings: unknown[] | null;
}

interface CourseOfferingSummary {
  term: string;
  termCode: string;
  section: string;
  crn: string | null;
  openSeats: number | null;
  waitlist: number | null;
  instructors: string[];
  meetings: unknown[];
}

interface ScheduleContext {
  calendarConnected?: boolean;
  events?: Array<{
    title?: string;
    time?: string;
    location?: string;
  }>;
}

const OFFERED_TABLE = "CoursesOfferedByTerm";
const OFFERED_SELECT =
  "id,term,termCode,courseId,courseCode,title,unitsMin,unitsMax,courseSubjectCode,section,crn,openSeats,waitlist,instructors,meetings";

const SYSTEM_PROMPT = `You are an academic advisor assistant for UC Davis students.
You recommend classes and explain tradeoffs using only the supplied student data.
Prioritize unmet degree requirements when they exist. If formal requirement data is missing, use the catalog fallback recommendations and clearly say they are a starting point, not an official degree audit.
When offered-section data is supplied, prefer classes with availableThisQuarter=true and use the sections/open seats as evidence.
Be concise, specific, and practical. Never invent course names, course codes, or requirements.`;

function getSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) return null;

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function getMajorFromMetadata(metadata: Record<string, unknown> | undefined) {
  const raw = metadata?.major;
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

function getDepartmentHints(major: string | undefined) {
  const normalized = major?.toLowerCase() ?? "";

  if (normalized.includes("computer engineering")) {
    return ["EEC", "ECS", "MAT", "PHY", "ENG"];
  }

  if (normalized.includes("computer science")) {
    return ["ECS", "MAT", "STA"];
  }

  if (normalized.includes("electrical")) {
    return ["EEC", "ECS", "MAT", "PHY", "ENG"];
  }

  if (normalized.includes("mechanical")) {
    return ["EME", "ENG", "MAT", "PHY", "EAE"];
  }

  if (normalized.includes("aerospace")) {
    return ["EAE", "EME", "ENG", "MAT", "PHY"];
  }

  if (normalized.includes("biomedical")) {
    return ["BIM", "BIS", "CHE", "MAT", "PHY", "ENG"];
  }

  if (normalized.includes("biochemical")) {
    return ["ECH", "BIT", "BIS", "CHE", "MAT", "ENG"];
  }

  if (normalized.includes("chemical")) {
    return ["ECH", "CHE", "MAT", "PHY", "ENG"];
  }

  if (normalized.includes("materials")) {
    return ["EMS", "CHE", "PHY", "MAT", "ENG"];
  }

  if (normalized.includes("civil")) {
    return ["ECI", "ENG", "MAT", "PHY", "CHE"];
  }

  if (normalized.includes("environmental")) {
    return ["ECI", "ECH", "BIS", "CHE", "MAT", "PHY"];
  }

  if (normalized.includes("biological systems")) {
    return ["EBS", "BIS", "CHE", "MAT", "PHY", "ENG"];
  }

  if (normalized.includes("engineering")) {
    return ["ENG", "MAT", "PHY", "CHE"];
  }

  if (normalized.includes("biology") || normalized.includes("biological")) {
    return ["BIS", "CHE", "MAT", "STA"];
  }

  if (normalized.includes("economics")) {
    return ["ECN", "MAT", "STA"];
  }

  return ["ECS", "MAT", "STA", "UWP"];
}

function resolveTermSlug(targetQuarter: string | undefined) {
  const normalized = (targetQuarter ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

  if (normalized.includes("fall") && (normalized.includes("26") || normalized.includes("2026"))) {
    return "fall26";
  }

  if (normalized === "fall26" || normalized === "202610") {
    return "fall26";
  }

  return "fall26";
}

function normalizeCourseCode(code: string): string {
  const parts = code.trim().split(/\s+/);
  if (parts.length < 2) return code.trim();

  const dept = parts[0];
  const num = parts.slice(1).join(" ");
  const match = num.match(/^(\d+)(.*)$/);

  if (!match) return code.trim();

  return `${dept} ${match[1].padStart(3, "0")}${match[2]}`;
}

function getCourseNumber(courseCode: string) {
  const match = courseCode.match(/\d+/);
  return match ? Number(match[0]) : 999;
}

function scoreCatalogCandidate(
  courseCode: string,
  department: string,
  geCategories: string[] | null | undefined,
  writingCategories: string[] | null | undefined,
  departmentHints: string[]
) {
  const departmentIndex = departmentHints.indexOf(department);
  const departmentScore = departmentIndex === -1 ? 0 : (departmentHints.length - departmentIndex) * 20;
  const courseNumber = getCourseNumber(courseCode);
  const levelScore = courseNumber < 100 ? 35 : courseNumber < 200 ? 20 : 5;
  const geScore = geCategories?.length ? 8 : 0;
  const writingScore = writingCategories?.length ? 4 : 0;

  return departmentScore + levelScore + geScore + writingScore;
}

function scoreCatalogCourse(course: SupabaseCourse, departmentHints: string[]) {
  return scoreCatalogCandidate(
    course.courseCode,
    course.department,
    course.geCategories,
    course.writingCategories,
    departmentHints
  );
}

function uniqueValues<T>(values: Array<T | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is T => value !== null && value !== undefined)));
}

function chunks<T>(values: T[], size: number) {
  const result: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }

  return result;
}

function offeringSummary(row: OfferedCourseRow): CourseOfferingSummary {
  return {
    term: row.term,
    termCode: row.termCode,
    section: row.section,
    crn: row.crn,
    openSeats: row.openSeats,
    waitlist: row.waitlist,
    instructors: row.instructors ?? [],
    meetings: row.meetings ?? [],
  };
}

function groupOfferingsByCourseCode(rows: OfferedCourseRow[]) {
  const offeringsByCode = new Map<string, CourseOfferingSummary[]>();

  for (const row of rows) {
    const courseCode = normalizeCourseCode(row.courseCode);
    const offerings = offeringsByCode.get(courseCode) ?? [];
    offerings.push(offeringSummary(row));
    offeringsByCode.set(courseCode, offerings);
  }

  return offeringsByCode;
}

function countAvailableSeats(offerings: CourseOfferingSummary[]) {
  return offerings.reduce((sum, offering) => sum + Math.max(offering.openSeats ?? 0, 0), 0);
}

function planCourses(plan: RecommendationPlan) {
  return [...plan.light, ...plan.moderate, ...plan.heavy];
}

function withOfferingData(
  recommendation: CourseRecommendation,
  offeringsByCode: Map<string, CourseOfferingSummary[]>,
  termSlug: string
): CourseRecommendation {
  const offerings = offeringsByCode.get(normalizeCourseCode(recommendation.courseCode)) ?? [];
  const availableSeats = countAvailableSeats(offerings);
  const offeredScore = offerings.length > 0 ? 25 + Math.min(availableSeats, 50) / 5 : 0;

  return {
    ...recommendation,
    availableThisQuarter: offerings.length > 0,
    offeredTerm: termSlug,
    availableSeats,
    offerings: offerings.slice(0, 4),
    score: recommendation.score + offeredScore,
  };
}

function sortPlan(plan: RecommendationPlan): RecommendationPlan {
  const byScore = (a: CourseRecommendation, b: CourseRecommendation) =>
    b.score - a.score || a.courseCode.localeCompare(b.courseCode);

  return {
    light: [...plan.light].sort(byScore).slice(0, 2),
    moderate: [...plan.moderate].sort(byScore).slice(0, 4),
    heavy: [...plan.heavy].sort(byScore).slice(0, 6),
  };
}

async function getCompletedCourseIds(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("UserCourse")
    .select("courseId,status")
    .eq("userId", userId)
    .in("status", ["completed", "in_progress"]);

  if (error || !data) return new Set<string>();
  return new Set(data.map((record) => record.courseId as string));
}

async function fetchOfferedRowsForCourseCodes(supabase: SupabaseClient, termSlug: string, courseCodes: string[]) {
  const normalizedCodes = uniqueValues(courseCodes.map((code) => normalizeCourseCode(code)));
  if (normalizedCodes.length === 0) return [];

  const rows: OfferedCourseRow[] = [];

  for (const codeChunk of chunks(normalizedCodes, 75)) {
    const { data, error } = await supabase
      .from(OFFERED_TABLE)
      .select(OFFERED_SELECT)
      .eq("term", termSlug)
      .in("courseCode", codeChunk)
      .limit(1000);

    if (error || !data) {
      console.warn(`${OFFERED_TABLE} course lookup failed: ${error?.message ?? "no data"}`);
      continue;
    }

    rows.push(...(data as OfferedCourseRow[]));
  }

  return rows;
}

async function fetchOfferedRowsForDepartments(
  supabase: SupabaseClient,
  termSlug: string,
  departmentHints: string[]
) {
  const { data, error } = await supabase
    .from(OFFERED_TABLE)
    .select(OFFERED_SELECT)
    .eq("term", termSlug)
    .in("courseSubjectCode", departmentHints)
    .limit(1000);

  if (error || !data) {
    console.warn(`${OFFERED_TABLE} department lookup failed: ${error?.message ?? "no data"}`);
    return [];
  }

  return data as OfferedCourseRow[];
}

async function enrichPlanWithOfferings(
  supabase: SupabaseClient | null,
  plan: RecommendationPlan,
  termSlug: string
): Promise<RecommendationPlan> {
  if (!supabase) return plan;

  const codes = uniqueValues(planCourses(plan).map((course) => course.courseCode));
  const offeredRows = await fetchOfferedRowsForCourseCodes(supabase, termSlug, codes);
  const offeringsByCode = groupOfferingsByCourseCode(offeredRows);

  return sortPlan({
    light: plan.light.map((course) => withOfferingData(course, offeringsByCode, termSlug)),
    moderate: plan.moderate.map((course) => withOfferingData(course, offeringsByCode, termSlug)),
    heavy: plan.heavy.map((course) => withOfferingData(course, offeringsByCode, termSlug)),
  });
}

async function fetchCoursesByIds(supabase: SupabaseClient, ids: string[]) {
  const uniqueIds = uniqueValues(ids);
  if (uniqueIds.length === 0) return new Map<string, SupabaseCourse>();

  const courses = new Map<string, SupabaseCourse>();

  for (const idChunk of chunks(uniqueIds, 150)) {
    const { data, error } = await supabase
      .from("Course")
      .select("id,courseCode,title,units,department,description,prerequisites,geCategories,writingCategories")
      .in("id", idChunk)
      .limit(1000);

    if (error || !data) continue;

    for (const course of data as SupabaseCourse[]) {
      courses.set(course.id, course);
    }
  }

  return courses;
}

async function findMajorByName(supabase: SupabaseClient, major: string | undefined) {
  if (!major) return null;

  const exact = await supabase.from("Major").select("id,name,department").eq("name", major).limit(1);
  if (!exact.error && exact.data?.[0]) return exact.data[0] as SupabaseMajor;

  const byDepartment = await supabase
    .from("Major")
    .select("id,name,department")
    .eq("department", major.toUpperCase())
    .limit(1);
  if (!byDepartment.error && byDepartment.data?.[0]) return byDepartment.data[0] as SupabaseMajor;

  const fuzzy = await supabase.from("Major").select("id,name,department").ilike("name", `%${major}%`).limit(1);
  if (!fuzzy.error && fuzzy.data?.[0]) return fuzzy.data[0] as SupabaseMajor;

  return null;
}

async function getSupabaseRequirementRecommendations(
  supabase: SupabaseClient,
  major: string | undefined,
  completedCourseIds: Set<string>,
  termSlug: string,
  departmentHints: string[]
): Promise<RecommendationPlan | null> {
  const majorRow = await findMajorByName(supabase, major);
  if (!majorRow) return null;

  const { data: requirementData, error: requirementError } = await supabase
    .from("Requirement")
    .select("id,name")
    .eq("majorId", majorRow.id)
    .limit(500);

  if (requirementError || !requirementData?.length) return null;

  const requirements = requirementData as SupabaseRequirement[];
  const requirementNamesById = new Map(requirements.map((requirement) => [requirement.id, requirement.name]));
  const requirementIds = requirements.map((requirement) => requirement.id);
  const requirementCourses: RequirementCourseRow[] = [];

  for (const requirementChunk of chunks(requirementIds, 100)) {
    const { data, error } = await supabase
      .from("RequirementCourse")
      .select("requirementId,courseId")
      .in("requirementId", requirementChunk)
      .limit(2000);

    if (error || !data) continue;
    requirementCourses.push(...(data as RequirementCourseRow[]));
  }

  if (requirementCourses.length === 0) return null;

  const requirementNamesByCourseId = new Map<string, string[]>();

  for (const row of requirementCourses) {
    const requirementName = requirementNamesById.get(row.requirementId);
    if (!requirementName) continue;

    const requirementNames = requirementNamesByCourseId.get(row.courseId) ?? [];
    if (!requirementNames.includes(requirementName)) requirementNames.push(requirementName);
    requirementNamesByCourseId.set(row.courseId, requirementNames);
  }

  const candidateCourseIds = Array.from(requirementNamesByCourseId.keys()).filter(
    (courseId) => !completedCourseIds.has(courseId)
  );
  const coursesById = await fetchCoursesByIds(supabase, candidateCourseIds);
  const offeredRows = await fetchOfferedRowsForCourseCodes(
    supabase,
    termSlug,
    Array.from(coursesById.values()).map((course) => course.courseCode)
  );
  const offeringsByCode = groupOfferingsByCourseCode(offeredRows);

  const recommendations = Array.from(coursesById.values())
    .map((course) => {
      const offerings = offeringsByCode.get(normalizeCourseCode(course.courseCode)) ?? [];
      const availableSeats = countAvailableSeats(offerings);
      const requirementNames = requirementNamesByCourseId.get(course.id) ?? [];
      const offeredScore = offerings.length > 0 ? 40 + Math.min(availableSeats, 50) / 5 : 0;

      return {
        courseId: course.id,
        courseCode: course.courseCode,
        title: course.title,
        units: course.units,
        department: course.department,
        description: course.description,
        prerequisites: course.prerequisites ?? [],
        prerequisitesMet: true,
        unlocksCount: 0,
        requirementNames,
        availableThisQuarter: offerings.length > 0,
        offeredTerm: termSlug,
        availableSeats,
        offerings: offerings.slice(0, 4),
        score:
          scoreCatalogCourse(course, departmentHints) +
          requirementNames.length * 8 +
          offeredScore,
      };
    })
    .filter((course) => course.availableThisQuarter)
    .sort((a, b) => b.score - a.score || a.courseCode.localeCompare(b.courseCode));

  if (recommendations.length === 0) return null;

  return {
    light: recommendations.slice(0, 2),
    moderate: recommendations.slice(0, 4),
    heavy: recommendations.slice(0, 6),
  };
}

async function getCatalogFallbackRecommendations(
  req: AuthRequest,
  termSlug: string
): Promise<RecommendationPlan | null> {
  const supabase = getSupabase();
  if (!supabase || !req.userId) return null;

  const major = getMajorFromMetadata(req.userMetadata);
  const departmentHints = getDepartmentHints(major);
  const completedCourseIds = await getCompletedCourseIds(supabase, req.userId);
  const requirementRecommendations = await getSupabaseRequirementRecommendations(
    supabase,
    major,
    completedCourseIds,
    termSlug,
    departmentHints
  );

  if (requirementRecommendations) return requirementRecommendations;

  const offeredRows = await fetchOfferedRowsForDepartments(supabase, termSlug, departmentHints);

  if (offeredRows.length > 0) {
    const coursesById = await fetchCoursesByIds(
      supabase,
      offeredRows.map((row) => row.courseId).filter((id): id is string => Boolean(id))
    );
    const offeringsByCode = groupOfferingsByCourseCode(offeredRows);
    const representativeByCode = new Map<string, OfferedCourseRow>();

    for (const row of offeredRows) {
      const code = normalizeCourseCode(row.courseCode);
      if (!representativeByCode.has(code)) representativeByCode.set(code, row);
    }

    const recommendations = Array.from(representativeByCode.entries())
      .filter(([, row]) => !row.courseId || !completedCourseIds.has(row.courseId))
      .map(([courseCode, row]) => {
        const catalogCourse = row.courseId ? coursesById.get(row.courseId) : undefined;
        const offerings = offeringsByCode.get(courseCode) ?? [];
        const availableSeats = countAvailableSeats(offerings);
        const units = catalogCourse?.units ?? row.unitsMax ?? row.unitsMin ?? 4;
        const department = catalogCourse?.department ?? row.courseSubjectCode;
        const baseScore = catalogCourse
          ? scoreCatalogCourse(catalogCourse, departmentHints)
          : scoreCatalogCandidate(courseCode, department, [], [], departmentHints);

        return {
          courseId: catalogCourse?.id ?? row.courseId ?? `${termSlug}:${courseCode}`,
          courseCode,
          title: catalogCourse?.title ?? row.title,
          units,
          department,
          description: catalogCourse?.description ?? null,
          prerequisites: catalogCourse?.prerequisites ?? [],
          prerequisitesMet: true,
          unlocksCount: 0,
          requirementNames: major ? [`${major} catalog starting point`] : ["Catalog starting point"],
          availableThisQuarter: true,
          offeredTerm: termSlug,
          availableSeats,
          offerings: offerings.slice(0, 4),
          score: baseScore + 35 + Math.min(availableSeats, 50) / 5,
        };
      })
      .sort((a, b) => b.score - a.score || a.courseCode.localeCompare(b.courseCode));

    return {
      light: recommendations.slice(0, 2),
      moderate: recommendations.slice(0, 4),
      heavy: recommendations.slice(0, 6),
    };
  }

  let query = supabase
    .from("Course")
    .select("id,courseCode,title,units,department,description,prerequisites,geCategories,writingCategories")
    .in("department", departmentHints)
    .limit(500);

  const { data, error } = await query;
  if (error || !data) return null;

  const recommendations = (data as SupabaseCourse[])
    .filter((course) => !completedCourseIds.has(course.id))
    .map((course) => ({
      courseId: course.id,
      courseCode: course.courseCode,
      title: course.title,
      units: course.units,
      department: course.department,
      description: course.description,
      prerequisites: course.prerequisites ?? [],
      prerequisitesMet: true,
      unlocksCount: 0,
      requirementNames: major ? [`${major} catalog starting point`] : ["Catalog starting point"],
      availableThisQuarter: false,
      offeredTerm: termSlug,
      availableSeats: 0,
      offerings: [],
      score: scoreCatalogCourse(course, departmentHints),
    }))
    .sort((a, b) => b.score - a.score || a.courseCode.localeCompare(b.courseCode));

  return {
    light: recommendations.slice(0, 2),
    moderate: recommendations.slice(0, 4),
    heavy: recommendations.slice(0, 6),
  };
}

async function getStudentContext(req: AuthRequest, targetQuarter: string) {
  const termSlug = resolveTermSlug(targetQuarter);
  const supabase = getSupabase();

  try {
    const [{ runDegreeAudit }, { getRecommendations }] = await Promise.all([
      import("../lib/audit"),
      import("../lib/recommendations"),
    ]);
    const audit = await runDegreeAudit(req.userId!, getMajorFromMetadata(req.userMetadata));
    const recommendations = await getRecommendations(req.userId!, targetQuarter).catch((error) => {
      console.warn("[ai] Prisma recommendation path skipped:", error instanceof Error ? error.message : error);
      return null;
    });

    if (recommendations && recommendations.moderate.length > 0) {
      const enrichedRecommendations = await enrichPlanWithOfferings(supabase, recommendations, termSlug);

      return {
        audit,
        recommendations: enrichedRecommendations,
        source: "degree-audit",
        offeredTerm: termSlug,
        warning: null,
      };
    }

    const fallback = await getCatalogFallbackRecommendations(req, termSlug);
    return {
      audit,
      recommendations: fallback,
      source: "catalog-fallback",
      offeredTerm: termSlug,
      warning:
        "Formal degree-requirement recommendations were not available, so these are catalog-based starter recommendations.",
    };
  } catch (error) {
    const fallback = await getCatalogFallbackRecommendations(req, termSlug);
    return {
      audit: null,
      recommendations: fallback,
      source: "catalog-fallback",
      offeredTerm: termSlug,
      warning:
        "The Prisma degree-audit path failed, so these recommendations came from the Supabase course catalog fallback.",
    };
  }
}

function normalizeHistory(history: unknown): ClientHistoryMessage[] {
  if (!Array.isArray(history)) return [];

  return history
    .filter((message): message is ClientHistoryMessage => {
      if (!message || typeof message !== "object") return false;
      const candidate = message as { role?: unknown; content?: unknown };
      return (
        (candidate.role === "user" || candidate.role === "assistant") &&
        typeof candidate.content === "string" &&
        candidate.content.trim().length > 0
      );
    })
    .slice(-8);
}

function summarizeScheduleContext(scheduleContext: ScheduleContext | undefined) {
  if (!scheduleContext) return "No calendar context was provided.";

  const events = scheduleContext.events?.slice(0, 12) ?? [];
  return JSON.stringify(
    {
      calendarConnected: Boolean(scheduleContext.calendarConnected),
      upcomingEvents: events,
    },
    null,
    2
  );
}

async function callGroq(messages: ChatMessage[]) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("AI service not configured. Set GROQ_API_KEY.");
  }

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
      messages,
      max_tokens: 900,
      temperature: 0.35,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Groq request failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return data.choices?.[0]?.message?.content ?? "Sorry, I could not generate a response.";
}

router.post("/chat", async (req: AuthRequest, res: ExpressResponse) => {
  try {
    const { message, history, targetQuarter = "Fall 2026", scheduleContext } = req.body as {
      message?: string;
      history?: unknown;
      targetQuarter?: string;
      scheduleContext?: ScheduleContext;
    };

    if (!message?.trim()) {
      res.status(400).json({ message: "message is required" });
      return;
    }

    const studentContext = await getStudentContext(req, targetQuarter);
    const recommendations = studentContext.recommendations;
    const context = {
      user: {
        id: req.userId,
        email: req.userEmail,
        major: getMajorFromMetadata(req.userMetadata),
      },
      targetQuarter,
      offeredTerm: studentContext.offeredTerm,
      recommendationSource: studentContext.source,
      warning: studentContext.warning,
      degreeAudit: studentContext.audit,
      recommendations,
      scheduleContext: summarizeScheduleContext(scheduleContext),
    };

    const messages: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `STUDENT CONTEXT:\n${JSON.stringify(context, null, 2)}`,
      },
      ...normalizeHistory(history),
      { role: "user", content: message.trim() },
    ];

    const reply = await callGroq(messages);
    res.json({
      reply,
      recommendations,
      recommendationSource: studentContext.source,
      offeredTerm: studentContext.offeredTerm,
      warning: studentContext.warning,
    });
  } catch (err: any) {
    const message = err?.message ?? "AI request failed";
    const status = message.includes("GROQ_API_KEY") ? 503 : 500;
    res.status(status).json({ message });
  }
});

export default router;
