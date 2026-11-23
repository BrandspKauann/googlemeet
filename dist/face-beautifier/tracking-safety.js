import { P, IRIS_CENTER_L, IRIS_CENTER_R } from './landmarks.js';

export const MAX_TRACKING_AGE_MS = 350;

/** Reject implausible/off-axis measurements before optional geometry changes. */
export function faceGeometryIsSafe(points, aspect = 1) {
  if (!points || points.length < 956 || !Number.isFinite(aspect) || aspect <= 0) return false;
  for (let i = 0; i < points.length; i++) if (!Number.isFinite(points[i]) || points[i] < -.1 || points[i] > 1.1) return false;
  const pt = i => [points[i * 2] * aspect, points[i * 2 + 1]];
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const left = pt(IRIS_CENTER_L), right = pt(IRIS_CENTER_R);
  const eyeDistance = distance(left, right);
  const leftWidth = distance(pt(P.eyeOuterL), pt(P.eyeInnerL));
  const rightWidth = distance(pt(P.eyeOuterR), pt(P.eyeInnerR));
  const eyeRatio = leftWidth / Math.max(.0001, rightWidth);
  const roll = Math.abs(Math.atan2(left[1] - right[1], Math.abs(left[0] - right[0])));
  const nose = pt(P.noseTip), middleX = (left[0] + right[0]) / 2;
  const faceWidth = distance(pt(P.faceLeft), pt(P.faceRight));
  const faceHeight = distance(pt(P.chin), pt(P.foreheadTop));
  return eyeDistance > .035 && leftWidth > .012 && rightWidth > .012 &&
    eyeRatio > .65 && eyeRatio < 1.55 && roll < Math.PI / 7 &&
    Math.abs(nose[0] - middleX) < eyeDistance * .3 &&
    faceWidth > eyeDistance * 1.1 && faceWidth < eyeDistance * 3 &&
    faceHeight > faceWidth * .65 && faceHeight < faceWidth * 2.3;
}

export function reshapeStrength(state) {
  if (!state?.points || !state.geometrySafe || !Number.isFinite(state.ageMs) || state.ageMs > MAX_TRACKING_AGE_MS || !Number.isFinite(state.confidence) || state.confidence < .8) return 0;
  return Math.max(0, Math.min(1, (state.confidence - .8) / .2));
}

export function safeWarpParameters(params, state) {
  const strength = reshapeStrength(state);
  return { ...params, slim: params.slim * strength, eyes: params.eyes * strength,
    nose: params.nose * strength, chin: params.chin * strength, lips: params.lips * strength };
}
