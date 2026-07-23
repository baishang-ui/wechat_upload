# Review Risk Card Entrance Animation Design

**Date:** 2026-07-23

## Problem

On the recognition review screen, the review header and the API, report-information, and inspection-data cards use the shared `content-rise` entrance animation. The “准确度审核提示” card (`.review-risk-summary`) has layout styles only, so it appears immediately and breaks the card entrance sequence.

## Design

Apply the existing `content-rise` animation to `.review-risk-summary` and assign delays according to DOM order:

| Card | Delay |
| --- | ---: |
| Review header | `0s` (existing) |
| Accuracy review prompt | `.04s` |
| API raw response | `.08s` |
| Report information | `.12s` |
| Inspection data | `.16s` |

All four content cards use `.38s ease-out both`. No new keyframes or JavaScript state are introduced.

The current uncommitted change that sets `.recognition-queue-summary` to a `.01s` delay is unrelated and must be preserved exactly.

## Testing

Extend the UI consistency test to extract the relevant SCSS rules and assert:

- `.review-risk-summary` uses `content-rise .38s .04s ease-out both`;
- `.api-card` has `.08s` delay;
- `.form-card` has `.12s` delay;
- `.table-card` has `.16s` delay.

The test must fail before the SCSS change and pass afterward.

## Non-goals

- Changing the shared `content-rise` keyframes.
- Replaying animation when confidence counts change.
- Animating the danger and warning pills independently.
- Modifying the recognition queue summary animation.
