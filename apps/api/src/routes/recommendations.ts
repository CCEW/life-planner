import { Router, Response } from "express";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { getRecommendations } from "../lib/recommendations";

const router = Router();
router.use(requireAuth);

// GET /recommendations?quarter=Fall+2026
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const quarter = (req.query.quarter as string) || "Fall 2026";
    const result = await getRecommendations(req.userId!, quarter);

    if (!result) {
      res.status(404).json({
        message: "Set your major in your profile to get recommendations.",
      });
      return;
    }

    res.json({ quarter, ...result });
  } catch (err: any) {
    res.status(500).json({ message: err?.message });
  }
});

export default router;
