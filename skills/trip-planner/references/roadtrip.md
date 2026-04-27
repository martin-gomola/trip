# Roadtrip Planning Workflow

Use this reference when the user asks the agent to plan or save a trip, itinerary, weekend away, route, stay, or roadtrip in TRIP.

## Fast Path

1. Gather only missing essentials:
   - destination or URL
   - date range
   - start location
   - preferred pace and must-do constraints, if not obvious

2. Research current facts only when needed:
   - lodging address and GPS
   - current opening hours, closures, prices, booking rules, and routes
   - nearby attractions relevant to the group and season

3. Create a durable JSON plan:

```bash
skills/trip-planner/scripts/trip_api.py roadtrip template > /tmp/roadtrip.json
```

4. Validate and dry-run:

```bash
skills/trip-planner/scripts/trip_api.py roadtrip validate @/tmp/roadtrip.json
skills/trip-planner/scripts/trip_api.py roadtrip dry-run @/tmp/roadtrip.json
```

5. Apply only after the user asks to create/save it:

```bash
skills/trip-planner/scripts/trip_api.py roadtrip apply @/tmp/roadtrip.json
skills/trip-planner/scripts/trip_api.py roadtrip show <trip-id>
```

## Itinerary JSON Shape

Top-level fields:

- `trip.name`: required TRIP trip name.
- `trip.currency`: optional, default `EUR`.
- `trip.home_name`, `trip.home_lat`, `trip.home_lng`: optional trip start/end location for round-trip navigation and route estimates.
- `trip.notes`: optional multiline summary with assumptions and sources.
- `places`: optional list of reusable places.
- `days`: required list of dated or labeled day plans.

Place fields:

- `key`: short stable identifier used by items, such as `destination`.
- `name`: place name.
- `category`: existing TRIP category name, default `Accommodation`.
- `lat`, `lng`, `place`: required for places.
- `description`, `allowdog`, `favorite`, `visited`, `restroom`: optional.
- `trip_only`: set `true` for places that should live only inside the trip.
- `price`, `price_currency`: for accommodations, use nightly price on the place.
- `checkin_time`, `checkout_time`: accommodation defaults, `HH:MM`.

Day fields:

- `label`: display label.
- `date`: ISO date, optional when dates are unknown.
- `day_start_time`: optional `HH:MM` anchor for route/ETA planning.
- `notes`: optional.
- `items`: list of itinerary items.

Item fields:

- `time`: `HH:MM`.
- `text`: visible itinerary text.
- `comment`: optional.
- `place`: optional place key from `places`.
- `lat`, `lng`: optional coordinates when no place is attached.
- `status`: optional planning flag for non-booking logistics; one of `pending`, `booked`, `constraint`, `optional`. Avoid setting it on accommodation rows when `booking_status` already describes the booking state.
- `price`, `price_currency`, `paid_by`: optional. For accommodation stays, `price` is the full stay total.
- `booking_status`: optional; one of `not booked`, `requested`, `booked`, `cancelled`.
- `booking_reference`, `booking_cancellation_deadline`: optional booking metadata; deadline is `YYYY-MM-DD`.
- `cost_status`: optional; one of `estimated`, `confirmed`, `paid`.
- `fee_amount`, `fee_label`: optional persisted extra fee metadata such as cleaning, dog, or tourist tax.
- `duration_minutes`: optional stop duration in minutes.
- `stay_checkout_day`, `stay_checkout_time`: accommodation stay checkout day reference by day `date` or `label`, plus `HH:MM`.

## Planning Rules

- If dates are abbreviated like `8.5 - 10.5`, infer the current/future year from context and state the exact dates in the final answer.
- Do not invent opening hours, prices, or booking rules. Browse current sources for those.
- Prefer a first useful skeleton over pretending to know every detail. Mark uncertain times as placeholders in comments.
- Keep source URLs in `trip.notes` or item comments so future agents can continue without re-researching.
- Use idempotent names: rerunning `roadtrip apply` updates by matching the trip name, place names, day dates/labels, and item time/text. If an item was retimed in the app, the tool can update it by unique day/text before creating a new row.
- When the UI gains new trip-planning fields, update this roadtrip tool in the same change. The import path should understand the same booking, cost, stay, fee, and trip-only-place concepts as the modal.
- Create trip-only sample places for trip planning placeholders; do not pollute the global place list with temporary accommodations or one-off stops.
- For accommodation, store nightly price on the place and the full calculated stay price on the item. Persist extra fees separately with `fee_amount` and `fee_label`.
