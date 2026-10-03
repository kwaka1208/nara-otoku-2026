import type { Feature as BuiltFeature, ViewerConfig } from '../scripts/build-data.ts';

export type { ViewerConfig };
export type ShopFeature = BuiltFeature;
export type ShopProperties = ShopFeature['properties'];
export interface ShopCollection { type: 'FeatureCollection'; features: ShopFeature[] }
