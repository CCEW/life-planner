import { Router, Response } from "express";
import { prisma } from "@life-planner/db";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

// GET /user-courses — all courses for the logged-in user
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.query as { status?: string };
    const where: any = { userId: req.userId! };
    if (status) where.status = status;

    const records = await prisma.userCourse.findMany({
      where,
      include: { course: true },
      orderBy: { course: { courseCode: "asc" } },
    });
    res.json(records);
  } catch (err: any) {
    res.status(500).json({ message: err?.message });
  }
});

// POST /user-courses — add a course to user's plan
router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const { courseId, status, grade, quarter, units } = req.body;
    if (!courseId || !status) {
      res.status(400).json({ message: "courseId and status are required" });
      return;
    }

    const record = await prisma.userCourse.upsert({
      where: { userId_courseId: { userId: req.userId!, courseId } },
      create: { userId: req.userId!, courseId, status, grade, quarter, units },
      update: { status, grade, quarter, units },
      include: { course: true },
    });
    res.status(201).json(record);
  } catch (err: any) {
    res.status(500).json({ message: err?.message });
  }
});

// PATCH /user-courses/:id — update status/grade
router.patch("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.userCourse.findFirst({
      where: { id, userId: req.userId! },
    });
    if (!existing) {
      res.status(404).json({ message: "Not found" });
      return;
    }

    const { status, grade, quarter, units } = req.body;
    const updated = await prisma.userCourse.update({
      where: { id },
      data: { status, grade, quarter, units },
      include: { course: true },
    });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ message: err?.message });
  }
});

// DELETE /user-courses/:id
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.userCourse.findFirst({
      where: { id, userId: req.userId! },
    });
    if (!existing) {
      res.status(404).json({ message: "Not found" });
      return;
    }

    await prisma.userCourse.delete({ where: { id } });
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ message: err?.message });
  }
});

export default router;
