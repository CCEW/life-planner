"use client";

import { useState } from "react";
import Link from "next/link";

// ─── Icon components (inline SVG, no extra dependency) ────────────────────────

function BookIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6A9879" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function SchoolIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6A9879" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 10v6M2 10l10-5 10 5-10 5-10-5z" />
      <path d="M6 12v5c3 3 9 3 12 0v-5" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6A9879" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6A9879" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function MicroscopeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6A9879" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 18h8" />
      <path d="M3 22h18" />
      <path d="M14 22a7 7 0 1 0 0-14h-1" />
      <path d="M9 14h2" />
      <path d="M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2Z" />
      <path d="M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

const inputClass =
  "text-[13px] px-3 py-2 rounded-lg border border-[#B3C1BB]/60 bg-white/80 " +
  "text-[#1a1a1a] w-full placeholder:text-[#94AAA1] " +
  "focus:outline-none focus:border-[#1B3968] focus:ring-2 focus:ring-[#1B3968]/10 transition-shadow";

function Field({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 mb-3">
      <label className="text-[12px] font-medium text-[#5a6872]">{label}</label>
      {children}
    </div>
  );
}

function Feature({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-[#6A9879]/20 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-[13px] font-medium text-white mb-0.5">{title}</p>
        <p className="text-[11px] text-white/55 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SignUpPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#F4F2E8] p-4 sm:p-8">
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 rounded-2xl overflow-hidden border border-[#B3C1BB]/40 shadow-sm">

        {/* ── Left: Form ── */}
        <div className="bg-[#F4F2E8] px-8 py-10 flex flex-col justify-center">

          {/* Logo */}
          <div className="flex items-center gap-2 mb-7">
            <div className="w-7 h-7 rounded-md bg-[#1B3968] flex items-center justify-center">
              <BookIcon />
            </div>
            <span className="text-sm font-medium text-[#1a1a1a]">Student Life Helper</span>
          </div>

          <h1 className="text-[22px] font-medium text-[#1a1a1a] mb-1">Create your account</h1>
          <p className="text-[13px] text-[#5a6872] mb-6">Join thousands of Aggies studying smarter</p>

          {/* Full name */}
          <Field label="Full name">
            <input type="text" placeholder="e.g. Alex Rivera" className={inputClass} />
          </Field>

          {/* Email */}
          <Field label="UC Davis email">
            <input type="email" placeholder="username@ucdavis.edu" className={inputClass} />
          </Field>

          {/* Major + Graduation year */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Major">
              <select className={inputClass}>
                <option value="">Select major</option>
                <option>Computer Science</option>
                <option>Biology</option>
                <option>Psychology</option>
                <option>Economics</option>
                <option>Chemistry</option>
                <option>Mathematics</option>
              </select>
            </Field>
            <Field label="Graduation year">
              <select className={inputClass}>
                <option value="">Year</option>
                <option>2026</option>
                <option>2027</option>
                <option>2028</option>
                <option>2029</option>
              </select>
            </Field>
          </div>

          {/* Password + Confirm */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Password">
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Min. 8 characters"
                  className={`${inputClass} pr-9`}
                />
                <button
                  type="button"
                  aria-label="Toggle password visibility"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#94AAA1] hover:text-[#1B3968] transition-colors"
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </Field>
            <Field label="Confirm password">
              <div className="relative">
                <input
                  type={showConfirm ? "text" : "password"}
                  placeholder="Repeat password"
                  className={`${inputClass} pr-9`}
                />
                <button
                  type="button"
                  aria-label="Toggle confirm password visibility"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#94AAA1] hover:text-[#1B3968] transition-colors"
                >
                  {showConfirm ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </Field>
          </div>

          {/* Work hours (optional) */}
          <Field
            label={
              <>
                Work hours per week{" "}
                <span className="font-normal text-[#94AAA1]">(optional)</span>
              </>
            }
          >
            <input
              type="number"
              placeholder="e.g. 20"
              min={0}
              max={60}
              className={inputClass}
            />
          </Field>

          {/* Terms */}
          <div className="flex items-start gap-2 mb-5">
            <input
              type="checkbox"
              id="terms"
              className="mt-0.5 shrink-0 accent-[#1B3968]"
            />
            <label htmlFor="terms" className="text-[12px] text-[#5a6872] leading-relaxed">
              I agree to the{" "}
              <Link href="#" className="text-[#1B3968] font-medium hover:underline">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="#" className="text-[#1B3968] font-medium hover:underline">
                Privacy Policy
              </Link>
            </label>
          </div>

          <button className="w-full py-2.5 rounded-lg bg-[#1B3968] text-white text-sm font-medium hover:opacity-90 transition-opacity mb-4">
            Create account
          </button>

          <p className="text-center text-[13px] text-[#5a6872]">
            Already have an account?{" "}
            <Link href="/signin" className="text-[#1B3968] font-medium hover:underline">
              Log in
            </Link>
          </p>
        </div>

        {/* ── Right: Feature highlights ── */}
        <div className="bg-[#1B3968] px-8 py-10 flex flex-col justify-between relative overflow-hidden">
          {/* Decorative blobs */}
          <div className="absolute -top-14 -right-14 w-56 h-56 rounded-full bg-[#6A9879] opacity-10 pointer-events-none" />
          <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full bg-[#6A9879] opacity-[0.07] pointer-events-none" />

          {/* Top content */}
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-8">
              <SchoolIcon />
              <span className="text-[13px] text-white/60">Built for UC Davis undergrads</span>
            </div>

            <h2 className="text-[22px] font-medium text-white leading-snug mb-3">
              Everything you need to succeed this quarter
            </h2>
            <p className="text-[13px] text-white/60 leading-relaxed mb-8">
              One platform to plan your schedule, find study partners, and connect
              with professors doing research you care about.
            </p>

            <div className="flex flex-col gap-5">
              <Feature
                icon={<CalendarIcon />}
                title="AI schedule planner"
                description="Syncs with Google Calendar and suggests courses for next quarter around your work schedule"
              />
              <Feature
                icon={<UsersIcon />}
                title="Study group matcher"
                description="Matches you with classmates in the same course who share your free time blocks"
              />
              <Feature
                icon={<MicroscopeIcon />}
                title="Professor search"
                description="Browse faculty by research area and generate a personalized cold email in one click"
              />
            </div>
          </div>

          {/* Bottom pills */}
          <div className="relative z-10 border-t border-white/10 pt-4 mt-8">
            <div className="flex flex-wrap gap-2">
              {["Free to use", "UC Davis only", "No ads", "AI-powered"].map((pill) => (
                <span
                  key={pill}
                  className="text-[11px] px-2.5 py-1 rounded-full bg-white/10 text-white/65"
                >
                  {pill}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
