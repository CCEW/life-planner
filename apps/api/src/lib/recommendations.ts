import { prisma } from "@life-planner/db";
import { runDegreeAudit } from "./audit";

export interface CourseRecommendation {
  courseId: string;
  courseCode: string;
  title: string;
  units: number;
  department: string;
  description: string | null;
  prerequisites: string[];
  prerequisitesMet: boolean;
  unlocksCount: number;   // how many future courses this unlocks
  requirementNames: string[];
  availableThisQuarter: boolean;
  score: number;
}

export interface RecommendationPlan {
  light: CourseRecommendation[];   // 1-2 courses
  moderate: CourseRecommendation[]; // 3-4 courses
  heavy: CourseRecommendation[];    // 5+ courses
}

export async function getRecommendations(
  userId: string,
  targetQuarter: string = "Fall 2026"
): Promise<RecommendationPlan | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.major) return null;

  const audit = await runDegreeAudit(userId);
  if (!audit) return null;

  // All completed course codes
  const completedUserCourses = await prisma.userCourse.findMany({
    where: { userId, status: { in: ["completed", "in_progress"] } },
    include: { course: true },
  });
  const doneOrInProgress = new Set(completedUserCourses.map((uc) => uc.course.courseCode));

  // Pending requirements
  const pendingRequirements = audit.requirements.filter((r) => !r.isSatisfied);
  if (pendingRequirements.length === 0) return { light: [], moderate: [], heavy: [] };

  // Courses that count towards unsatisfied requirements
  const pendingReqIds = pendingRequirements.map((r) => r.requirementId);
  const reqCourses = await prisma.requirementCourse.findMany({
    where: { requirementId: { in: pendingReqIds } },
    include: {
      course: { include: { sections: { where: { quarter: targetQuarter } } } },
      requirement: true,
    },
  });

  // Group by course
  const courseMap = new Map<string, {
    course: any;
    requirementNames: string[];
    availableThisQuarter: boolean;
  }>();

  for (const rc of reqCourses) {
    const code = rc.course.courseCode;
    if (doneOrInProgress.has(code)) continue;

    if (!courseMap.has(code)) {
      courseMap.set(code, {
        course: rc.course,
        requirementNames: [],
        availableThisQuarter: rc.course.sections.length > 0,
      });
    }
    courseMap.get(code)!.requirementNames.push(rc.requirement.name);
  }

  // All courses in catalog (for unlocks calculation)
  const allCourses = await prisma.course.findMany({ select: { courseCode: true, prerequisites: true } });

  // Build prereq graph: courseCode -> list of courses that need it
  const unlocksMap = new Map<string, number>();
  for (const c of allCourses) {
    for (const prereq of c.prerequisites) {
      unlocksMap.set(prereq, (unlocksMap.get(prereq) ?? 0) + 1);
    }
  }

  const recommendations: CourseRecommendation[] = [];

  for (const [, entry] of courseMap) {
    const { course, requirementNames, availableThisQuarter } = entry;

    const prerequisitesMet = course.prerequisites.every((p: string) => doneOrInProgress.has(p));
    if (!prerequisitesMet) continue; // don't recommend courses the student can't take

    const unlocksCount = unlocksMap.get(course.courseCode) ?? 0;

    // Score: prereqs met > unlocks future courses > available this quarter > fits a pending requirement
    let score = 0;
    score += unlocksCount * 10;
    if (availableThisQuarter) score += 20;
    score += requirementNames.length * 5;

    recommendations.push({
      courseId: course.id,
      courseCode: course.courseCode,
      title: course.title,
      units: course.units,
      department: course.department,
      description: course.description,
      prerequisites: course.prerequisites,
      prerequisitesMet,
      unlocksCount,
      requirementNames,
      availableThisQuarter,
      score,
    });
  }

  recommendations.sort((a, b) => b.score - a.score);

  return {
    light: recommendations.slice(0, 2),
    moderate: recommendations.slice(0, 4),
    heavy: recommendations.slice(0, 6),
  };
}