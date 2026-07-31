/* morphicons core — pure DOM-free functions: they consume icon data and
   produce `d` strings and numbers. Pipeline:
   normalize → resample → match → align → plan → interpolate(t) → d

   This entry exposes the consumer surface (the size budget is measured
   here). Introspection utilities — parsePath, procrustes, alignPair,
   detectCorners, arcLength, KAPPA… — are imported from their modules in
   src/core/ (tests, playground, tooling). */

export { allocOutputs, interpLinear, interpPolar } from "./core/interpolate";
export { iconToCubics } from "./core/normalize";
export { buildPlan, type MorphPlan, type PlanItem } from "./core/plan";
export { resampleIcon, resamplePath } from "./core/resample";
export { cubicsToPathD, serialize } from "./core/serialize";
export { SPRING_PRESETS, Spring, type SpringPreset } from "./core/spring";
export type {
  CubicPath,
  IconInput,
  IconNode,
  IconNodeAttrs,
  Sampled,
} from "./core/types";
