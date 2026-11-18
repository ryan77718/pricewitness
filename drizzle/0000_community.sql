CREATE TABLE threads (id TEXT PRIMARY KEY, title TEXT NOT NULL, merchant TEXT NOT NULL, category TEXT NOT NULL, variant TEXT NOT NULL, currency TEXT NOT NULL, created TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE observations (id TEXT PRIMARY KEY, thread TEXT NOT NULL REFERENCES threads(id), owner TEXT NOT NULL, alias TEXT NOT NULL, cents INTEGER NOT NULL, context TEXT NOT NULL, seen TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX observations_thread ON observations(thread);
--> statement-breakpoint
CREATE TABLE comments (id TEXT PRIMARY KEY, thread TEXT NOT NULL, owner TEXT NOT NULL, alias TEXT NOT NULL, body TEXT NOT NULL, created TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX comments_thread ON comments(thread);
--> statement-breakpoint
CREATE TABLE reactions (thread TEXT NOT NULL, owner TEXT NOT NULL, kind TEXT NOT NULL, PRIMARY KEY(thread, owner, kind));
