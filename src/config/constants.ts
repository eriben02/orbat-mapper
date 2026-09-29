import type { ScenarioVersion } from "@/types/scenarioModels";

// 3.4.0 is a signal, not a migration: nothing in a 3.3.0 scenario needs rewriting,
// but a scenario containing tacticalGraphic items must make an older build warn
// (see applyScenarioObject in scenariostore/io.ts) rather than silently mishandle it.
// 3.5.0 is the same kind of signal for `operationalObjects`. No upgrade branch:
// older files simply have no such array, and an older build should warn instead of
// dropping the array on the next save.
// Deliberately no `compareVersions(..., "3.5.0", "<")` branch in upgrade.ts.
export const SCENARIO_FILE_VERSION: ScenarioVersion = "3.5.0";
export const LOCALSTORAGE_KEY = "orbat-scenario4";
export const SHARE_HISTORY_LOCALSTORAGE_KEY = "orbat-share-history";

export const DEFAULT_BASEMAP_ID = "osm";
export const DEFAULT_MAPLIBRE_BASEMAP_ID = "openFreeMapPositron";
// custom symbol format: custom1:1003100000:someid
export const CUSTOM_SYMBOL_PREFIX = "custom1:";
export const CUSTOM_SYMBOL_SLICE = 8 + 20 + 1; // length of "custom1:" + length of "1003100000" + 1 colon
