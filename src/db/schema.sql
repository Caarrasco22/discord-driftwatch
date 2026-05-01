CREATE TABLE IF NOT EXISTS guilds (
  guild_id TEXT PRIMARY KEY,
  language TEXT NOT NULL DEFAULT 'en',
  report_channel_id TEXT,
  max_baselines INTEGER NOT NULL DEFAULT 5,
  findings_retention_days INTEGER NOT NULL DEFAULT 30,
  audit_retention_days INTEGER NOT NULL DEFAULT 30,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS authorized_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(guild_id, role_id)
);

CREATE TABLE IF NOT EXISTS baselines (
  baseline_id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  label TEXT,
  snapshot_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  created_by_id TEXT,
  created_by_name TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_runs (
  run_id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  baseline_id TEXT,
  run_type TEXT NOT NULL,
  status TEXT NOT NULL,
  risk_score INTEGER,
  summary_json TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  created_by_id TEXT,
  created_by_name TEXT
);

CREATE TABLE IF NOT EXISTS findings (
  finding_id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  run_id TEXT,
  baseline_id TEXT,
  rule_id TEXT,
  severity TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  asset_id TEXT,
  asset_name TEXT,
  previous_value TEXT,
  current_value TEXT,
  actor_id TEXT,
  actor_name TEXT,
  impact TEXT NOT NULL,
  likelihood TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  confidence REAL NOT NULL,
  remediation_difficulty TEXT,
  safe_to_auto_fix INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS report_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS skipped_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  run_id TEXT,
  check_name TEXT NOT NULL,
  reason TEXT NOT NULL,
  missing_permission TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('schema_version', '1');
