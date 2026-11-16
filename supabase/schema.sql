-- SandWhich? ランキング用テーブル
-- Supabase の SQL Editor に貼り付けて実行する

create table if not exists public.scores (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 12),
  score integer not null check (score >= 0),
  sets integer not null check (sets between 0 and 100000),
  created_at timestamptz not null default now(),
  -- 1セットの最大得点は 100×3 + 50 = 350。それを超えるスコアは不正とみなす
  constraint score_within_cap check (score <= sets * 350)
);

create index if not exists scores_score_idx on public.scores (score desc, created_at asc);

-- RLS：読み取りは誰でもOK、直接の書き込みは禁止（submit_score 関数経由のみ）
alter table public.scores enable row level security;

drop policy if exists "scores are readable by everyone" on public.scores;
create policy "scores are readable by everyone"
  on public.scores for select
  to anon, authenticated
  using (true);

create or replace function public.submit_score(p_name text, p_score integer, p_sets integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(p_name);
begin
  if v_name is null or char_length(v_name) < 1 or char_length(v_name) > 12 then
    raise exception 'invalid name';
  end if;
  if p_score is null or p_sets is null or p_score < 0 or p_sets < 0 or p_score > p_sets * 350 then
    raise exception 'invalid score';
  end if;
  insert into public.scores (name, score, sets) values (v_name, p_score, p_sets);
end;
$$;

revoke all on function public.submit_score(text, integer, integer) from public;
grant execute on function public.submit_score(text, integer, integer) to anon, authenticated;
