ALTER TABLE threads ADD COLUMN market TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE threads ADD COLUMN period_start TEXT;
--> statement-breakpoint
ALTER TABLE threads ADD COLUMN period_minutes INTEGER;
--> statement-breakpoint
ALTER TABLE threads ADD COLUMN offer_spec TEXT;
--> statement-breakpoint
ALTER TABLE observations ADD COLUMN observed_at TEXT;
--> statement-breakpoint
ALTER TABLE observations ADD COLUMN channel TEXT;
--> statement-breakpoint
CREATE TABLE price_feeds (
  id TEXT PRIMARY KEY, owner TEXT NOT NULL, spec TEXT NOT NULL, context TEXT NOT NULL,
  token_hash TEXT UNIQUE, created TEXT NOT NULL, last_received TEXT
);
--> statement-breakpoint
CREATE INDEX price_feeds_owner ON price_feeds(owner, created DESC);
--> statement-breakpoint
CREATE TABLE local_price_events (
  source TEXT NOT NULL, event_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL, thread TEXT NOT NULL, PRIMARY KEY(source,event_id)
);
