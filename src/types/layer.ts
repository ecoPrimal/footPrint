// SPDX-License-Identifier: AGPL-3.0-or-later
export interface SerializedLayerData {
  readonly name: string;
  readonly color: string;
  readonly features: readonly GeoJSON.Feature[];
}

export type SerializedLayers = Record<string, SerializedLayerData>;
