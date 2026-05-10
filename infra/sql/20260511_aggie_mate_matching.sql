create table if not exists public."AggieMateProfile" (
  "userId" text primary key,
  "fullName" text not null,
  email text not null,
  courses jsonb not null default '[]'::jsonb,
  "freeCells" text[] not null default array[]::text[],
  "updatedAt" timestamp without time zone not null default CURRENT_TIMESTAMP
);

create index if not exists "AggieMateProfile_email_idx"
  on public."AggieMateProfile" using btree (email);

create table if not exists public."AggieMateMatch" (
  id text primary key,
  "requesterId" text not null,
  "receiverId" text not null,
  status text not null default 'matched',
  "createdAt" timestamp without time zone not null default CURRENT_TIMESTAMP,
  constraint "AggieMateMatch_unique_pair" unique ("requesterId", "receiverId")
);

create index if not exists "AggieMateMatch_requester_idx"
  on public."AggieMateMatch" using btree ("requesterId");

create index if not exists "AggieMateMatch_receiver_idx"
  on public."AggieMateMatch" using btree ("receiverId");
