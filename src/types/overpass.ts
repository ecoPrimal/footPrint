export interface OverpassGeomNode {
  readonly lat: number;
  readonly lon: number;
}

export interface OverpassNode {
  readonly type: 'node';
  readonly id: number;
  readonly lat: number;
  readonly lon: number;
  readonly tags?: Readonly<Record<string, string>>;
}

export interface OverpassWay {
  readonly type: 'way';
  readonly id: number;
  readonly geometry?: ReadonlyArray<OverpassGeomNode>;
  readonly tags?: Readonly<Record<string, string>>;
}

export interface OverpassRelationMember {
  readonly type: 'way' | 'node' | 'relation';
  readonly ref: number;
  readonly role: string;
  readonly geometry?: ReadonlyArray<OverpassGeomNode>;
}

export interface OverpassRelation {
  readonly type: 'relation';
  readonly id: number;
  readonly members?: ReadonlyArray<OverpassRelationMember>;
  readonly tags?: Readonly<Record<string, string>>;
}

export type OverpassElement = OverpassNode | OverpassWay | OverpassRelation;

export function isOverpassNode(el: OverpassElement): el is OverpassNode {
  return el.type === 'node';
}

export function isOverpassWay(el: OverpassElement): el is OverpassWay {
  return el.type === 'way';
}

export function isOverpassRelation(el: OverpassElement): el is OverpassRelation {
  return el.type === 'relation';
}

export interface OverpassResponse {
  readonly elements?: ReadonlyArray<OverpassElement>;
}
