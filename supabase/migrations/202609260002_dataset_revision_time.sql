-- Dataset timestamps are database-owned, not uploaded/client-supplied metadata.
-- Existing rows have an UNKNOWN last edit time; created_at is not necessarily
-- their last modification. Do not invent freshness when backfilling.
alter table public.term_datasets add column updated_at timestamptz;
create function public.stamp_dataset_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;
create trigger stamp_dataset_update before insert or update on public.term_datasets
for each row execute function public.stamp_dataset_update();
