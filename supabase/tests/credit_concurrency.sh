#!/bin/bash
# Storovex credit ledger concurrency test.
#
# Fires N genuinely parallel reservations at one account and asserts that no more
# credits are handed out than existed. This is the test the previous TypeScript
# implementation could not pass: it read the balance, checked it, then wrote in a
# separate statement, so concurrent callers all saw the same pre-spend balance.
#
# Usage: supabase/tests/credit_concurrency.sh <psql-command> <database>
set -u
PSQL="${1:-sxdb}"; DB="${2:-sx_final}"
STORE=cccc0000-0000-0000-0000-00000000c0de
ACCT=cccc1111-1111-1111-1111-11111111c0de
OPENING=100; PARALLEL=20; EACH=10
EXPECTED_GRANTS=$((OPENING / EACH))

$PSQL -d "$DB" -q -c "
delete from public.credit_ledger where account_id='$ACCT';
delete from public.credit_accounts where id='$ACCT';
delete from public.stores where id='$STORE';
insert into auth.users(id,email) values('cccc2222-2222-2222-2222-22222222c0de','race@example.com')
  on conflict (id) do nothing;
insert into public.stores(id,name,owner_id)
  values('$STORE','Race Store','cccc2222-2222-2222-2222-22222222c0de');
insert into public.credit_accounts(id,store_id,balance) values('$ACCT','$STORE',$OPENING);
" >/dev/null 2>&1 || { echo "FIXTURE FAILED"; exit 1; }

echo "Opening balance $OPENING; firing $PARALLEL parallel reservations of $EACH."
for i in $(seq 1 $PARALLEL); do
  $PSQL -d "$DB" -t -A -c \
    "select public.reserve_credits('$ACCT',$EACH,gen_random_uuid(),'race-$$-$i',$((EACH*10)))->>'ok';" \
    2>/dev/null &
done
wait 2>/dev/null

read -r BALANCE GRANTS LEDGER <<<"$($PSQL -d "$DB" -t -A -F' ' -c "
select
  (select balance from public.credit_accounts where id='$ACCT'),
  (select count(*) from public.credit_ledger where account_id='$ACCT' and type='reservation'),
  public.credit_balance_from_ledger('$ACCT');" 2>/dev/null)"

echo "  final balance      : $BALANCE  (expected 0)"
echo "  reservations granted: $GRANTS  (expected $EXPECTED_GRANTS)"
echo "  ledger sum         : $LEDGER  (expected -$OPENING)"

fail=0
[ "$BALANCE" = "0" ] || { echo "FAIL: balance is $BALANCE, not 0"; fail=1; }
[ "$GRANTS" = "$EXPECTED_GRANTS" ] || { echo "FAIL: $GRANTS reservations granted, expected $EXPECTED_GRANTS — credits were over-issued"; fail=1; }
[ "$LEDGER" = "-$OPENING" ] || { echo "FAIL: ledger sums to $LEDGER, expected -$OPENING — ledger and balance disagree"; fail=1; }
[ $fail -eq 0 ] && echo "CREDIT CONCURRENCY: no over-issue under $PARALLEL-way contention"
exit $fail
