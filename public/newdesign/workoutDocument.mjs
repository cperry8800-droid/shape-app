import './workoutDocument.js';
const api = globalThis.ShapeWorkoutDocument;
export const {normalizeWorkoutDetail, normalizeWorkoutPlan, builderToAssignmentRows, builderToOutlineBlocks, exerciseFromRow, rowFromBlock, loadLabel, weightLabel, repsLabel, ladder, setTarget, perSetEntries, normalizePerSet, LADDER_MAX, rpeValue, splitLegacyRpe, supersetKey, videoUrl} = api;
