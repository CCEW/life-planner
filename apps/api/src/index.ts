import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import path from "path";
import googleCalendarRouter from "./routes/googleCalendar";
import authRouter from "./routes/auth";
import aiRouter from "./routes/ai";
import transcriptRouter from "./routes/transcript";
import coursesRouter from "./routes/courses";
import degreeAuditRouter from "./routes/degreeAudit";
import recommendationsRouter from "./routes/recommendations";
import userCoursesRouter from "./routes/userCourses";
import aggieMateRouter from "./routes/aggieMate";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL ?? "http://localhost:3000",
  credentials: true,
}));

app.use(cookieParser());
app.use(express.json());

// ── Auth (signup / signin) ────────────────────────────────────────────────────
app.use(authRouter);

// ── Google Calendar OAuth + events ───────────────────────────────────────────
app.use(googleCalendarRouter);

// ── Transcript PDF parsing ───────────────────────────────────────────────────
app.use(transcriptRouter);

// ── Aggie Mate study partner matching ────────────────────────────────────────
app.use(aggieMateRouter);

app.use("/ai", aiRouter);
app.use("/courses", coursesRouter);
app.use("/api/courses", coursesRouter);
app.use("/degree-audit", degreeAuditRouter);
app.use("/recommendations", recommendationsRouter);
app.use("/user-courses", userCoursesRouter);

// ── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const PORT = process.env.PORT ?? 4000;
app.listen(PORT, () => {
  console.log(`🚀 API running on http://localhost:${PORT}`);
});
