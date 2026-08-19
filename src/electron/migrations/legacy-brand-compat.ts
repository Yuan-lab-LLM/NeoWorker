/**
 * Compatibility metadata for installations created before the NeoWorker rebrand.
 *
 * Keep legacy product identifiers isolated in this module. They are data-format
 * keys, not current product branding, and may be removed after the migration
 * window closes.
 */

export interface LegacyUserDataLayout {
  directoryNames: string[];
  databaseNames: string[];
  machineIdNames: string[];
}

export const LEGACY_USER_DATA_LAYOUTS: LegacyUserDataLayout[] = [
  {
    directoryNames: ["novaready", "NovaReady"],
    databaseNames: ["novaready.db", "cowork-os.db"],
    machineIdNames: [".novaready-machine-id", ".cowork-machine-id"],
  },
  {
    directoryNames: ["cowork-os", "CoWork OS"],
    databaseNames: ["cowork-os.db", "cowork-oss.db"],
    machineIdNames: [".cowork-machine-id"],
  },
  {
    directoryNames: ["cowork-oss", "CoWork-OSS"],
    databaseNames: ["cowork-oss.db", "cowork-os.db"],
    machineIdNames: [".cowork-machine-id"],
  },
  {
    directoryNames: ["quiverready", "QuiverReady"],
    databaseNames: ["quiverready.db", "cowork-os.db"],
    machineIdNames: [".quiverready-machine-id", ".cowork-machine-id"],
  },
  {
    directoryNames: ["crewwork", "CrewWork"],
    databaseNames: ["crewwork.db", "cowork-os.db"],
    machineIdNames: [".crewwork-machine-id", ".cowork-machine-id"],
  },
];

export const LEGACY_WORKSPACE_KIT_DIRECTORIES = [
  ".novaready",
  ".cowork",
  ".quiverready",
  ".crewwork",
] as const;

export const LEGACY_APP_KEY_SALTS = [
  "novaready-secure-settings-v1",
  "cowork-os-secure-settings-v1",
  "quiverready-secure-settings-v1",
  "crewwork-secure-settings-v1",
] as const;

export const LEGACY_PLUGIN_MANIFEST_FILENAMES = [
  "novaready.plugin.json",
  "cowork.plugin.json",
  "quiverready.plugin.json",
  "crewwork.plugin.json",
] as const;

export const LEGACY_PRODUCT_DISPLAY_NAMES = [
  "NovaReady",
  "CoWork OS",
  "CoWork-OSS",
  "QuiverReady",
  "CrewWork",
] as const;

export const LEGACY_TASK_DEEPLINK_PROTOCOLS = [
  "novaready",
  "cowork",
  "quiverready",
  "crewwork",
] as const;

export const LEGACY_TEMP_WORKSPACE_ROOT_DIR_NAMES = [
  "novaready-temp",
  "cowork-os-temp",
  "cowork-temp",
  "quiverready-temp",
  "crewwork-temp",
] as const;

const LEGACY_ENV_PREFIXES = [
  "NOVAREADY_",
  "COWORK_",
  "QUIVERREADY_",
  "CREWWORK_",
] as const;
const CURRENT_ENV_PREFIX = "NEOWORKER_";

/**
 * Promote legacy environment variables to their NeoWorker equivalents without
 * overriding an explicitly configured current variable.
 */
export function applyLegacyEnvironmentAliases(
  env: NodeJS.ProcessEnv = process.env,
): number {
  let promoted = 0;
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue;
    const prefix = LEGACY_ENV_PREFIXES.find((candidate) => key.startsWith(candidate));
    if (!prefix) continue;
    const currentKey = `${CURRENT_ENV_PREFIX}${key.slice(prefix.length)}`;
    if (env[currentKey] !== undefined) continue;
    env[currentKey] = value;
    promoted += 1;
  }
  return promoted;
}

applyLegacyEnvironmentAliases();
