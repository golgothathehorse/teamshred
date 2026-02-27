# TeamShred Branch Workflow (Simple)

## Purpose
- `beta`: fast changes for friend testing
- `release`: stable branch for Android/internal testing
- `main`: baseline

## Rule
- Build and publish Android from `release` only.

## Weekly Flow
1. Work happens in `beta`.
2. When stable, merge `beta` -> `release`.
3. Smoke test `release`.
4. Create new Android internal test build.

## Emergency Fix
- Critical bug in release?
  1) fix directly on `release`
  2) merge `release` back to `beta`
