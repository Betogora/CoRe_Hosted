-- Reimport nach Ankis Änderungszeit: Ein Inhalt merkt sich `mod` der Anki-Notiz aus dem letzten Import. Ein Paket mit
-- älterer Notiz überschreibt einen unbearbeiteten Inhalt nicht mehr. Ältere Importe haben keinen Wert und werden wie
-- bisher aktualisiert.
alter table public.notes add column imported_anki_modified_at timestamptz;

comment on column public.notes.imported_anki_modified_at is 'Änderungszeit der Anki-Notiz beim letzten Import; null für manuelle Inhalte und ältere Importe.';
