/**
 * NeoWorker Extension System
 *
 * Provides a plugin architecture for extending NeoWorker with:
 * - Channel adapters (messaging platforms)
 * - Tools (agent capabilities)
 * - Providers (LLM, search, etc.)
 * - Integrations (external services)
 *
 * Plugins are defined via neoworker.plugin.json manifests and can be:
 * - Built-in (shipped with NeoWorker)
 * - User-installed (~/.neoworker/extensions)
 * - Dynamically loaded at runtime
 */

export * from "./types";
export * from "./loader";
export * from "./registry";
export * from "./scaffold";
export * from "./pack-installer";
export * from "./pack-registry";
