import { Router, Response } from "express";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { runDegreeAudit } from "../lib/audit";

const router = Router();
router.use(requireAuth);

// POST /degree-audit/run
router.post("/run", async (req: AuthRequest, res: Response) => {
  try {
    const { major } = req.body;
    const metadataMajor =
      typeof req.userMetadata?.major === "string" && req.userMetadata.major.trim()
        ? req.userMetadata.major.trim()
        : undefined;
    const result = await runDegreeAudit(req.userId!, major ?? metadataMajor);
    if (!result) {
      res.status(404).json({
        message: "No major found. Set your major in your profile or pass { major: 'Computer Science' } in the request body.",
      });
      return;
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ message: err?.message });
  }
});

export default router;
