CREATE TABLE chain_program_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network text NOT NULL,
  signature text NOT NULL,
  event_index integer NOT NULL,
  program_id text NOT NULL,
  event_name text NOT NULL,
  slot bigint,
  payload jsonb NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chain_program_events_status_check CHECK (status IN ('finalized', 'failed')),
  CONSTRAINT chain_program_events_name_check CHECK (
    event_name IN ('CreatorRegistered', 'CreatorMetadataUpdated', 'CreatorPayoutUpdated', 'TipSent')
  )
);

CREATE UNIQUE INDEX chain_program_events_identity ON chain_program_events (network, signature, event_index);
CREATE INDEX chain_program_events_program_idx ON chain_program_events (network, program_id, created_at DESC);
