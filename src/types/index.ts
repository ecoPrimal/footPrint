export type { LayerId, ProjectName, HexColor, DataSourceId } from './brands.js';
export { layerId, projectName, hexColor, dataSourceId } from './brands.js';

export type { ShapeMeta, ShapeStatus, SerializedShapeProps } from './shape.js';
export { SHAPE_STATUSES } from './shape.js';

export type { LayerDef, LayerState, SerializedLayerData, SerializedLayers } from './layer.js';

export type {
  SourceType, VectorSourceDef, TileSourceDef, DataSourceDef,
  DataSourceState, SourceRegistry, SourceUpdateCallback,
} from './source.js';

export type { ProjectFile, SaveResponse, DeleteResponse, ErrorResponse } from './project.js';

export type { ProxyGetQuery, CacheClearResponse } from './api.js';

export type { NominatimResult } from './nominatim.js';

export type {
  OverpassElement, OverpassNode, OverpassWay, OverpassRelation,
  OverpassRelationMember, OverpassGeomNode, OverpassResponse,
} from './overpass.js';

export type {
  ArcGISFeatureResponse, FemaFloodProperties, ZoningProperties,
} from './arcgis.js';

export type {
  ElevationSample, TerrainGrid, TerrainGridBounds, TerrainGridStats,
  ContourLine, SlopeAspect, ElevationProfile, USGSElevationResponse,
} from './terrain.js';

export type {
  ProximityResult, ScoredSource, DiscoveryReport,
  CategoryBoost,
} from './spatial.js';
export { DEFAULT_CATEGORY_BOOSTS } from './spatial.js';

export type { SnapConfig } from './snap.js';
export { DEFAULT_SNAP_CONFIG, ftToMeters } from './snap.js';
