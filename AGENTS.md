# Agent instructions — celuma-frontend

## Scope

This repository owns the Céluma web application. Product behavior must remain consistent with the current API and the contracts in `celuma-engineering`, especially roles, report lifecycle, reviewer assignment, tenant scope, and published artifacts.

## Required validation

- Install exact dependencies with `npm ci` when needed.
- Run `npm run lint`, `npm test`, and `npm run build` for application changes.
- Run the relevant Playwright suite for critical workflows or visual/PDF changes when its prerequisites are available.

## Safety boundaries

1. Hiding a control is not authorization; preserve backend enforcement and test negative role states in the UI.
2. Use synthetic data and anonymized screenshots. Never add PHI, secrets, credentials, or production exports.
3. Preserve report state, reviewer-only actions, tenant boundaries, accessibility, and mobile usability.
4. Do not weaken assertions or update visual snapshots without reviewing the rendered difference.
5. Do not commit, push, merge, tag, publish, or deploy unless Rafael explicitly requests that exact action.
6. Record validation results and any browser, environment, or integration checks that were not run.
