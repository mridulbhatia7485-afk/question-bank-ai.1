-- Question Bank AI: database and private storage setup
create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_text text not null,
  question_type text,
  options jsonb,
  answer text,
  chapter text,
  marks integer,
  created_at timestamptz not null default now()
);

alter table public.questions enable row level security;

-- Drop and recreate this named policy safely if rerunning this script
drop policy if exists "Users manage their own questions" on public.questions;
create policy "Users manage their own questions"
on public.questions
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('question-bank-files', 'question-bank-files', false)
on conflict (id) do nothing;

drop policy if exists "Users manage their own files" on storage.objects;
create policy "Users manage their own files"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'question-bank-files'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'question-bank-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);
