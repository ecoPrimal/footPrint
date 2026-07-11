import type * as L from 'leaflet';
import type { DataSourceId, HexColor } from './brands.js';

export type SourceType = 'vector' | 'tiles';

export interface VectorSourceDef {
  readonly id: DataSourceId;
  readonly name: string;
  readonly category: string;
  readonly color: HexColor;
  readonly type?: 'vector';
  readonly minZoom?: number;
  readonly fetch: (bounds: L.LatLngBounds) => Promise<ReadonlyArray<GeoJSON.Feature>>;
  readonly style?: L.StyleFunction;
  readonly pointToLayer?: L.GeoJSON['options']['pointToLayer'];
  readonly popupContent?: (feature: GeoJSON.Feature) => string;
}

export interface TileSourceDef {
  readonly id: DataSourceId;
  readonly name: string;
  readonly category: string;
  readonly color: HexColor;
  readonly type: 'tiles';
  readonly tileUrl: string;
  readonly opacity?: number;
  readonly attribution?: string;
}

export type DataSourceDef = VectorSourceDef | TileSourceDef;

export interface DataSourceState {
  readonly id: DataSourceId;
  readonly name: string;
  readonly category: string;
  readonly color: HexColor;
  readonly type: SourceType;
  readonly minZoom?: number | undefined;
  enabled: boolean;
  loading: boolean;
  featureCount: number;
  layer: L.TileLayer | L.GeoJSON;
  lastBounds: string | null;
  error: string | null;
  readonly fetch?: ((bounds: L.LatLngBounds) => Promise<ReadonlyArray<GeoJSON.Feature>>) | undefined;
  readonly style?: L.StyleFunction | undefined;
  readonly pointToLayer?: L.GeoJSON['options']['pointToLayer'] | undefined;
  readonly popupContent?: ((feature: GeoJSON.Feature) => string) | undefined;
  readonly tileUrl?: string | undefined;
  readonly opacity?: number | undefined;
  readonly attribution?: string | undefined;
}

export type SourceRegistry = Record<string, DataSourceState>;
export type SourceUpdateCallback = (sources: SourceRegistry) => void;
