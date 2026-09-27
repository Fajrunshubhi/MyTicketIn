-- +goose Up
ALTER TABLE organizer_profiles
  ADD COLUMN appeal_reason VARCHAR(1000) NULL,
  ADD COLUMN appealed_at TIMESTAMPTZ NULL;

ALTER TABLE organizer_profiles
  ADD CONSTRAINT organizer_profiles_appeal_chk CHECK (
    (appeal_reason IS NULL AND appealed_at IS NULL)
    OR (
      status = 'SUSPENDED'
      AND appeal_reason IS NOT NULL
      AND char_length(btrim(appeal_reason)) BETWEEN 10 AND 1000
      AND appealed_at IS NOT NULL
    )
  );

-- +goose Down
ALTER TABLE organizer_profiles DROP CONSTRAINT IF EXISTS organizer_profiles_appeal_chk;
ALTER TABLE organizer_profiles DROP COLUMN IF EXISTS appealed_at;
ALTER TABLE organizer_profiles DROP COLUMN IF EXISTS appeal_reason;
