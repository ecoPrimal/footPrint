export interface ArcGISFeatureResponse {
  readonly features?: ReadonlyArray<GeoJSON.Feature>;
  readonly exceededTransferLimit?: boolean;
}

export interface FemaFloodProperties {
  readonly FLD_ZONE?: string;
  readonly ZONE_SUBTY?: string;
  readonly STATIC_BFE?: number;
  readonly SFHA_TF?: string;
}

export interface ZoningProperties {
  readonly ZONING?: string;
  readonly Zone?: string;
  readonly ZONE_CODE?: string;
  readonly ZONING_DES?: string;
  readonly Description?: string;
  readonly ZONE_DESC?: string;
}
