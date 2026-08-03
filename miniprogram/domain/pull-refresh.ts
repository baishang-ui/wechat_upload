const PULL_ROTATION_DEGREES_PER_PIXEL = 4
const PULL_ROTATION_STEP_DEGREES = 8
const MAX_PULL_ROTATION_DEGREES = 320

export function pullRefreshRotationForDistance(distance: number): number {
  if (!Number.isFinite(distance) || distance <= 0) return 0
  const rawRotation = Math.min(
    MAX_PULL_ROTATION_DEGREES,
    distance * PULL_ROTATION_DEGREES_PER_PIXEL,
  )
  return Math.round(rawRotation / PULL_ROTATION_STEP_DEGREES)
    * PULL_ROTATION_STEP_DEGREES
}
