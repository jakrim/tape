-- Row-level security for the watchlist: a wallet sees and changes only its own rows.
begin;
select plan(5);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', null),
  ('00000000-0000-0000-0000-00000000000b', null);

-- Act as wallet A.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}';

select lives_ok($$ insert into public.watchlist (coin) values ('BTC'), ('HYPE') $$, 'A can add to its own watchlist');
select results_eq($$ select coin from public.watchlist order by coin $$, $$ values ('BTC'), ('HYPE') $$, 'A reads its own rows');

-- Act as wallet B.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}';

select is_empty($$ select * from public.watchlist $$, 'B cannot read A''s rows');
select throws_ok(
  $$ insert into public.watchlist (user_id, coin) values ('00000000-0000-0000-0000-00000000000a', 'ETH') $$,
  '42501', null, 'B cannot write rows as A'
);

-- Anonymous callers see nothing.
set local role anon;
select is_empty($$ select * from public.watchlist $$, 'anonymous callers read nothing');

select * from finish();
rollback;
