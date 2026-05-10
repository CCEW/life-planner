create extension if not exists pgcrypto;

alter table public."User"
  add column if not exists "googleCalendarConnected" boolean not null default false,
  add column if not exists "googleCalendarConnectedAt" timestamptz,
  add column if not exists "googleCalendarEmail" text,
  add column if not exists "transcriptCourses" jsonb not null default '[]'::jsonb,
  add column if not exists "transcriptParsedAt" timestamptz,
  add column if not exists "transcriptMajor" text,
  add column if not exists "majorAudit" jsonb;

create table if not exists public."GoogleToken" (
  "id" text primary key default ('google_token_' || replace(gen_random_uuid()::text, '-', '')),
  "userId" text not null unique references public."User"("id") on update cascade on delete cascade,
  "accessToken" text not null,
  "refreshToken" text not null,
  "tokenExpiry" timestamptz not null,
  "updatedAt" timestamptz not null default now()
);

alter table public."GoogleToken"
  add column if not exists "googleEmail" text,
  add column if not exists "scopes" text[] not null default array[]::text[],
  add column if not exists "connectedAt" timestamptz not null default now();

create index if not exists "GoogleToken_userId_idx"
  on public."GoogleToken"("userId");

create table if not exists public."UserTranscriptCourse" (
  "id" text primary key default ('transcript_course_' || replace(gen_random_uuid()::text, '-', '')),
  "userId" text not null references public."User"("id") on update cascade on delete cascade,
  "courseId" text references public."Course"("id") on update cascade on delete set null,
  "courseCode" text not null,
  "title" text,
  "units" numeric,
  "grade" text,
  "quarter" text,
  "geCategories" text[] not null default array[]::text[],
  "writingCategories" text[] not null default array[]::text[],
  "source" text not null default 'transcript',
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create index if not exists "UserTranscriptCourse_userId_idx"
  on public."UserTranscriptCourse"("userId");

create unique index if not exists "UserTranscriptCourse_user_course_quarter_grade_key"
  on public."UserTranscriptCourse"(
    "userId",
    "courseCode",
    coalesce("quarter", ''),
    coalesce("grade", '')
  );

do $$
begin
  create type public."CourseStatus" as enum ('completed', 'in_progress', 'planned');
exception
  when duplicate_object then null;
end $$;

create table if not exists public."UserCourse" (
  "id" text primary key default ('user_course_' || replace(gen_random_uuid()::text, '-', '')),
  "userId" text not null references public."User"("id") on update cascade on delete cascade,
  "courseId" text not null references public."Course"("id") on update cascade on delete cascade,
  "status" public."CourseStatus" not null,
  "grade" text,
  "quarter" text,
  "units" integer
);

create unique index if not exists "UserCourse_userId_courseId_key"
  on public."UserCourse"("userId", "courseId");

create index if not exists "UserCourse_userId_status_idx"
  on public."UserCourse"("userId", "status");

create unique index if not exists "CalendarEvent_user_googleId_key"
  on public."CalendarEvent"("userId", "googleId")
  where "googleId" is not null;

alter table public."Course" enable row level security;
alter table public."User" enable row level security;
alter table public."GoogleToken" enable row level security;
alter table public."UserCourse" enable row level security;
alter table public."UserTranscriptCourse" enable row level security;
alter table public."CalendarEvent" enable row level security;
alter table public."AiInsights" enable row level security;

grant select on public."Course" to anon, authenticated;
grant select, insert, update, delete on public."User" to authenticated;
grant select, insert, update, delete on public."UserCourse" to authenticated;
grant select, insert, update, delete on public."UserTranscriptCourse" to authenticated;
grant select, insert, update, delete on public."CalendarEvent" to authenticated;
grant select, insert, update, delete on public."AiInsights" to authenticated;
revoke all on public."GoogleToken" from anon, authenticated;

drop policy if exists "Course is readable" on public."Course";
create policy "Course is readable"
  on public."Course"
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Users can read own User row" on public."User";
create policy "Users can read own User row"
  on public."User"
  for select
  to authenticated
  using ("id" = auth.uid()::text);

drop policy if exists "Users can update own User row" on public."User";
create policy "Users can update own User row"
  on public."User"
  for update
  to authenticated
  using ("id" = auth.uid()::text)
  with check ("id" = auth.uid()::text);

drop policy if exists "Users can read own UserCourse rows" on public."UserCourse";
create policy "Users can read own UserCourse rows"
  on public."UserCourse"
  for select
  to authenticated
  using ("userId" = auth.uid()::text);

drop policy if exists "Users can write own UserCourse rows" on public."UserCourse";
create policy "Users can write own UserCourse rows"
  on public."UserCourse"
  for all
  to authenticated
  using ("userId" = auth.uid()::text)
  with check ("userId" = auth.uid()::text);

drop policy if exists "Users can read own transcript rows" on public."UserTranscriptCourse";
create policy "Users can read own transcript rows"
  on public."UserTranscriptCourse"
  for select
  to authenticated
  using ("userId" = auth.uid()::text);

drop policy if exists "Users can write own transcript rows" on public."UserTranscriptCourse";
create policy "Users can write own transcript rows"
  on public."UserTranscriptCourse"
  for all
  to authenticated
  using ("userId" = auth.uid()::text)
  with check ("userId" = auth.uid()::text);

drop policy if exists "Users can read own CalendarEvent rows" on public."CalendarEvent";
create policy "Users can read own CalendarEvent rows"
  on public."CalendarEvent"
  for select
  to authenticated
  using ("userId" = auth.uid()::text);

drop policy if exists "Users can write own CalendarEvent rows" on public."CalendarEvent";
create policy "Users can write own CalendarEvent rows"
  on public."CalendarEvent"
  for all
  to authenticated
  using ("userId" = auth.uid()::text)
  with check ("userId" = auth.uid()::text);

drop policy if exists "Users can read own AiInsights row" on public."AiInsights";
create policy "Users can read own AiInsights row"
  on public."AiInsights"
  for select
  to authenticated
  using ("userId" = auth.uid()::text);

drop policy if exists "Users can write own AiInsights row" on public."AiInsights";
create policy "Users can write own AiInsights row"
  on public."AiInsights"
  for all
  to authenticated
  using ("userId" = auth.uid()::text)
  with check ("userId" = auth.uid()::text);

notify pgrst, 'reload schema';
