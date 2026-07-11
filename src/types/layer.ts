import type * as L from 'leaflet';
import type { LayerId, HexColor } from './brands.js';

export interface LayerDef {
  readonly id: LayerId;
  readonly name: string;
  readonly color: HexColor;
}

export interface LayerState {
  readonly id: LayerId;
  readonly name: string;
  readonly color: HexColor;
  readonly group: L.FeatureGroup;
  visible: boolean;
}

export interface SerializedLayerData {
  readonly name: string;
  readonly color: string;
  readonly features: ReadonlyArray<GeoJSON.Feature>;
}

export type SerializedLayers = Record<string, SerializedLayerData>;
