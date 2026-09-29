-- Generated cleanroom architecture has its own source kind; it is never passed
-- off as Forma hardware or STEP CAD. Geometry still uses immutable Storage files.
alter table public.assets drop constraint assets_source_kind_check;
alter table public.assets add constraint assets_source_kind_check
  check (source_kind in ('forma', 'step', 'generated'));
alter table public.assets add constraint assets_generated_provenance_check
  check (source_kind <> 'generated' or coalesce(
    metadata->'source'->>'kind' = 'generated' and
    metadata->'source'->>'generator' = 'forma-industries', false));
