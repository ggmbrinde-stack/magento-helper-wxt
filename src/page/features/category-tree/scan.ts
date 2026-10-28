// Feature: the category tree picker (searchable, multi-select).
import { ENHANCE_CATEGORY_TREE } from '../../../shared/flags';
import { enhanceCategoryTrees } from './index';

export function enhanceCategoryTree(): void {
  if (!ENHANCE_CATEGORY_TREE) return;
  enhanceCategoryTrees();
}
