import { Router, Request, Response } from "express";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const router = Router();

type ProfessorRow = {
  id: string;
  name: string;
  email: string | null;
  title: string | null;
  department: string | null;
  dept: string | null;
  office: string | null;
  phoneNumber: string | null;
  personalSite: string | null;
  sourceUrl: string | null;
  about: string | null;
  labName: string | null;
  labDescription: string | null;
  interests: string[] | null;
  researchInterestIds: string[] | null;
  departmentSubjects: string[] | null;
  topicScores: Record<string, unknown> | null;
  topicKeywordHits: Record<string, unknown> | null;
  topMatchedRequirementCourses: unknown[] | null;
};

type DraftProfessor = {
  name?: string;
  email?: string;
  title?: string;
  dept?: string;
  department?: string;
  interests?: string[];
  about?: string;
  labDescription?: string;
  personalSite?: string;
  sourceUrl?: string;
  topMatchedRequirementCourses?: unknown[];
};

type DraftEmailRequest = {
  professor?: DraftProfessor;
  resume?: {
    fileName?: string;
    mimeType?: string;
    dataBase64?: string;
  };
  senderEmail?: string;
};

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  error?: {
    message?: string;
  };
};

let supabase: SupabaseClient | null = null;

const MAX_RESUME_BYTES = 6 * 1024 * 1024;
const MAX_WEBSITE_CHARS = 16000;

function getSupabase() {
  if (supabase) {
    return supabase;
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY are required.");
  }

  supabase = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return supabase;
}

function cleanString(value: string | null | undefined, fallback = "") {
  const cleaned = value?.trim();
  if (!cleaned || cleaned.toLowerCase() === "info not applicable") {
    return fallback;
  }
  return cleaned;
}

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function cleanBase64(value: string | undefined) {
  return (value ?? "").replace(/^data:application\/pdf;base64,/i, "").replace(/\s/g, "");
}

function estimateBase64Bytes(value: string) {
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return Math.floor((value.length * 3) / 4) - padding;
}

function externalHref(value: string | undefined) {
  const href = cleanString(value);
  if (!href) {
    return "";
  }
  return /^https?:\/\//i.test(href) ? href : `https://${href}`;
}

function uniqueValues(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function htmlToText(html: string) {
  return compactWhitespace(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/g, "'")
  );
}

async function fetchWebsiteText(href: string, label: string) {
  if (!href) {
    return "";
  }

  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return "";
  }

  if (!["http:", "https:"].includes(url.protocol) || ["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    return "";
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(url.toString(), {
      headers: {
        "user-agent": "StudentLifeHelper/1.0 professor-email-draft",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return "";
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      return "";
    }

    const text = htmlToText(await response.text());
    return `${label} (${url.toString()}): ${text.slice(0, Math.floor(MAX_WEBSITE_CHARS / 2))}`;
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchProfessorWebsiteText(professor: DraftProfessor) {
  const urls = uniqueValues([externalHref(professor.personalSite), externalHref(professor.sourceUrl)]);
  const snippets = await Promise.all(
    urls.map((url, index) => fetchWebsiteText(url, index === 0 ? "Primary professor site" : "UC Davis profile"))
  );

  return snippets.filter(Boolean).join("\n\n").slice(0, MAX_WEBSITE_CHARS);
}

function formatMatchedCourses(courses: unknown[] | undefined) {
  return (courses ?? [])
    .slice(0, 8)
    .map((course) => {
      if (!course || typeof course !== "object") {
        return "";
      }
      const record = course as Record<string, unknown>;
      const code = typeof record.course_code === "string" ? record.course_code : "";
      const title = typeof record.course_title === "string" ? record.course_title : "";
      const labels = Array.isArray(record.matched_topic_labels)
        ? record.matched_topic_labels.filter((label): label is string => typeof label === "string").slice(0, 3).join(", ")
        : "";

      return [code, title, labels && `topics: ${labels}`].filter(Boolean).join(" - ");
    })
    .filter(Boolean)
    .join("\n");
}

function buildDraftPrompt(professor: DraftProfessor, websiteText: string, senderEmail: string) {
  const professorName = cleanString(professor.name) || "the professor";
  const department = cleanString(professor.department ?? professor.dept);
  const keywords = (professor.interests ?? []).map((interest) => cleanString(interest)).filter(Boolean).join(", ");
  const profileSummary = uniqueValues([cleanString(professor.about), cleanString(professor.labDescription)]).join(" ");
  const matchedCourses = formatMatchedCourses(professor.topMatchedRequirementCourses);
  const senderEmailLine = senderEmail ? `Student sender email: ${senderEmail}\n` : "";

  return `Draft a specific cold research opportunity email from a UC Davis undergraduate student to this professor.

Return exactly this format, with no markdown and no extra commentary:
Subject: <email subject>
Body:
<email body>

Rules:
- Use the attached resume PDF to identify concrete student evidence: named projects, tools, coursework, technical skills, prior roles, and measurable outcomes.
- Use the professor data below to identify concrete professor evidence: research nouns, lab/project names, methods, application areas, publications, keywords, and matched course topics.
- The email must connect at least two concrete student details to at least two concrete professor research details.
- Mention one professor-specific detail in the first paragraph; do not wait until the end.
- Prefer phrases like "my project on X connects to your work on Y" over generic praise.
- Avoid generic phrases unless they are supported by evidence. Do not use: "I found your work compelling", "strong interest", "aligns well", or "passionate about" without a concrete reason.
- Do not invent student experience, projects, grades, publications, or availability.
- If something is not clear from the resume, use a bracketed placeholder instead of making it up.
- Keep the body professional, warm, and direct. Aim for 190-260 words.
- Do not include markdown, explanations, or extra fields.
- Include a polite ask for a short meeting or research assistant opportunity.
- End with only the student's name placeholder if the name is not clear. Do not include missing email or missing phone placeholders.
- Do not say you checked the website; simply use the information naturally.

${senderEmailLine}

Professor profile:
Name: ${professorName}
Email: ${cleanString(professor.email) || "Not provided"}
Title: ${cleanString(professor.title) || "Not provided"}
Department: ${department || "Not provided"}
Keywords: ${keywords || "Not provided"}
Profile and lab summary: ${profileSummary || "Not provided"}
Matched course/research hints:
${matchedCourses || "Not provided"}
Professor URLs:
- Personal site: ${externalHref(professor.personalSite) || "Not provided"}
- UC Davis profile: ${externalHref(professor.sourceUrl) || "Not provided"}
Website excerpt: ${websiteText || "Website text was unavailable. Use only the profile summary and resume."}`;
}

function textFromGeminiResponse(payload: GeminiGenerateContentResponse) {
  return (payload.candidates ?? [])
    .flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

function parseDraftResponse(text: string) {
  try {
    const jsonText = text.match(/\{[\s\S]*\}/)?.[0] ?? text;
    const parsed = JSON.parse(jsonText) as { subject?: unknown; body?: unknown };
    const subject = typeof parsed.subject === "string" ? parsed.subject.trim() : "";
    const body = typeof parsed.body === "string" ? cleanDraftBody(parsed.body) : "";
    if (subject && body) {
      return { subject, body };
    }
  } catch {
    // Gemini can occasionally return human-readable sections even when JSON is requested.
  }

  const subjectMatch = text.match(/^Subject:\s*(.+)$/im);
  const bodyMatch = text.match(/^Body:\s*([\s\S]+)$/im);

  return {
    subject: subjectMatch?.[1]?.trim() ?? "",
    body: cleanDraftBody(bodyMatch?.[1] ?? ""),
  };
}

function cleanDraftBody(body: string) {
  return body
    .split(/\r?\n/)
    .filter((line) => !/^\s*\[(?:student\s+)?(?:email|phone)(?:\s+not\s+provided)?\]\s*$/i.test(line))
    .filter((line) => !/^\s*\[(?:your\s+)?(?:email|phone)\]\s*$/i.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function toProfessorSearchProfile(row: ProfessorRow) {
  const department = cleanString(row.department ?? row.dept);
  const about = cleanString(row.about ?? row.labDescription);
  const interests = (row.interests ?? []).map((interest) => cleanString(interest)).filter(Boolean);

  return {
    id: row.id,
    name: row.name,
    email: cleanString(row.email),
    title: cleanString(row.title),
    department,
    dept: department,
    office: cleanString(row.office),
    phoneNumber: cleanString(row.phoneNumber),
    personalSite: cleanString(row.personalSite),
    sourceUrl: cleanString(row.sourceUrl),
    about,
    labName: cleanString(row.labName),
    labDescription: cleanString(row.labDescription ?? row.about),
    interests,
    researchInterestIds: row.researchInterestIds ?? [],
    departmentSubjects: row.departmentSubjects ?? [],
    topicScores: row.topicScores ?? {},
    topicKeywordHits: row.topicKeywordHits ?? {},
    topMatchedRequirementCourses: row.topMatchedRequirementCourses ?? [],
  };
}

router.get("/professors", async (_req: Request, res: Response) => {
  try {
    const { data, error } = await getSupabase()
      .from("Professor")
      .select(
        [
          "id",
          "name",
          "email",
          "title",
          "department",
          "dept",
          "office",
          "phoneNumber",
          "personalSite",
          "sourceUrl",
          "about",
          "labName",
          "labDescription",
          "interests",
          "researchInterestIds",
          "departmentSubjects",
          "topicScores",
          "topicKeywordHits",
          "topMatchedRequirementCourses",
        ].join(",")
      )
      .order("name", { ascending: true })
      .limit(1000);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({
      professors: ((data ?? []) as unknown as ProfessorRow[]).map(toProfessorSearchProfile),
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to load professors.",
    });
  }
});

router.post("/professors/draft-email", async (req: Request, res: Response) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "GEMINI_API_KEY is not configured on the API server." });
      return;
    }

    const body = req.body as DraftEmailRequest;
    const professor = body.professor;
    const resumeBase64 = cleanBase64(body.resume?.dataBase64);

    if (!professor?.name) {
      res.status(400).json({ error: "Professor information is required." });
      return;
    }

    if (!resumeBase64) {
      res.status(400).json({ error: "A PDF resume is required for AI drafting." });
      return;
    }

    if ((body.resume?.mimeType && body.resume.mimeType !== "application/pdf") || !/^[A-Za-z0-9+/=]+$/.test(resumeBase64)) {
      res.status(400).json({ error: "Resume must be a valid PDF file." });
      return;
    }

    if (estimateBase64Bytes(resumeBase64) > MAX_RESUME_BYTES) {
      res.status(413).json({ error: "Resume PDF is too large. Please upload a PDF under 6 MB." });
      return;
    }

    const websiteText = await fetchProfessorWebsiteText(professor);
    const prompt = buildDraftPrompt(professor, websiteText, cleanString(body.senderEmail));
    const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const geminiResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: "You write careful, truthful, concise academic outreach emails. You never invent resume details.",
            },
          ],
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                inline_data: {
                  mime_type: "application/pdf",
                  data: resumeBase64,
                },
              },
              {
                text: prompt,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 1200,
          thinkingConfig: {
            thinkingBudget: 0,
          },
        },
      }),
    });

    const geminiPayload = await geminiResponse.json() as GeminiGenerateContentResponse;

    if (!geminiResponse.ok) {
      res.status(geminiResponse.status).json({
        error: geminiPayload.error?.message ?? "Gemini could not draft the email.",
      });
      return;
    }

    const draft = parseDraftResponse(textFromGeminiResponse(geminiPayload));
    if (!draft.subject || !draft.body) {
      res.status(502).json({ error: "Gemini returned an incomplete email draft." });
      return;
    }

    res.json(draft);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to draft email.",
    });
  }
});

export default router;
