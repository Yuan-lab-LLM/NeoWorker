import type Database from "better-sqlite3";

export function ensureEverydayAgentSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS everyday_agent_profiles (
      id TEXT PRIMARY KEY,
      profile_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS everyday_agent_receipts (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      workspace_id TEXT,
      capability TEXT NOT NULL,
      risk_class TEXT NOT NULL,
      status TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      source_signals_json TEXT NOT NULL DEFAULT '[]',
      approval_id TEXT,
      preview_id TEXT,
      tool_calls_json TEXT NOT NULL DEFAULT '[]',
      external_ids_json TEXT NOT NULL DEFAULT '[]',
      retry_state_json TEXT,
      idempotency_key TEXT NOT NULL,
      result_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS everyday_agent_trust_patterns (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      capability TEXT NOT NULL,
      workspace_id TEXT,
      connector_id TEXT,
      connector_account_id TEXT,
      action_class TEXT NOT NULL,
      destination TEXT,
      status TEXT NOT NULL,
      source_suggestion_ids_json TEXT NOT NULL DEFAULT '[]',
      provenance TEXT NOT NULL,
      accepted_count INTEGER NOT NULL DEFAULT 0,
      rejected_count INTEGER NOT NULL DEFAULT 0,
      last_used_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS everyday_agent_consent_history (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      consent_version INTEGER NOT NULL,
      accepted INTEGER NOT NULL,
      metadata_json TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS everyday_agent_pause_scopes (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      scope_json TEXT NOT NULL,
      reason TEXT,
      expires_at INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS everyday_agent_action_previews (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      workspace_id TEXT,
      capability TEXT NOT NULL,
      risk_class TEXT NOT NULL,
      status TEXT NOT NULL,
      preview_json TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS everyday_agent_task_links (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      workspace_id TEXT,
      task_id TEXT NOT NULL,
      receipt_id TEXT,
      capability TEXT NOT NULL,
      link_type TEXT NOT NULL,
      metadata_json TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS everyday_agent_browser_profile_metadata (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      workspace_id TEXT,
      browser_profile_id TEXT NOT NULL,
      mode TEXT NOT NULL,
      metadata_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS everyday_agent_connector_summaries (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      workspace_id TEXT,
      connector_id TEXT NOT NULL,
      connector_account_id TEXT,
      summary_json TEXT NOT NULL,
      expires_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS everyday_agent_routine_provenance (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      workspace_id TEXT,
      routine_id TEXT NOT NULL,
      trust_pattern_id TEXT,
      preview_id TEXT,
      source_suggestion_ids_json TEXT NOT NULL DEFAULT '[]',
      provenance_json TEXT,
      created_at INTEGER NOT NULL,
      revoked_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_everyday_profiles_updated
      ON everyday_agent_profiles(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_everyday_receipts_profile_created
      ON everyday_agent_receipts(profile_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_everyday_receipts_workspace_created
      ON everyday_agent_receipts(workspace_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_everyday_receipts_capability_created
      ON everyday_agent_receipts(capability, created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_everyday_receipts_idempotency
      ON everyday_agent_receipts(profile_id, idempotency_key);
    CREATE INDEX IF NOT EXISTS idx_everyday_trust_scope
      ON everyday_agent_trust_patterns(
        profile_id,
        capability,
        workspace_id,
        connector_id,
        connector_account_id,
        action_class,
        destination
      );
    CREATE INDEX IF NOT EXISTS idx_everyday_consent_profile_created
      ON everyday_agent_consent_history(profile_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_everyday_pause_profile_expires
      ON everyday_agent_pause_scopes(profile_id, expires_at);
    CREATE INDEX IF NOT EXISTS idx_everyday_previews_profile_created
      ON everyday_agent_action_previews(profile_id, created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_everyday_previews_idempotency
      ON everyday_agent_action_previews(profile_id, idempotency_key);
    CREATE INDEX IF NOT EXISTS idx_everyday_task_links_profile_created
      ON everyday_agent_task_links(profile_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_everyday_task_links_task
      ON everyday_agent_task_links(task_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_everyday_browser_profile_metadata_profile
      ON everyday_agent_browser_profile_metadata(profile_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_everyday_connector_summaries_profile
      ON everyday_agent_connector_summaries(profile_id, connector_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_everyday_routine_provenance_profile
      ON everyday_agent_routine_provenance(profile_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_everyday_routine_provenance_routine
      ON everyday_agent_routine_provenance(routine_id, created_at DESC);
  `);
}
