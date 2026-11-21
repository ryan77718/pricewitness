ALTER TABLE observations ADD COLUMN list_cents INTEGER;
--> statement-breakpoint
ALTER TABLE observations ADD COLUMN fees_cents INTEGER;
--> statement-breakpoint
ALTER TABLE observations ADD COLUMN total_cents INTEGER;
--> statement-breakpoint
ALTER TABLE observations ADD COLUMN search_rank INTEGER;
--> statement-breakpoint
ALTER TABLE observations ADD COLUMN notice TEXT;
--> statement-breakpoint
ALTER TABLE observations ADD COLUMN notice_text TEXT;
--> statement-breakpoint
ALTER TABLE observations ADD COLUMN conditions TEXT;
--> statement-breakpoint
ALTER TABLE observations ADD COLUMN shopper_state TEXT;
--> statement-breakpoint
ALTER TABLE observations ADD COLUMN proof_hash TEXT;
--> statement-breakpoint
ALTER TABLE observations ADD COLUMN tier INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE observations ADD COLUMN campaign TEXT;
--> statement-breakpoint
ALTER TABLE observations ADD COLUMN received_at TEXT;
--> statement-breakpoint
ALTER TABLE observations ADD COLUMN record_hash TEXT;
--> statement-breakpoint
ALTER TABLE observations ADD COLUMN record_salt TEXT;
--> statement-breakpoint
ALTER TABLE threads ADD COLUMN campaign TEXT;
--> statement-breakpoint
ALTER TABLE price_feeds ADD COLUMN campaign TEXT;
--> statement-breakpoint
CREATE TABLE evidence_log (hash TEXT PRIMARY KEY, day TEXT NOT NULL, received_at TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX evidence_log_day ON evidence_log(day, hash);
--> statement-breakpoint
CREATE INDEX observations_campaign ON observations(campaign, thread);
