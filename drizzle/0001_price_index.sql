CREATE INDEX IF NOT EXISTS observations_prices ON observations(thread, cents);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS observations_recent ON observations(thread, seen DESC, id DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS threads_recent ON threads(created DESC, id DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS threads_category_recent ON threads(category, created DESC, id DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS comments_recent ON comments(thread, created DESC, id DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS reactions_owner ON reactions(owner, kind, thread);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS observations_owner ON observations(owner, thread);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS comments_owner ON comments(owner, thread);
