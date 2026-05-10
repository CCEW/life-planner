import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import path from "path";
import googleCalendarRouter from "./routes/googleCalendar";
import authRouter from "./routes/auth";
import transcriptRouter from "./routes/transcript";
import coursesRouter from "./routes/courses";
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

// ── Transcript PDF parsing ────────────────────────────────────────────────────
app.use(transcriptRouter);

// ── Course offerings from Supabase ───────────────────────────────────────────
app.use(coursesRouter);

// ── Aggie Mate study partner matching ────────────────────────────────────────
app.use(aggieMateRouter);

// ── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const PORT = process.env.PORT ?? 4000;
app.listen(PORT, () => {
  console.log(`🚀 API running on http://localhost:${PORT}`);
});
