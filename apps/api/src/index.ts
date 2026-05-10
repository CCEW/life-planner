import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import path from "path";
import googleCalendarRouter from "./routes/googleCalendar";
import authRouter from "./routes/auth";
import professorsRouter from "./routes/professors";
import aiRouter from "./routes/ai";
import transcriptRouter from "./routes/transcript";
import coursesRouter from "./routes/courses";
import degreeAuditRouter from "./routes/degreeAudit";
import recommendationsRouter from "./routes/recommendations";
import userCoursesRouter from "./routes/userCourses";
import aggieMateRouter from "./routes/aggieMate";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const app = express();
const isVercel = process.env.VERCEL === "1" || process.env.VERCEL === "true";

app.use(cors({
  origin: process.env.FRONTEND_URL ?? "http://localhost:3000",
  credentials: true,
}));

app.use(cookieParser());
app.use(express.json({ limit: "12mb" }));

// Auth (signup / signin)
app.use(authRouter);

// Google Calendar OAuth + events
app.use(googleCalendarRouter);

// Professor search data
app.use(professorsRouter);

// Transcript PDF parsing
app.use(transcriptRouter);

// Aggie Mate study partner matching
app.use(aggieMateRouter);

app.use("/ai", aiRouter);
app.use("/courses", coursesRouter);
app.use("/api/courses", coursesRouter);
app.use("/degree-audit", degreeAuditRouter);
app.use("/recommendations", recommendationsRouter);
app.use("/user-courses", userCoursesRouter);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

if (!isVercel) {
  const PORT = process.env.PORT ?? 4000;
  app.listen(PORT, () => {
    console.log(`API running on http://localhost:${PORT}`);
  });
}

export default app;
