import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { StudentSchema } from "@life-planner/schemas";
import { prisma } from "@life-planner/db";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});
// A test route to prove the schema works
app.post("/test-schema", (req, res) => {
  const result = StudentSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ message: "Invalid data!", errors: result.error });
  }
  res.json({ message: "Monorepo is working!", data: result.data });
});

// Quick DB connectivity + write/read test
app.post("/test-db", async (req, res) => {
  try {
    const { name, email, major } = req.body;

    // validate input with Zod
    const parsed = StudentSchema.safeParse({ name, email, major });
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid data!", errors: parsed.error });
    }

    // write
    const created = await prisma.student.create({
      data: parsed.data,
    });

    // read
    const found = await prisma.student.findUnique({
      where: { email: created.email },
    });

    res.json({
      message: "DB is working!",
      created,
      found,
    });
  } catch (err: any) {
    res.status(500).json({
      message: "DB test failed",
      error: err?.message ?? err,
    });
  }
});

//start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 API running on http://localhost:${PORT}`);
});