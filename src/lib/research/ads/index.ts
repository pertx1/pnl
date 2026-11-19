import "server-only";
import { metaAdLibrary } from "./meta-ad-library";
import type { AdSource } from "./types";

/** Fuentes de anuncios disponibles. Para añadir otra fuente legal, implementa `AdSource` y regístrala aquí. */
export const AD_SOURCES: AdSource[] = [metaAdLibrary];

export function getAdSource(id = "meta_ad_library"): AdSource | undefined {
  return AD_SOURCES.find((s) => s.id === id);
}

export type { AdResult, AdSearchQuery, AdSource, AdStatus } from "./types";
