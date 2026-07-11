export interface ProxyGetQuery {
  readonly url: string;
}

export interface CacheTTLConfig {
  readonly default: number;
  readonly fema: number;
  readonly overpass: number;
  readonly elevation: number;
  readonly soils: number;
}

export interface CacheClearResponse {
  readonly cleared: number;
}
