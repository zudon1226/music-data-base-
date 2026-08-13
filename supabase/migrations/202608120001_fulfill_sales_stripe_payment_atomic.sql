-- Phase B: atomic Stripe sale fulfillment RPC (additive, function-only).
-- Called by service-role webhook handlers after signature verification.
-- No table/column changes. No backfill. Safe to apply before webhook app code.

create or replace function public.fulfill_sales_stripe_payment_atomic(
  p_provider text,
  p_provider_event_id text,
  p_checkout_session_id text,
  p_payment_intent_id text,
  p_amount_total_cents integer,
  p_currency text,
  p_payment_status text,
  p_event_type text,
  p_expected_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_provider text := lower(trim(coalesce(p_provider, '')));
  v_event_id text := trim(coalesce(p_provider_event_id, ''));
  v_session_id text := trim(coalesce(p_checkout_session_id, ''));
  v_payment_intent_id text := nullif(trim(coalesce(p_payment_intent_id, '')), '');
  v_currency text := upper(trim(coalesce(p_currency, '')));
  v_payment_status text := lower(trim(coalesce(p_payment_status, '')));
  v_event_type text := trim(coalesce(p_event_type, ''));
  v_event public.sales_payment_events%rowtype;
  v_claimed boolean := false;
  v_sale_count integer := 0;
  v_pending_count integer := 0;
  v_completed_count integer := 0;
  v_other_count integer := 0;
  v_sum_cents integer := 0;
  v_user_id uuid;
  v_row_currency text;
  v_currencies text[];
  v_purchase_ids uuid[] := array[]::uuid[];
  v_outcome text;
  v_code text;
  v_prior_outcome text;
  v_prior_session text;
  v_sale public.purchase_history%rowtype;
  v_now timestamptz := timezone('utc', now());
  v_fulfilled_count integer := 0;
begin
  -- Provider / input guards
  if v_provider is distinct from 'stripe' then
    return jsonb_build_object(
      'ok', false,
      'outcome', 'rejected',
      'code', 'invalid_provider',
      'sale_count', 0,
      'fulfilled_count', 0
    );
  end if;

  if v_event_id = '' or v_session_id = '' then
    return jsonb_build_object(
      'ok', false,
      'outcome', 'rejected',
      'code', 'missing_provider_identity',
      'sale_count', 0,
      'fulfilled_count', 0
    );
  end if;

  if v_currency = '' then
    return jsonb_build_object(
      'ok', false,
      'outcome', 'rejected',
      'code', 'missing_currency',
      'sale_count', 0,
      'fulfilled_count', 0
    );
  end if;

  if p_amount_total_cents is null or p_amount_total_cents <= 0 then
    return jsonb_build_object(
      'ok', false,
      'outcome', 'rejected',
      'code', 'invalid_amount',
      'sale_count', 0,
      'fulfilled_count', 0
    );
  end if;

  -- 1) Claim provider event (idempotency key)
  insert into public.sales_payment_events (
    provider,
    provider_event_id,
    provider_checkout_session_id,
    payload
  )
  values (
    v_provider,
    v_event_id,
    v_session_id,
    jsonb_build_object(
      'event_type', v_event_type,
      'outcome', 'claimed'
    )
  )
  on conflict (provider, provider_event_id) do nothing
  returning * into v_event;

  if found then
    v_claimed := true;
  else
    select *
    into v_event
    from public.sales_payment_events
    where provider = v_provider
      and provider_event_id = v_event_id
    for update;

    if not found then
      raise exception 'sales_payment_events claim race: event missing after conflict'
        using errcode = 'P0001';
    end if;

    v_prior_outcome := coalesce(v_event.payload->>'outcome', '');
    v_prior_session := coalesce(v_event.provider_checkout_session_id, '');

    if v_prior_session is distinct from v_session_id then
      return jsonb_build_object(
        'ok', false,
        'outcome', 'rejected',
        'code', 'event_collision',
        'sale_count', 0,
        'fulfilled_count', 0
      );
    end if;

    if v_prior_outcome in ('processed', 'already_processed', 'session_already_fulfilled') then
      return jsonb_build_object(
        'ok', true,
        'outcome', 'already_processed',
        'code', null,
        'sale_count', coalesce((v_event.payload->>'sale_count')::integer, 0),
        'fulfilled_count', coalesce((v_event.payload->>'fulfilled_count')::integer, 0),
        'purchase_ids', coalesce(v_event.payload->'purchase_ids', '[]'::jsonb)
      );
    end if;

    if v_prior_outcome = 'rejected' then
      return jsonb_build_object(
        'ok', false,
        'outcome', 'rejected',
        'code', coalesce(v_event.payload->>'code', 'previously_rejected'),
        'sale_count', coalesce((v_event.payload->>'sale_count')::integer, 0),
        'fulfilled_count', 0,
        'purchase_ids', coalesce(v_event.payload->'purchase_ids', '[]'::jsonb)
      );
    end if;

    -- Claimed-but-incomplete prior attempt: continue under row lock on the event.
    v_claimed := false;
  end if;

  -- Helper to persist a stable rejected outcome on the claimed event row.
  -- (Defined inline via updates below.)

  -- 2) Lock all sales for this checkout session
  select count(*)::integer
  into v_sale_count
  from public.purchase_history
  where provider_checkout_session_id = v_session_id;

  if v_sale_count = 0 then
    -- Transient: webhook may race Phase A session bind. RAISE so the event claim
    -- rolls back and the same provider_event_id can retry after rows exist.
    raise exception 'unknown checkout session; retry after purchase bind'
      using errcode = 'P0001';
  end if;

  -- Deterministic lock order
  perform 1
  from public.purchase_history
  where provider_checkout_session_id = v_session_id
  order by id
  for update;

  select
    count(*) filter (where status = 'pending')::integer,
    count(*) filter (where status = 'completed')::integer,
    count(*) filter (where status not in ('pending', 'completed'))::integer,
    coalesce(sum(price_cents) filter (where status in ('pending', 'completed')), 0)::integer,
    array_agg(id order by id)
  into
    v_pending_count,
    v_completed_count,
    v_other_count,
    v_sum_cents,
    v_purchase_ids
  from public.purchase_history
  where provider_checkout_session_id = v_session_id;

  -- Single persisted purchaser (authoritative)
  if (
    select count(distinct user_id)
    from public.purchase_history
    where provider_checkout_session_id = v_session_id
  ) <> 1 then
    update public.sales_payment_events
    set
      payload = jsonb_build_object(
        'event_type', v_event_type,
        'outcome', 'rejected',
        'code', 'inconsistent_purchaser',
        'sale_count', v_sale_count,
        'fulfilled_count', 0
      ),
      processed_at = v_now
    where id = v_event.id;

    return jsonb_build_object(
      'ok', false,
      'outcome', 'rejected',
      'code', 'inconsistent_purchaser',
      'sale_count', v_sale_count,
      'fulfilled_count', 0
    );
  end if;

  select user_id
  into v_user_id
  from public.purchase_history
  where provider_checkout_session_id = v_session_id
  limit 1;

  if v_user_id is null then
    update public.sales_payment_events
    set
      payload = jsonb_build_object(
        'event_type', v_event_type,
        'outcome', 'rejected',
        'code', 'inconsistent_purchaser',
        'sale_count', v_sale_count,
        'fulfilled_count', 0
      ),
      processed_at = v_now
    where id = v_event.id;

    return jsonb_build_object(
      'ok', false,
      'outcome', 'rejected',
      'code', 'inconsistent_purchaser',
      'sale_count', v_sale_count,
      'fulfilled_count', 0
    );
  end if;

  if p_expected_user_id is not null and p_expected_user_id is distinct from v_user_id then
    update public.sales_payment_events
    set
      payload = jsonb_build_object(
        'event_type', v_event_type,
        'outcome', 'rejected',
        'code', 'purchaser_mismatch',
        'sale_count', v_sale_count,
        'fulfilled_count', 0
      ),
      processed_at = v_now
    where id = v_event.id;

    return jsonb_build_object(
      'ok', false,
      'outcome', 'rejected',
      'code', 'purchaser_mismatch',
      'sale_count', v_sale_count,
      'fulfilled_count', 0
    );
  end if;

  -- Already-completed consistency path (idempotent, no re-grant)
  if v_pending_count = 0 and v_completed_count = v_sale_count and v_other_count = 0 then
    if exists (
      select 1
      from public.purchase_history ph
      where ph.provider_checkout_session_id = v_session_id
        and (
          coalesce(ph.payment_provider, '') is distinct from 'stripe'
          or (
            v_payment_intent_id is not null
            and ph.provider_payment_intent_id is not null
            and ph.provider_payment_intent_id is distinct from v_payment_intent_id
          )
        )
    )
    or (
      select coalesce(sum(price_cents), 0)
      from public.purchase_history
      where provider_checkout_session_id = v_session_id
    ) is distinct from p_amount_total_cents
    or (
      select count(distinct upper(currency))
      from public.purchase_history
      where provider_checkout_session_id = v_session_id
    ) <> 1
    or (
      select upper(min(currency))
      from public.purchase_history
      where provider_checkout_session_id = v_session_id
    ) is distinct from v_currency
    then
      update public.sales_payment_events
      set
        payload = jsonb_build_object(
          'event_type', v_event_type,
          'outcome', 'rejected',
          'code', 'completed_identity_mismatch',
          'sale_count', v_sale_count,
          'fulfilled_count', 0,
          'purchase_ids', to_jsonb(v_purchase_ids)
        ),
        processed_at = v_now
      where id = v_event.id;

      return jsonb_build_object(
        'ok', false,
        'outcome', 'rejected',
        'code', 'completed_identity_mismatch',
        'sale_count', v_sale_count,
        'fulfilled_count', 0,
        'purchase_ids', to_jsonb(v_purchase_ids)
      );
    end if;

    update public.sales_payment_events
    set
      payload = jsonb_build_object(
        'event_type', v_event_type,
        'outcome', 'session_already_fulfilled',
        'sale_count', v_sale_count,
        'fulfilled_count', 0,
        'purchase_ids', to_jsonb(v_purchase_ids)
      ),
      processed_at = v_now
    where id = v_event.id;

    return jsonb_build_object(
      'ok', true,
      'outcome', 'session_already_fulfilled',
      'code', null,
      'sale_count', v_sale_count,
      'fulfilled_count', 0,
      'purchase_ids', to_jsonb(v_purchase_ids)
    );
  end if;

  -- Mixed / terminal non-pending states are not auto-fulfilled
  if v_other_count > 0 or v_pending_count = 0 or v_completed_count > 0 then
    update public.sales_payment_events
    set
      payload = jsonb_build_object(
        'event_type', v_event_type,
        'outcome', 'rejected',
        'code', 'invalid_sale_status_set',
        'sale_count', v_sale_count,
        'fulfilled_count', 0,
        'purchase_ids', to_jsonb(v_purchase_ids)
      ),
      processed_at = v_now
    where id = v_event.id;

    return jsonb_build_object(
      'ok', false,
      'outcome', 'rejected',
      'code', 'invalid_sale_status_set',
      'sale_count', v_sale_count,
      'fulfilled_count', 0,
      'purchase_ids', to_jsonb(v_purchase_ids)
    );
  end if;

  -- 3) Authoritative validation for pending set
  if v_payment_status is distinct from 'paid' then
    v_code := 'unsuccessful_payment_status';
    update public.sales_payment_events
    set
      payload = jsonb_build_object(
        'event_type', v_event_type,
        'outcome', 'rejected',
        'code', v_code,
        'sale_count', v_sale_count,
        'fulfilled_count', 0,
        'purchase_ids', to_jsonb(v_purchase_ids)
      ),
      processed_at = v_now
    where id = v_event.id;

    return jsonb_build_object(
      'ok', false,
      'outcome', 'rejected',
      'code', v_code,
      'sale_count', v_sale_count,
      'fulfilled_count', 0,
      'purchase_ids', to_jsonb(v_purchase_ids)
    );
  end if;

  if exists (
    select 1
    from public.purchase_history ph
    where ph.provider_checkout_session_id = v_session_id
      and coalesce(ph.payment_provider, 'stripe') is distinct from 'stripe'
  ) then
    v_code := 'invalid_payment_provider';
    update public.sales_payment_events
    set
      payload = jsonb_build_object(
        'event_type', v_event_type,
        'outcome', 'rejected',
        'code', v_code,
        'sale_count', v_sale_count,
        'fulfilled_count', 0,
        'purchase_ids', to_jsonb(v_purchase_ids)
      ),
      processed_at = v_now
    where id = v_event.id;

    return jsonb_build_object(
      'ok', false,
      'outcome', 'rejected',
      'code', v_code,
      'sale_count', v_sale_count,
      'fulfilled_count', 0,
      'purchase_ids', to_jsonb(v_purchase_ids)
    );
  end if;

  if exists (
    select 1
    from public.purchase_history ph
    where ph.provider_checkout_session_id = v_session_id
      and (
        coalesce(trim(ph.item_id), '') = ''
        or ph.item_type not in ('song', 'album', 'beat')
        or coalesce(ph.price_cents, 0) <= 0
      )
  ) then
    v_code := 'invalid_product_data';
    update public.sales_payment_events
    set
      payload = jsonb_build_object(
        'event_type', v_event_type,
        'outcome', 'rejected',
        'code', v_code,
        'sale_count', v_sale_count,
        'fulfilled_count', 0,
        'purchase_ids', to_jsonb(v_purchase_ids)
      ),
      processed_at = v_now
    where id = v_event.id;

    return jsonb_build_object(
      'ok', false,
      'outcome', 'rejected',
      'code', v_code,
      'sale_count', v_sale_count,
      'fulfilled_count', 0,
      'purchase_ids', to_jsonb(v_purchase_ids)
    );
  end if;

  -- Beat rows that carry a license must use an approved license_type
  if exists (
    select 1
    from public.purchase_history ph
    where ph.provider_checkout_session_id = v_session_id
      and ph.item_type = 'beat'
      and coalesce(trim(ph.license_type), '') <> ''
      and ph.license_type not in ('Basic', 'Premium', 'Unlimited', 'Exclusive')
  ) then
    v_code := 'invalid_license_type';
    update public.sales_payment_events
    set
      payload = jsonb_build_object(
        'event_type', v_event_type,
        'outcome', 'rejected',
        'code', v_code,
        'sale_count', v_sale_count,
        'fulfilled_count', 0,
        'purchase_ids', to_jsonb(v_purchase_ids)
      ),
      processed_at = v_now
    where id = v_event.id;

    return jsonb_build_object(
      'ok', false,
      'outcome', 'rejected',
      'code', v_code,
      'sale_count', v_sale_count,
      'fulfilled_count', 0,
      'purchase_ids', to_jsonb(v_purchase_ids)
    );
  end if;

  select array_agg(distinct upper(currency))
  into v_currencies
  from public.purchase_history
  where provider_checkout_session_id = v_session_id;

  if coalesce(array_length(v_currencies, 1), 0) <> 1 then
    v_code := 'currency_mismatch';
    update public.sales_payment_events
    set
      payload = jsonb_build_object(
        'event_type', v_event_type,
        'outcome', 'rejected',
        'code', v_code,
        'sale_count', v_sale_count,
        'fulfilled_count', 0,
        'purchase_ids', to_jsonb(v_purchase_ids)
      ),
      processed_at = v_now
    where id = v_event.id;

    return jsonb_build_object(
      'ok', false,
      'outcome', 'rejected',
      'code', v_code,
      'sale_count', v_sale_count,
      'fulfilled_count', 0,
      'purchase_ids', to_jsonb(v_purchase_ids)
    );
  end if;

  v_row_currency := v_currencies[1];
  if v_row_currency is distinct from v_currency then
    v_code := 'currency_mismatch';
    update public.sales_payment_events
    set
      payload = jsonb_build_object(
        'event_type', v_event_type,
        'outcome', 'rejected',
        'code', v_code,
        'sale_count', v_sale_count,
        'fulfilled_count', 0,
        'purchase_ids', to_jsonb(v_purchase_ids)
      ),
      processed_at = v_now
    where id = v_event.id;

    return jsonb_build_object(
      'ok', false,
      'outcome', 'rejected',
      'code', v_code,
      'sale_count', v_sale_count,
      'fulfilled_count', 0,
      'purchase_ids', to_jsonb(v_purchase_ids)
    );
  end if;

  select coalesce(sum(price_cents), 0)::integer
  into v_sum_cents
  from public.purchase_history
  where provider_checkout_session_id = v_session_id
    and status = 'pending';

  if v_sum_cents is distinct from p_amount_total_cents then
    v_code := 'amount_mismatch';
    update public.sales_payment_events
    set
      payload = jsonb_build_object(
        'event_type', v_event_type,
        'outcome', 'rejected',
        'code', v_code,
        'sale_count', v_sale_count,
        'fulfilled_count', 0,
        'purchase_ids', to_jsonb(v_purchase_ids)
      ),
      processed_at = v_now
    where id = v_event.id;

    return jsonb_build_object(
      'ok', false,
      'outcome', 'rejected',
      'code', v_code,
      'sale_count', v_sale_count,
      'fulfilled_count', 0,
      'purchase_ids', to_jsonb(v_purchase_ids)
    );
  end if;

  -- 4) Entitlements from persisted sale rows only
  for v_sale in
    select *
    from public.purchase_history
    where provider_checkout_session_id = v_session_id
      and status = 'pending'
    order by id
  loop
    if v_sale.item_type = 'beat' and coalesce(trim(v_sale.license_type), '') <> '' then
      insert into public.license_records (
        id,
        user_id,
        beat_id,
        beat_title,
        producer_id,
        producer_name,
        buyer_name,
        license_type,
        price_cents,
        currency,
        pdf_file_name,
        terms,
        transaction_id,
        issued_at
      )
      values (
        case
          when coalesce(trim(v_sale.license_id), '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            then v_sale.license_id::uuid
          else gen_random_uuid()
        end,
        v_sale.user_id,
        v_sale.item_id,
        coalesce(nullif(trim(v_sale.title), ''), 'Untitled'),
        '',
        coalesce(v_sale.creator_name, ''),
        '',
        v_sale.license_type,
        greatest(0, coalesce(v_sale.price_cents, 0)),
        coalesce(nullif(trim(v_sale.currency), ''), 'USD'),
        coalesce(
          nullif(trim(v_sale.license_pdf_file_name), ''),
          (coalesce(nullif(trim(v_sale.title), ''), 'beat') || '-' || v_sale.license_type || '.pdf')
        ),
        coalesce(v_sale.license_terms, '[]'::jsonb),
        v_sale.id::text,
        v_now
      )
      on conflict (user_id, beat_id, license_type) do nothing;
    end if;

    insert into public.download_vault (
      user_id,
      purchase_id,
      item_id,
      item_type,
      title,
      creator_name,
      cover_url,
      download_url,
      price_cents,
      currency,
      license_type,
      license_terms,
      license_id,
      license_pdf_file_name
    )
    values (
      v_sale.user_id,
      v_sale.id,
      v_sale.item_id,
      v_sale.item_type,
      coalesce(nullif(trim(v_sale.title), ''), 'Untitled'),
      coalesce(v_sale.creator_name, ''),
      coalesce(v_sale.cover_url, ''),
      coalesce(v_sale.download_url, ''),
      greatest(0, coalesce(v_sale.price_cents, 0)),
      coalesce(nullif(trim(v_sale.currency), ''), 'USD'),
      coalesce(v_sale.license_type, ''),
      coalesce(v_sale.license_terms, '[]'::jsonb),
      coalesce(v_sale.license_id, ''),
      coalesce(v_sale.license_pdf_file_name, '')
    )
    on conflict (user_id, item_id, item_type, license_type) do nothing;

    v_fulfilled_count := v_fulfilled_count + 1;
  end loop;

  -- 5) Complete all locked pending rows atomically
  update public.purchase_history
  set
    status = 'completed',
    payment_provider = 'stripe',
    provider_checkout_session_id = v_session_id,
    provider_payment_intent_id = coalesce(v_payment_intent_id, provider_payment_intent_id),
    payment_confirmed_at = v_now
  where provider_checkout_session_id = v_session_id
    and status = 'pending';

  if not found then
    raise exception 'purchase_history completion updated zero rows'
      using errcode = 'P0001';
  end if;

  -- 6) Event outcome (minimal audit only)
  update public.sales_payment_events
  set
    provider_checkout_session_id = v_session_id,
    payload = jsonb_build_object(
      'event_type', v_event_type,
      'outcome', 'processed',
      'sale_count', v_sale_count,
      'fulfilled_count', v_fulfilled_count,
      'purchase_ids', to_jsonb(v_purchase_ids)
    ),
    processed_at = v_now
  where id = v_event.id;

  return jsonb_build_object(
    'ok', true,
    'outcome', 'processed',
    'code', null,
    'sale_count', v_sale_count,
    'fulfilled_count', v_fulfilled_count,
    'purchase_ids', to_jsonb(v_purchase_ids)
  );
end;
$$;

revoke all on function public.fulfill_sales_stripe_payment_atomic(
  text, text, text, text, integer, text, text, text, uuid
) from public;

revoke all on function public.fulfill_sales_stripe_payment_atomic(
  text, text, text, text, integer, text, text, text, uuid
) from anon;

revoke all on function public.fulfill_sales_stripe_payment_atomic(
  text, text, text, text, integer, text, text, text, uuid
) from authenticated;

grant execute on function public.fulfill_sales_stripe_payment_atomic(
  text, text, text, text, integer, text, text, text, uuid
) to service_role;
