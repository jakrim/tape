-- Each wallet's favorite markets. Users sign in with Ethereum (SIWE), so auth.uid() is the wallet's user.
create table public.watchlist (
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  coin text not null check (coin ~ '^[A-Za-z0-9:_-]{1,32}$'),
  created_at timestamptz not null default now(),
  primary key (user_id, coin)
);

alter table public.watchlist enable row level security;

create policy "Users read their own watchlist"
  on public.watchlist for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Users add to their own watchlist"
  on public.watchlist for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "Users remove from their own watchlist"
  on public.watchlist for delete to authenticated
  using (user_id = (select auth.uid()));
