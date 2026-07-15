export interface SerializedLayerData {
  readonly name: string;
  readonly color: string;
  readonly features: ReadonlyArray<GeoJSON.Feature>;
}

export type SerializedLayers = Record<string, SerializedLayerData>;
