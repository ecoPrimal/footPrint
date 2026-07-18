export interface SerializedLayerData {
  readonly name: string;
  readonly color: string;
  readonly features: readonly GeoJSON.Feature[];
}

export type SerializedLayers = Record<string, SerializedLayerData>;
