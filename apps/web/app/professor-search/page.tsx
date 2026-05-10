"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";

// ─── Data ─────────────────────────────────────────────────────────────────────

type Professor = {
  name: string;
  email: string;
  dept: string;
  interests: string[];
  title: string;
  labName: string;
  labDescription: string;
  about: string;
  office: string;
  publications: number;
  openPositions: boolean;
};

const PROFESSORS: Professor[] = [
  {
    name: "Dr. Jane Smith", email: "jsmith@ucdavis.edu", dept: "Computer Science",
    interests: ["Machine Learning", "Natural Language Processing", "AI Ethics"],
    title: "Associate Professor",
    labName: "Intelligent Systems & Language Lab (ISLL)",
    labDescription: "The ISLL investigates how machines can understand and generate human language, with a focus on fairness and accountability in AI systems. Current projects include bias detection in large language models and low-resource NLP for underrepresented languages.",
    about: "Dr. Smith joined UC Davis in 2018 after completing her postdoc at Stanford AI Lab. She has published over 40 peer-reviewed papers and serves on the editorial board of the Journal of AI Research. She is passionate about making AI research accessible to undergraduates.",
    office: "Kemper Hall 3021", publications: 42, openPositions: true,
  },
  {
    name: "Dr. Robert Chen", email: "rchen@ucdavis.edu", dept: "Computer Science",
    interests: ["Computer Vision", "Robotics", "Deep Learning"],
    title: "Professor",
    labName: "Autonomous Robotics & Vision Lab (ARVLab)",
    labDescription: "ARVLab develops perception and planning systems for autonomous robots. The lab's research spans surgical robotics, agricultural automation, and real-time 3D scene understanding using deep neural networks.",
    about: "Dr. Chen is a UC Davis alumnus who returned to the department in 2015. He holds 12 patents in robotic perception and has led projects funded by DARPA and NSF. He enjoys mentoring undergraduate researchers through hands-on hardware projects.",
    office: "Kemper Hall 2105", publications: 67, openPositions: true,
  },
  {
    name: "Dr. Maria Lopez", email: "mlopez@ucdavis.edu", dept: "Biology",
    interests: ["Genomics", "CRISPR", "Synthetic Biology"],
    title: "Assistant Professor",
    labName: "Genome Engineering Lab",
    labDescription: "The Genome Engineering Lab uses CRISPR-Cas9 and novel base-editing tools to study gene function in plant and mammalian systems. A core focus is engineering drought-resistant crops for climate adaptation.",
    about: "Dr. Lopez completed her PhD at MIT and was a Salk Institute Fellow before joining UC Davis in 2021. Her work has been featured in Nature and Cell. She is an advocate for open-science practices and undergraduate inclusion in research.",
    office: "Briggs Hall 240", publications: 18, openPositions: true,
  },
  {
    name: "Dr. Kevin Park", email: "kpark@ucdavis.edu", dept: "Biology",
    interests: ["Neuroscience", "Cell Biology", "Cancer Research"],
    title: "Professor",
    labName: "Neural Oncology & Cell Signaling Lab",
    labDescription: "The lab investigates how cancer cells hijack neuronal signaling pathways to promote tumor growth and metastasis. Research combines live-cell imaging, proteomics, and mouse models to identify therapeutic targets.",
    about: "Dr. Park has been at UC Davis since 2010 and is a member of the UC Davis Comprehensive Cancer Center. He has trained over 20 graduate students and 35 undergraduates, many of whom have gone on to MD/PhD programs.",
    office: "Tupper Hall 1107", publications: 88, openPositions: false,
  },
  {
    name: "Dr. Sarah Nguyen", email: "snguyen@ucdavis.edu", dept: "Psychology",
    interests: ["Cognitive Science", "Neuroimaging", "Decision Making"],
    title: "Associate Professor",
    labName: "Cognition & Brain Imaging Lab (CBIL)",
    labDescription: "CBIL studies how humans make decisions under uncertainty, using fMRI and EEG to map the neural circuits involved. Current projects examine how sleep deprivation and stress alter risk assessment in young adults.",
    about: "Dr. Nguyen received her PhD from UC Berkeley and completed a clinical neuropsychology internship before transitioning to research. She directs the UC Davis fMRI Center and welcomes undergraduates with interests in both psychology and data analysis.",
    office: "Young Hall 172", publications: 31, openPositions: true,
  },
  {
    name: "Dr. James Wilson", email: "jwilson@ucdavis.edu", dept: "Mathematics",
    interests: ["Data Science", "Optimization", "Graph Theory"],
    title: "Professor",
    labName: "Applied Mathematics & Data Science Group",
    labDescription: "The group develops mathematical foundations for modern machine learning, including convergence guarantees for stochastic optimization algorithms and spectral methods for large graph analysis. Work is applied to network security and recommendation systems.",
    about: "Dr. Wilson joined UC Davis in 2008 and has held visiting positions at Google Research and the Simons Institute. He teaches a popular undergraduate course in data science and actively recruits students for summer research fellowships.",
    office: "Mathematical Sciences Building 3107", publications: 55, openPositions: true,
  },
  {
    name: "Dr. Aisha Patel", email: "apatel@ucdavis.edu", dept: "Economics",
    interests: ["Behavioral Economics", "Public Policy", "Game Theory"],
    title: "Assistant Professor",
    labName: "Behavioral & Policy Economics Lab",
    labDescription: "The lab runs field and lab experiments to study how people deviate from rational decision-making, and how policy can be designed to account for these biases. Recent work examines nudge interventions in student financial aid applications.",
    about: "Dr. Patel completed her PhD at Princeton and was a postdoctoral fellow at the Abdul Latif Jameel Poverty Action Lab (J-PAL) before joining UC Davis in 2022. She is known for making economics research accessible through public writing and undergraduate seminars.",
    office: "Social Sciences & Humanities 1137", publications: 11, openPositions: true,
  },
  {
    name: "Dr. Tom Nakamura", email: "tnakamura@ucdavis.edu", dept: "Chemistry",
    interests: ["Organic Chemistry", "Drug Discovery", "Spectroscopy"],
    title: "Professor",
    labName: "Nakamura Medicinal Chemistry Lab",
    labDescription: "The lab designs and synthesizes small-molecule drug candidates targeting neglected tropical diseases. Students gain hands-on experience in total synthesis, NMR spectroscopy, and in vitro bioassays.",
    about: "Dr. Nakamura has been at UC Davis since 2005 and is co-founder of a biotech startup spun out of his lab. He has received the UC Davis Distinguished Teaching Award and mentors students in both research skills and science communication.",
    office: "Chemistry Annex 109", publications: 74, openPositions: false,
  },
];

const ALL_DEPARTMENTS   = [...new Set(PROFESSORS.map((p) => p.dept))].sort();
const ALL_INTERESTS     = [...new Set(PROFESSORS.flatMap((p) => p.interests))].sort();

function emailTemplate(prof: Professor): string {
  return `Dear Professor ${prof.name.replace("Dr. ", "")},

I am a UC Davis undergraduate student majoring in [Your Major], and I came across your research on ${prof.interests[0]} and ${prof.interests[1] ?? prof.interests[0]}. I found your work particularly compelling and would love to learn more.

I am writing to inquire about any opportunities to contribute to your lab as a research assistant. I am a motivated student eager to gain hands-on research experience, and I believe my background in [relevant coursework/skills] aligns well with the work your lab is doing.

I have attached my resume for your review. I would be grateful for the opportunity to speak with you at your convenience.

Thank you for your time and consideration.

Sincerely,
[Your Name]
[Your Email]
[Your Phone]`;
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function ArrowLeftIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94AAA1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function FlaskIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6A9879" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3h6M9 3v7l-4 9h14l-4-9V3" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6A9879" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function MapPinIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94AAA1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 1 1 18 0z" /><circle cx="12" cy="10" r="3" />
    </svg>
  );
}

// ─── Professor detail modal ───────────────────────────────────────────────────

function ProfessorModal({
  prof,
  onClose,
  onDraft,
  isDrafted,
}: {
  prof: Professor;
  onClose: () => void;
  onDraft: (p: Professor) => void;
  isDrafted: boolean;
}) {
  const initials = prof.name
    .replace("Dr. ", "")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2);

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Panel */}
      <div
        className="relative bg-[#F4F2E8] rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#94AAA1] hover:text-[#1a1a1a] transition-colors z-10"
          aria-label="Close"
        >
          <XIcon />
        </button>

        {/* Header */}
        <div className="bg-[#1B3968] px-6 py-6 rounded-t-2xl flex items-start gap-4">
          {/* Avatar */}
          <div className="w-14 h-14 rounded-xl bg-[#6A9879]/30 border border-[#6A9879]/40 flex items-center justify-center shrink-0">
            <span className="text-white text-lg font-semibold">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-[17px] font-semibold leading-tight">{prof.name}</p>
            <p className="text-white/60 text-[13px] mt-0.5">{prof.title}</p>
            <p className="text-[#A5BA9B] text-[12px] mt-0.5">{prof.dept}</p>
            <div className="flex items-center gap-1.5 mt-2">
              <MapPinIcon />
              <span className="text-white/50 text-[11px]">{prof.office}</span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-white text-[22px] font-semibold">{prof.publications}</p>
            <p className="text-white/50 text-[10px] uppercase tracking-wide">Publications</p>
          </div>
        </div>

        <div className="px-6 py-5 flex flex-col gap-5">

          {/* Open positions badge */}
          <div className="flex items-center gap-2">
            <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full ${
              prof.openPositions
                ? "bg-[#6A9879]/15 text-[#487A62]"
                : "bg-[#B3C1BB]/20 text-[#94AAA1]"
            }`}>
              {prof.openPositions ? "✓ Open to student researchers" : "Lab currently full"}
            </span>
          </div>

          {/* Lab */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FlaskIcon />
              <p className="text-[12px] font-semibold text-[#5a6872] uppercase tracking-wide">Lab</p>
            </div>
            <p className="text-[14px] font-semibold text-[#1a1a1a] mb-1.5">{prof.labName}</p>
            <p className="text-[13px] text-[#5a6872] leading-relaxed">{prof.labDescription}</p>
          </div>

          {/* About */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <UserIcon />
              <p className="text-[12px] font-semibold text-[#5a6872] uppercase tracking-wide">About</p>
            </div>
            <p className="text-[13px] text-[#5a6872] leading-relaxed">{prof.about}</p>
          </div>

          {/* Research interests */}
          <div>
            <p className="text-[12px] font-semibold text-[#5a6872] uppercase tracking-wide mb-2">Research Interests</p>
            <div className="flex flex-wrap gap-2">
              {prof.interests.map((i) => (
                <span key={i} className="text-[12px] px-2.5 py-1 rounded-full bg-[#E4E8DC] text-[#487A62] font-medium">
                  {i}
                </span>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={() => { onDraft(prof); onClose(); }}
              className={`flex-1 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-150 ${
                isDrafted
                  ? "bg-[#487A62] text-white"
                  : "bg-[#1B3968] text-white hover:opacity-90"
              }`}
            >
              {isDrafted ? "✓ Email drafted" : "Draft cold email"}
            </button>
            <a
              href={`mailto:${prof.email}`}
              className="px-4 py-2.5 rounded-xl border border-[#B3C1BB]/60 text-[13px] font-medium text-[#1B3968] hover:bg-[#EBF0F6] transition-colors"
            >
              {prof.email}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function PaperclipIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

// ─── Reusable checkbox filter list ────────────────────────────────────────────

function FilterList({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: string[];
  selected: Set<string>;
  onToggle: (v: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-[#B3C1BB]/40 bg-white/70 p-4">
      <p className="text-[13px] font-semibold text-[#1a1a1a] mb-3">{label}</p>
      <div className="flex flex-col gap-2 max-h-52 overflow-y-auto pr-1">
        {options.map((opt) => (
          <label key={opt} className="flex items-center gap-2 cursor-pointer group">
            <input
              type="checkbox"
              checked={selected.has(opt)}
              onChange={() => onToggle(opt)}
              className="accent-[#1B3968] w-3.5 h-3.5 shrink-0"
            />
            <span className="text-[12px] text-[#5a6872] group-hover:text-[#1a1a1a] transition-colors leading-snug">
              {opt}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProfessorSearchPage() {
  const [query,       setQuery]       = useState("");
  const [deptFilter,  setDeptFilter]  = useState<Set<string>>(new Set());
  const [intFilter,   setIntFilter]   = useState<Set<string>>(new Set());
  const [drafted,     setDrafted]     = useState<Professor | null>(null);
  const [viewedProf,  setViewedProf]  = useState<Professor | null>(null);
  const [emailBody,   setEmailBody]   = useState("");
  const [subject,     setSubject]     = useState("");
  const [resumeFile,  setResumeFile]  = useState<File | null>(null);

  function toggleSet(set: Set<string>, value: string): Set<string> {
    const next = new Set(set);
    next.has(value) ? next.delete(value) : next.add(value);
    return next;
  }

  const filtered = useMemo(() => {
    return PROFESSORS.filter((p) => {
      const q = query.toLowerCase();
      const matchesQuery =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.dept.toLowerCase().includes(q) ||
        p.interests.some((i) => i.toLowerCase().includes(q));
      const matchesDept = deptFilter.size === 0 || deptFilter.has(p.dept);
      const matchesInt  = intFilter.size  === 0 || p.interests.some((i) => intFilter.has(i));
      return matchesQuery && matchesDept && matchesInt;
    });
  }, [query, deptFilter, intFilter]);

  function handleDraft(prof: Professor) {
    setDrafted(prof);
    setSubject(`Research Opportunity Inquiry — ${prof.name}'s Lab`);
    setEmailBody(emailTemplate(prof));
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F2E8]">
      {viewedProf && (
        <ProfessorModal
          prof={viewedProf}
          onClose={() => setViewedProf(null)}
          onDraft={handleDraft}
          isDrafted={drafted?.email === viewedProf.email}
        />
      )}

      {/* ── Navbar ── */}
      <nav className="bg-[#B4E1FF] px-8 py-1.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <Image src="/logo2.png" alt="Student Life Helper" width={100} height={100} className="object-contain" />
          <span className="text-[#241715] text-[30px] font-medium tracking-wide">Student Life Helper</span>
        </div>
        <Link href="/dashboard" className="flex items-center gap-1.5 text-[#2C1A1D] text-[13px] hover:text-[#2C1A1D]/70 transition-colors">
          <ArrowLeftIcon />
          Return to home page
        </Link>
      </nav>

      <main className="flex-1 flex flex-col px-8 py-6 gap-5 max-w-7xl mx-auto w-full">

        {/* ── Search bar ── */}
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2">
            <SearchIcon />
          </span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, department, or research interest…"
            className="w-full pl-10 pr-4 py-3 rounded-2xl border border-[#B3C1BB]/50 bg-white/80 text-[14px] text-[#1a1a1a] placeholder:text-[#B3C1BB] focus:outline-none focus:border-[#1B3968] focus:ring-2 focus:ring-[#1B3968]/10 shadow-sm"
          />
        </div>

        {/* ── Three-column grid ── */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[200px_1fr_340px] gap-5 items-start">

          {/* ── Left: filters ── */}
          <div className="flex flex-col gap-4">
            <FilterList
              label="Department"
              options={ALL_DEPARTMENTS}
              selected={deptFilter}
              onToggle={(v) => setDeptFilter((s) => toggleSet(s, v))}
            />
            <FilterList
              label="Research Interest"
              options={ALL_INTERESTS}
              selected={intFilter}
              onToggle={(v) => setIntFilter((s) => toggleSet(s, v))}
            />
          </div>

          {/* ── Middle: professor list ── */}
          <div className="rounded-2xl border border-[#B3C1BB]/40 bg-white/70 overflow-hidden">
            <div className="px-5 pt-5 pb-3 border-b border-[#B3C1BB]/30">
              <p className="text-[13px] font-semibold text-[#1a1a1a]">
                {filtered.length} professor{filtered.length !== 1 ? "s" : ""} found
              </p>
            </div>

            <div className="flex flex-col divide-y divide-[#B3C1BB]/20">
              {filtered.length === 0 ? (
                <div className="px-5 py-12 text-center text-[13px] text-[#B3C1BB]">
                  No professors match your filters.
                </div>
              ) : (
                filtered.map((prof) => (
                  <div
                    key={prof.email}
                    onClick={() => setViewedProf(prof)}
                    className="px-5 py-4 flex flex-col gap-1.5 cursor-pointer hover:bg-[#EBF0F6]/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[14px] font-semibold text-[#1a1a1a]">{prof.name}</p>
                        <p className="text-[12px] text-[#5a6872]">{prof.title} · {prof.dept}</p>
                      </div>
                      {prof.openPositions && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#6A9879]/15 text-[#487A62] font-medium shrink-0 mt-0.5">
                          Open
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {prof.interests.map((interest) => (
                        <span
                          key={interest}
                          className="text-[11px] px-2 py-0.5 rounded-full bg-[#E4E8DC] text-[#487A62] font-medium"
                        >
                          {interest}
                        </span>
                      ))}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDraft(prof); }}
                      className={`mt-2 self-end text-[12px] font-medium px-3 py-1.5 rounded-lg transition-all duration-150
                        ${drafted?.email === prof.email
                          ? "bg-[#1B3968] text-white"
                          : "border border-[#B3C1BB]/60 text-[#1B3968] hover:bg-[#1B3968] hover:text-white hover:border-[#1B3968]"
                        }`}
                    >
                      {drafted?.email === prof.email ? "✓ Drafted" : "Draft email"}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* ── Right: Cold Email Template ── */}
          <div className="rounded-2xl border border-[#B3C1BB]/40 bg-white/70 overflow-hidden flex flex-col">
            <div className="px-5 pt-5 pb-3 border-b border-[#B3C1BB]/30">
              <p className="text-[13px] font-semibold text-[#1a1a1a]">Cold Email Template</p>
              {drafted && (
                <p className="text-[11px] text-[#6A9879] mt-0.5">
                  Drafted for {drafted.name}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-4 px-5 py-4 flex-1">
              {/* To */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-[#94AAA1] uppercase tracking-wide">To</label>
                <input
                  type="email"
                  value={drafted?.email ?? ""}
                  readOnly
                  placeholder="Select a professor to auto-fill"
                  className="text-[13px] px-3 py-2 rounded-lg border border-[#B3C1BB]/40 bg-[#F8F8F6] text-[#1a1a1a] placeholder:text-[#B3C1BB] focus:outline-none"
                />
              </div>

              {/* From */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-[#94AAA1] uppercase tracking-wide">From</label>
                <input
                  type="email"
                  defaultValue="username@ucdavis.edu"
                  className="text-[13px] px-3 py-2 rounded-lg border border-[#B3C1BB]/40 bg-[#F8F8F6] text-[#1a1a1a] focus:outline-none focus:border-[#1B3968] focus:ring-1 focus:ring-[#1B3968]/10"
                />
              </div>

              {/* Subject */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-[#94AAA1] uppercase tracking-wide">Subject</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Email subject…"
                  className="text-[13px] px-3 py-2 rounded-lg border border-[#B3C1BB]/40 bg-[#F8F8F6] text-[#1a1a1a] placeholder:text-[#B3C1BB] focus:outline-none focus:border-[#1B3968] focus:ring-1 focus:ring-[#1B3968]/10"
                />
              </div>

              {/* Body */}
              <div className="flex flex-col gap-1 flex-1">
                <label className="text-[11px] font-semibold text-[#94AAA1] uppercase tracking-wide">Body</label>
                <textarea
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  placeholder="Click 'Draft email' on a professor to generate a template…"
                  rows={10}
                  className="text-[12px] px-3 py-2 rounded-lg border border-[#B3C1BB]/40 bg-[#F8F8F6] text-[#1a1a1a] placeholder:text-[#B3C1BB] focus:outline-none focus:border-[#1B3968] focus:ring-1 focus:ring-[#1B3968]/10 resize-none leading-relaxed flex-1"
                />
              </div>

              {/* Resume attachment */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-[#94AAA1] uppercase tracking-wide">
                  Resume Attachment
                </label>
                <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-[#B3C1BB]/60 bg-[#F8F8F6] cursor-pointer hover:border-[#1B3968] hover:bg-[#EBF0F6] transition-colors">
                  <PaperclipIcon />
                  <span className="text-[12px] text-[#5a6872] truncate">
                    {resumeFile ? resumeFile.name : "Attach your resume (PDF)"}
                  </span>
                  <input
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={(e) => setResumeFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>

              {/* Send button */}
              <button
                disabled={!drafted}
                className="w-full py-2.5 rounded-xl bg-[#1B3968] text-white text-[13px] font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Send email
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
