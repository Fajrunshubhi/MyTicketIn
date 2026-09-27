-- +goose Up
CREATE TABLE organizer_profile_history (
  id TEXT PRIMARY KEY,
  organizer_profile_id TEXT NOT NULL REFERENCES organizer_profiles(id) ON DELETE RESTRICT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actor_role VARCHAR(20) NOT NULL,
  event_type VARCHAR(40) NOT NULL,
  from_status organizer_status NULL,
  to_status organizer_status NULL,
  note VARCHAR(1000) NULL,
  CONSTRAINT organizer_profile_history_actor_chk CHECK (actor_role IN ('OWNER', 'ADMIN')),
  CONSTRAINT organizer_profile_history_type_chk CHECK (
    event_type IN (
      'SUBMITTED',
      'EDITED',
      'RESUBMITTED',
      'APPROVED',
      'REJECTED',
      'SUSPENDED',
      'RESTORED',
      'APPEALED',
      'APPEAL_DISMISSED'
    )
  )
);

CREATE INDEX organizer_profile_history_profile_idx
  ON organizer_profile_history (organizer_profile_id, occurred_at DESC, id DESC);

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION organizer_profile_history_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'organizer_profile_history is immutable';
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

CREATE TRIGGER organizer_profile_history_immutable
BEFORE UPDATE OR DELETE ON organizer_profile_history
FOR EACH ROW EXECUTE FUNCTION organizer_profile_history_immutable();

INSERT INTO organizer_profile_history (id, organizer_profile_id, occurred_at, actor_role, event_type, from_status, to_status, note)
SELECT 'hs_' || p.id, p.id, p.submitted_at, 'OWNER', 'SUBMITTED', NULL, 'PENDING'::organizer_status, NULL
FROM organizer_profiles p;

INSERT INTO organizer_profile_history (id, organizer_profile_id, occurred_at, actor_role, event_type, from_status, to_status, note)
SELECT 'hd_' || p.id, p.id, p.decided_at, 'ADMIN',
  CASE p.status
    WHEN 'APPROVED' THEN 'APPROVED'
    WHEN 'REJECTED' THEN 'REJECTED'
    WHEN 'SUSPENDED' THEN 'SUSPENDED'
    ELSE 'APPROVED'
  END,
  CASE p.status
    WHEN 'SUSPENDED' THEN 'APPROVED'::organizer_status
    WHEN 'APPROVED' THEN 'PENDING'::organizer_status
    WHEN 'REJECTED' THEN 'PENDING'::organizer_status
    ELSE 'PENDING'::organizer_status
  END,
  p.status,
  p.decision_reason
FROM organizer_profiles p
WHERE p.status <> 'PENDING' AND p.decided_at IS NOT NULL;

INSERT INTO organizer_profile_history (id, organizer_profile_id, occurred_at, actor_role, event_type, from_status, to_status, note)
SELECT 'ha_' || p.id, p.id, p.appealed_at, 'OWNER', 'APPEALED', 'SUSPENDED'::organizer_status, 'SUSPENDED'::organizer_status, p.appeal_reason
FROM organizer_profiles p
WHERE p.appeal_reason IS NOT NULL AND p.appealed_at IS NOT NULL;

-- +goose Down
DROP TRIGGER IF EXISTS organizer_profile_history_immutable ON organizer_profile_history;
DROP FUNCTION IF EXISTS organizer_profile_history_immutable();
DROP TABLE IF EXISTS organizer_profile_history;
