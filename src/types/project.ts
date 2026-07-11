import type { SerializedLayers } from './layer.js';

export interface ProjectFile {
  readonly name: string;
  readonly savedAt: string;
  readonly layers: SerializedLayers;
}

export interface SaveResponse {
  readonly saved: string;
}

export interface DeleteResponse {
  readonly deleted: string;
}

export interface ErrorResponse {
  readonly error: string;
  readonly detail?: string;
}
