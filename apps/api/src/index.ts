import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import path from "path";
import googleCalendarRouter from "./routes/googleCalendar";
import authRouter from "./routes/auth";
import transcriptRouter from "./routes/transcript";

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

// ── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const PORT = process.env.PORT ?? 4000;
app.listen(PORT, () => {
  console.log(`🚀 API running on http://localhost:${PORT}`);
});