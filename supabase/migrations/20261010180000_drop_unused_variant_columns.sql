-- P3.1: Diese Variantenspalten wurden geschrieben, aber nie gelesen. Freie Zusatzwerte gehören in `meta`.
alter table public.card_variants
  drop column transform_profile,
  drop column model_run_id,
  drop column explanation,
  drop column confidence,
  drop column semantic_delta,
  drop column changed_recognition_cues;
