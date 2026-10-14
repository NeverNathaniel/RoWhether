-- Dock reports: what someone saw at the dock, shown to everyone for a few
-- hours. Choices only, no free text, so there is nothing to moderate.
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,             -- ms since epoch
  water TEXT CHECK (water IN ('flat', 'light', 'chop', 'rough')),
  fog TEXT CHECK (fog IN ('clear', 'patchy', 'thick')),
  debris INTEGER NOT NULL DEFAULT 0 CHECK (debris IN (0, 1))
);
CREATE INDEX IF NOT EXISTS reports_created_at ON reports (created_at);
