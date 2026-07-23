# Recognition Summary Entrance Animation Design

**Date:** 2026-07-23

## Problem

The recognition queue capture screen uses the shared `content-rise` entrance animation for its hero card and queue item cards, but the recognition quantity summary card (`.recognition-queue-summary`) has layout styles only. It therefore appears immediately instead of participating in the page entrance sequence.

## Design

Reuse the existing `content-rise` keyframes on `.recognition-queue-summary` with the same duration and easing used by other page cards:

```scss
animation: content-rise .38s .06s ease-out both;
```

The `0.06s` delay places the quantity summary just after the hero card, creating a restrained stagger without introducing a new animation language.

## Testing

Extend the existing UI consistency test to extract the `.recognition-queue-summary` rule and assert that it contains:

- the `content-rise` animation name;
- a `.38s` duration;
- a `.06s` delay;
- `ease-out both` fill/easing behavior.

The test must fail before the style is added and pass afterward.

## Non-goals

- Animating each of the four counters separately.
- Replaying the animation whenever queue counts change.
- Adding JavaScript state or timers.
- Changing the existing `content-rise` keyframes.
