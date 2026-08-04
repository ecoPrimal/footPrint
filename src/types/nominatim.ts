// SPDX-License-Identifier: AGPL-3.0-or-later
export interface NominatimResult {
  readonly lat: string;
  readonly lon: string;
  readonly display_name: string;
  readonly place_id: number;
  readonly licence: string;
  readonly osm_type: string;
  readonly osm_id: number;
  readonly boundingbox: readonly [string, string, string, string];
  readonly class: string;
  readonly type: string;
  readonly importance: number;
}
