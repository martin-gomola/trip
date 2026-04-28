# TRIP Back Office Travel Planner Roadmap

This roadmap turns the current product direction into implementation phases for the local TRIP fork. The goal is to make the app reliable as an operational travel planning desk, not just an itinerary note list.

## Guiding Principles

- Schedule truth first: times must respect duration, travel, check-in, checkout, and pinned constraints.
- Booking state is separate from itinerary state.
- Accommodation is a stay/booking block, not just another stop.
- Warnings should be actionable work queues.
- Prefer practical local deployment improvements over upstream-neutral abstractions.

## Phase 1: Schedule Integrity

Goal: make the itinerary timeline trustworthy.

Current issue:
- Items can visually start before the previous stop duration and travel time allow it.
- Order is time-driven, but some edits and drag/drop can still produce impossible sequences.

Work:
- Introduce a day schedule calculation helper that returns, per item:
  - planned start
  - stop duration
  - travel duration to next item
  - earliest feasible next start
  - overlap/conflict minutes
- Use item-level `duration_minutes` first, then place `duration`, then zero.
- Add conflict wording on rows:
  - `Starts 1h 15m too early`
  - `Arrives 25m late`
  - `3h free before check-in`
- Add `Fix day schedule` action that shifts flexible items forward.
- Keep virtual stay and checkout rows generated, not manually draggable.

Acceptance criteria:
- A 2h stop at 09:30 prevents the next item from starting at 10:15 unless the next item is explicitly pinned and shown as a conflict.
- Recalculate times uses stop duration and travel duration.
- Drag/drop preserves a feasible sequence by shifting later flexible items forward.
- Warning chip count matches visible timing conflicts.

Likely files:
- `src/src/app/components/trip/trip.component.ts`
- `src/src/app/components/trip/trip.component.html`
- `src/src/app/types/trip.ts`

## Phase 2: Pinned vs Flexible Planning

Goal: let the schedule engine know what it may move.

Data model:
- Add an item scheduling mode:
  - `flexible`
  - `pinned`
  - `constraint`

Meaning:
- `flexible`: can shift during schedule fixes.
- `pinned`: must stay at this time, but can create warnings.
- `constraint`: hard boundary such as check-in, tour time, ferry, restaurant reservation, border crossing, or opening time.

Work:
- Add scheduling mode to plan item form.
- Default normal stops to `flexible`.
- Default existing `constraint` status items to scheduling mode `constraint` during migration or normalization.
- Use scheduling mode in retiming, drag/drop, and warning generation.

Acceptance criteria:
- `Fix day schedule` never silently moves pinned or constraint items.
- If a flexible item conflicts with a pinned item, the flexible item moves.
- If two pinned items conflict, the day gets a red warning.

Likely files:
- `backend/trip/models/models.py`
- new Alembic migration
- `backend/trip/routers/trips.py`
- `src/src/app/modals/trip-create-day-item-modal/*`
- `src/src/app/components/trip/trip.component.*`

## Phase 3: Warning Work Queue

Goal: make warning chips operational, not decorative.

Work:
- Make warning chips clickable.
- Each warning opens or filters to the affected records:
  - unbooked stays
  - timing conflicts
  - estimated costs
  - missing coordinates
  - unpaid confirmed costs
  - cancellation deadlines
- Add a compact side panel or modal called `Trip Review`.

Acceptance criteria:
- Clicking `2 timing conflicts` filters the itinerary to those rows or opens a review list with direct edit links.
- Each warning has an owner row and a clear next action.
- Closing or fixing the underlying issue removes the warning.

## Phase 4: Back Office Booking Board

Goal: give the planner an operations view across the whole trip.

Work:
- Add a booking board/table with columns:
  - item/place
  - day/date
  - booking status
  - reference
  - cancel by
  - cost state
  - total price
  - fees
  - attachments
  - notes
- Group by status:
  - Not booked
  - Requested
  - Booked
  - Cancelled
- Support quick status updates from the board.

Acceptance criteria:
- User can see all unbooked stays and requested bookings without scanning day cards.
- Cancellation deadlines due soon are visible.
- Booking reference and attachment gaps are obvious.

Likely files:
- New shared component under `src/src/app/components/trip/`
- `src/src/app/types/trip.ts`
- `src/src/app/components/trip/trip.component.*`

## Phase 5: Cost Ledger

Goal: make cost state usable for trip budgeting and settlement.

Work:
- Add trip cost summary:
  - estimated total
  - confirmed total
  - paid total
  - unpaid confirmed total
  - fees total
  - currency mismatch count
- Add per-person split based on `paid_by` and collaborators.
- Keep item-level cost fields, but aggregate consistently.

Acceptance criteria:
- The trip header and review panel show budget totals by state.
- Export includes cost state, fees, and payer.
- Paid costs no longer appear in unpaid warnings.

Likely files:
- `src/src/app/components/trip/trip.component.ts`
- `src/src/app/shared/trip-base/csv.ts`
- `src/src/app/shared/trip-base/ics.ts`

## Phase 6: Accommodation as a Booking Block

Goal: make stays first-class operational blocks.

Data model direction:
- Keep current trip item fields for compatibility.
- Consider a future `TripStay` or `TripBooking` model if accommodation logic keeps growing.

Work:
- Improve stay editor grouping:
  - stay dates/nights
  - price per night
  - total price
  - fees
  - guests/dog/parking/breakfast notes
  - booking reference
  - cancellation deadline
  - attachments
- Show a stay summary across all covered days.
- Keep check-in and checkout generated rows consistent.

Acceptance criteria:
- A stay can be reviewed without opening several unrelated itinerary fields.
- Changing nights recalculates total price unless user has intentionally entered a manual total.
- Extra fees are visible and exported.

## Phase 7: Place Template vs Trip Place Cleanup

Goal: eliminate confusion between reusable places and trip-local planning places.

Work:
- Use these labels consistently:
  - `Place template`: reusable global place.
  - `Trip place`: private to this trip.
  - `Trip override`: trip-specific values layered over a template.
- Keep trip-only places out of global place lists.
- In modals, make `New trip place` use the same input logic as plan item place creation.

Acceptance criteria:
- Creating a trip-only place does not pollute global Places.
- Editing a trip-only place is clearly labeled as trip-local.
- Users do not have to learn separate flows for adding a plan item place and adding a trip place.

## Phase 8: Roadtrip Tool Alignment

Goal: keep the agent/import workflow aligned with app behavior.

Work:
- Update `skills/trip-planner/scripts/trip_api.py` whenever the app gains planner fields.
- Add roadtrip validation for:
  - scheduling mode
  - duration conflicts
  - booking/cost completeness
- Include warnings in `roadtrip show`.

Acceptance criteria:
- A generated trip imported by the tool can use the same booking, cost, duration, stay, and trip-place concepts as the UI.
- Reapplying a generated plan is idempotent even after UI retiming.

## Suggested Build Order

1. Finish Phase 1 completely.
2. Add Phase 2 scheduling mode.
3. Turn warning chips into the Phase 3 review workflow.
4. Add Phase 4 booking board.
5. Add Phase 5 cost ledger.
6. Revisit whether Phase 6 needs a backend `TripStay` model or can stay on `TripItem`.

## First Implementation Slice

Smallest useful next slice:
- Extract schedule math into a helper function.
- Add `starts too early` conflict details.
- Add `Fix day schedule` for flexible rows only.

Definition of done:
- Day 2 with `Zamek Lednice` at 09:30 for 180 minutes shows `Januv hrad` at 10:06 as a conflict.
- Running fix shifts `Januv hrad` and later flexible items after the 180 minute stop plus travel.
- Build passes.
