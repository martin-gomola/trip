---
name: trip-ui-review
description: Review TRIP frontend UI changes with agent-browser before finalizing work. Use when editing Angular templates, Tailwind classes, responsive layout, map/sidebar panels, modals, sheets, buttons, itinerary rows, or any visible TRIP interface behavior; especially when the user reports layout breakage, asks for UI polish, or wants visual regression checks across desktop and mobile widths.
---

# TRIP UI Review

## Goal

Catch visual and interaction regressions in this TRIP fork before saying the UI work is done. Prefer evidence from the running app over template-only reasoning.

## Workflow

1. Confirm the app is reachable:
   - Frontend dev URL: `http://localhost:4200/`
   - Backend API through dev proxy: `http://localhost:4200/api/info`
   - Backend container URL: `http://localhost:8050/api/info`

2. Start or restart the dev server when needed:

```bash
cd src
npm start -- --host 0.0.0.0
```

3. Use the `agent-browser` skill and CLI, not guessed selectors:
   - Open the URL.
   - Take an interactive snapshot.
   - Interact only through snapshot refs.
   - Re-snapshot after every click, form fill, navigation, or state change.

4. Authenticate the browser session before reviewing protected pages:
   - Read `TRIP_ADMIN_USERNAME` and `TRIP_ADMIN_PASSWORD` from private repo-root `.env`.
   - Do not print, commit, screenshot, paste, or save credential/token values.
   - Do not create temporary files containing access tokens or refresh tokens.
   - Prefer the bundled login helper; it calls `/api/auth/login` and writes `TRIP_USER`, `TRIP_AT`, and `TRIP_RT` into the named agent-browser session:

```bash
python3 skills/trip-ui-review/scripts/auth_browser_session.py --session-name trip-ui-review
```

   - If the values are missing, stop the authenticated portion and say the review is blocked on private `.env` credentials.
   - If TOTP is required, stop and report that manual auth is required.
   - Only fall back to filling the login form through snapshot refs if the helper fails for a non-credential reason.

5. Review at least these viewport classes for layout work:
   - Narrow/mobile: around `390x844`
   - Tablet/narrow desktop: around `900x1100`
   - Desktop: around `1440x900`

6. Capture screenshots into `tmp/ui-review/` with names that include the viewport and feature, for example:

```text
tmp/ui-review/trip-plan-row-390.png
tmp/ui-review/trip-plan-row-900.png
tmp/ui-review/trip-plan-row-1440.png
```

7. Inspect the screenshots before final response. Block completion if any of these appear:
   - Text or controls overlap.
   - A row grows awkwardly because actions consume content space.
   - Important labels truncate when there is room to wrap better.
   - Mobile-only controls appear on desktop, or desktop-only controls appear on mobile.
   - Buttons are too small, too close together, or only discoverable by hover for critical actions.
   - Map, panels, sheets, or modals hide each other unexpectedly.
   - The selected-item flow requires unnecessary pointer travel on desktop.

8. After fixes, rerun the relevant screenshots. In the final answer, include:
   - The screenshots or paths captured.
   - The viewport sizes tested.
   - Any remaining visual risk.
   - Build/test command results.

## TRIP-Specific Checks

- The Angular dev server must proxy `/api` to the local backend on `8050`; if login or `/api/info` returns the Angular HTML page, fix the dev proxy before reviewing UI.
- For trip plan rows, check days with dense data: accommodation, ETA, check-in/free-window text, price, distance, status, and hover/focus actions.
- Keep mobile bottom sheets thumb-friendly, but keep desktop actions close to the selected row.
- Use existing PrimeIcons/PrimeNG/Tailwind patterns already present in `src/src/app/components/trip`.
