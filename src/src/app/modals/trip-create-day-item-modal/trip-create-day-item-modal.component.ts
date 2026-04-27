import { Component, HostListener, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AutoCompleteCompleteEvent, AutoCompleteModule } from 'primeng/autocomplete';
import { ButtonModule } from 'primeng/button';
import { DialogService, DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputTextModule } from 'primeng/inputtext';
import {
  Trip,
  TripAttachment,
  TripBookingStatus,
  TripCostStatus,
  TripDay,
  TripMember,
  TripStatus,
} from '../../types/trip';
import { Category, Place } from '../../types/poi';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { UtilsService } from '../../services/utils.service';
import { suggestCurrencies } from '../../shared/currencies';
import { checkAndParseLatLng, formatLatLng, isGoogleMapsShortLink, looksLikeUrl } from '../../shared/latlng-parser';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { InputNumberModule } from 'primeng/inputnumber';
import { MultiSelectModule } from 'primeng/multiselect';
import { InputGroupModule } from 'primeng/inputgroup';
import { InputGroupAddonModule } from 'primeng/inputgroupaddon';
import { Popover, PopoverModule } from 'primeng/popover';
import { ApiService } from '../../services/api.service';
import { take } from 'rxjs';
import { PlaceCreateModalComponent } from '../place-create-modal/place-create-modal.component';

const HOME_PLACE_ID = -1;
const NEW_TRIP_PLACE_ID = -2;

type PlanningStatusOption = { label: string; value: string; color: string };

@Component({
  selector: 'app-trip-create-day-item-modal',
  imports: [
    AutoCompleteModule,
    FloatLabelModule,
    InputTextModule,
    InputNumberModule,
    ButtonModule,
    SelectModule,
    ReactiveFormsModule,
    TextareaModule,
    MultiSelectModule,
    InputGroupModule,
    InputGroupAddonModule,
    PopoverModule,
  ],
  standalone: true,
  templateUrl: './trip-create-day-item-modal.component.html',
  styleUrl: './trip-create-day-item-modal.component.scss',
})
export class TripCreateDayItemModalComponent {
  @ViewChild('op') op!: Popover;
  @HostListener('keydown.control.enter', ['$event'])
  @HostListener('keydown.meta.enter', ['$event'])
  onCtrlEnter(event: Event) {
    event.preventDefault();
    this.closeDialog();
  }

  members: TripMember[] = [];
  itemForm: FormGroup;
  places: Place[] = [];
  categories: Category[] = [];
  pendingNewPlace?: Place;
  statuses: TripStatus[] = [];
  planningStatuses: PlanningStatusOption[] = [];
  bookingStatuses: { label: string; value: TripBookingStatus; color: string }[] = [
    { label: 'Not booked', value: 'not booked', color: '#64748B' },
    { label: 'Requested', value: 'requested', color: '#2563EB' },
    { label: 'Booked', value: 'booked', color: '#16A34A' },
    { label: 'Cancelled', value: 'cancelled', color: '#DC2626' },
  ];
  costStatuses: { label: string; value: TripCostStatus; color: string }[] = [
    { label: 'Estimated', value: 'estimated', color: '#64748B' },
    { label: 'Confirmed', value: 'confirmed', color: '#2563EB' },
    { label: 'Paid', value: 'paid', color: '#16A34A' },
  ];
  previous_image_id: number | null = null;
  previous_image: string | null = null;
  trip?: Trip;
  currencySuggestions: string[] = [];
  defaultCurrency = '';
  helperBanner?: string;
  resolvingGeoLink = false;
  geoLinkError: string | null = null;
  accommodationPriceMode: 'calculated' | 'manual' = 'calculated';
  private updatingAccommodationPrice = false;

  constructor(
    private ref: DynamicDialogRef,
    private fb: FormBuilder,
    private config: DynamicDialogConfig,
    private apiService: ApiService,
    private dialogService: DialogService,
    private utilsService: UtilsService,
  ) {
    this.statuses = this.utilsService.statuses;
    this.planningStatuses = this.statuses.map((status) => ({
      label: this.planningStatusDisplayLabel(status.label),
      value: status.label,
      color: status.color,
    }));

    this.itemForm = this.fb.group({
      id: -1,
      time: [
        '',
        {
          validators: [Validators.required, Validators.pattern(/^([01]\d|2[0-3])(:[0-5]\d)?$/)],
        },
      ],
      text: ['', Validators.required],
      comment: '',
      day_id: [null, Validators.required],
      place: null,
      status: null,
      booking_status: null,
      booking_reference: '',
      booking_cancellation_deadline: null,
      cost_status: 'estimated',
      price: null,
      price_currency: null,
      fee_amount: [0, [Validators.min(0)]],
      fee_label: '',
      duration_minutes: [null, [Validators.min(0), Validators.max(1440)]],
      image: null,
      image_id: null,
      gpx: null,
      lat: [
        '',
        {
          validators: Validators.pattern('-?(90(\\.0+)?|[1-8]?\\d(\\.\\d+)?)'),
          updateOn: 'blur',
        },
      ],
      lng: [
        '',
        {
          validators: Validators.pattern('-?(180(\\.0+)?|1[0-7]\\d(\\.\\d+)?|[1-9]?\\d(\\.\\d+)?)'),
        },
      ],
      paid_by: null,
      attachments: [],
      stay_checkout_day_id: null,
      stay_checkout_time: [null, Validators.pattern(/^([01]\d|2[0-3]):[0-5]\d$/)],
      stay_nights: [1, [Validators.min(1)]],
    });

    const data = this.config.data;
    if (data) {
      this.members = data.members ?? [];
      this.places = data.places ?? [];
      this.trip = data.trip ?? [];
      this.helperBanner = data.helperBanner;

      if (data.prefillTime) this.itemForm.get('time')?.setValue(data.prefillTime);

      if (data.item) {
        const selectedPlace = typeof data.item.place === 'number' ? data.item.place : (data.item.place?.id ?? null);
        this.itemForm.patchValue({
          ...data.item,
          place: selectedPlace,
          attachments: data.item.attachments?.map((a: TripAttachment) => a.id) ?? [],
        });
      }

      if (data.selectedDayId) this.itemForm.get('day_id')?.setValue([data.selectedDayId]);
      if (data.selectedHome) {
        this.itemForm.get('place')?.setValue(HOME_PLACE_ID);
        this.placeUpdatedTrigger(HOME_PLACE_ID);
      } else if (data.selectedPlaceId) {
        this.itemForm.get('place')?.setValue(data.selectedPlaceId);
        this.placeUpdatedTrigger(data.selectedPlaceId);
      }

      if (data.item?.stay_checkout_day_id) this.syncNightsFromCheckoutDay(data.item.stay_checkout_day_id);
      this.initializeAccommodationPricingFromCurrentValue();
    }

    this.itemForm
      .get('place')
      ?.valueChanges.pipe(takeUntilDestroyed())
      .subscribe({
        next: (newPlace?: number) => {
          if (!newPlace) {
            this.itemForm.get('lat')?.setValue('');
            this.itemForm.get('lng')?.setValue('');
            this.refreshTimeValidators();
            return;
          }
          this.placeUpdatedTrigger(newPlace);
        },
      });

    this.itemForm
      .get('day_id')
      ?.valueChanges.pipe(takeUntilDestroyed())
      .subscribe({
        next: () => {
          this.normalizeAccommodationArrivalDay();
          const arrivalDayId = this.selectedArrivalDayId();
          if (!arrivalDayId || !this.isSelectedPlaceAccommodation()) return;
          this.syncCheckoutDayFromNights();
          this.applyCalculatedAccommodationPrice();
        },
      });

    this.itemForm
      .get('stay_nights')
      ?.valueChanges.pipe(takeUntilDestroyed())
      .subscribe({
        next: () => {
          if (!this.canConfigureStay()) return;
          this.syncCheckoutDayFromNights();
          this.applyCalculatedAccommodationPrice();
        },
      });

    this.itemForm
      .get('stay_checkout_day_id')
      ?.valueChanges.pipe(takeUntilDestroyed())
      .subscribe({
        next: (checkoutDayId) => {
          if (!this.canConfigureStay() || !checkoutDayId) return;
          this.syncNightsFromCheckoutDay(checkoutDayId);
          this.applyCalculatedAccommodationPrice();
        },
      });

    this.itemForm
      .get('fee_amount')
      ?.valueChanges.pipe(takeUntilDestroyed())
      .subscribe({
        next: () => {
          if (!this.isSelectedPlaceAccommodation()) return;
          this.accommodationPriceMode = 'calculated';
          this.applyCalculatedAccommodationPrice(true);
        },
      });

    this.itemForm
      .get('price')
      ?.valueChanges.pipe(takeUntilDestroyed())
      .subscribe({
        next: (value) => {
          if (this.updatingAccommodationPrice || !this.isSelectedPlaceAccommodation()) return;
          const calculated = this.calculatedAccommodationTotalPrice();
          if (this.isEmptyPrice(value)) {
            this.accommodationPriceMode = 'calculated';
            this.applyCalculatedAccommodationPrice(true);
            return;
          }
          this.accommodationPriceMode =
            calculated !== null && this.samePrice(value, calculated) ? 'calculated' : 'manual';
        },
      });

    this.itemForm
      .get('lat')
      ?.valueChanges.pipe(takeUntilDestroyed())
      .subscribe({
        next: (value: string) => {
          if (typeof value !== 'string' || !value.trim()) {
            this.geoLinkError = null;
            return;
          }

          const result = checkAndParseLatLng(value);
          if (result) {
            this.geoLinkError = null;
            this.applyResolvedLatLng(result[0], result[1]);
            return;
          }

          // Short Google Maps share link (maps.app.goo.gl/xxxx) — needs the
          // backend resolver because the redirect can't be followed from
          // the browser cross-origin.
          if (looksLikeUrl(value) && isGoogleMapsShortLink(value)) {
            this.resolveGoogleMapsShortLink(value.trim());
          }
        },
      });

    this.utilsService.currency$.pipe(takeUntilDestroyed()).subscribe({
      next: (currency) => (this.defaultCurrency = currency ?? ''),
    });

    this.apiService
      .getCategories()
      .pipe(take(1))
      .subscribe({
        next: (categories) => (this.categories = categories),
      });
  }

  searchCurrency(event: AutoCompleteCompleteEvent) {
    this.currencySuggestions = suggestCurrencies(event.query ?? '', this.trip?.currency || this.defaultCurrency);
  }

  closeDialog() {
    this.normalizeAccommodationArrivalDay();
    this.applyCalculatedAccommodationPrice();
    if (!this.itemForm.valid) return;
    let ret = this.itemForm.value;
    if (!this.canConfigureStay()) {
      ret['stay_checkout_day_id'] = null;
      ret['stay_checkout_time'] = null;
    } else {
      ret['stay_checkout_day_id'] = ret['stay_checkout_day_id'] || null;
      ret['stay_checkout_time'] = ret['stay_checkout_time'] || null;
    }
    delete ret['stay_nights'];
    if (this.isSelectedPlaceAccommodation()) ret['duration_minutes'] = null;
    ret['price_currency'] = ret['price'] ? ret['price_currency']?.trim() || this.trip?.currency || null : null;
    if (!ret['lat']) {
      ret['lat'] = null;
      ret['lng'] = null;
    }
    if (ret['image_id']) {
      delete ret['image'];
      delete ret['image_id'];
    }
    if (ret['gpx'] == '1') delete ret['gpx'];
    if (ret['place'] === NEW_TRIP_PLACE_ID) {
      ret['new_place'] = this.pendingNewPlacePayload();
      ret['place'] = null;
    }
    if (this.isSelectedPlaceAccommodation()) ret['status'] = null;
    if (ret['place'] === HOME_PLACE_ID) delete ret['place'];
    if (!ret['place']) delete ret['place'];
    if (!ret['booking_reference']) ret['booking_reference'] = null;
    if (!ret['booking_cancellation_deadline']) ret['booking_cancellation_deadline'] = null;
    if (!ret['cost_status'] && ret['price']) ret['cost_status'] = 'estimated';
    if (!ret['fee_amount']) {
      ret['fee_amount'] = null;
      ret['fee_label'] = null;
    } else if (!ret['fee_label']) {
      ret['fee_label'] = 'Fees';
    }
    if (ret['attachments']) {
      ret['attachment_ids'] = ret['attachments'];
      delete ret['attachments'];
    }
    this.ref.close(ret);
  }

  openNewTripPlaceModal() {
    const draft = this.placeDraftFromItem();
    const modal = this.dialogService.open(PlaceCreateModalComponent, {
      header: 'Create Trip Place',
      modal: true,
      appendTo: 'body',
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      width: '55vw',
      breakpoints: {
        '1920px': '70vw',
        '1260px': '90vw',
      },
      data: {
        place: draft,
      },
    })!;

    modal.onClose.pipe(take(1)).subscribe({
      next: (place: Place | null) => {
        if (!place) return;
        const category = this.categories.find((c) => c.id === place.category_id);
        if (!category) {
          this.utilsService.toast('error', 'Category missing', 'Could not resolve the place category');
          return;
        }

        this.pendingNewPlace = {
          ...place,
          id: NEW_TRIP_PLACE_ID,
          category,
          trip_only: true,
        };
        this.places = [this.pendingNewPlace, ...this.places.filter((p) => p.id !== NEW_TRIP_PLACE_ID)];
        this.itemForm.get('place')?.setValue(NEW_TRIP_PLACE_ID);
      },
    });
  }

  placeUpdatedTrigger(pid: number) {
    const p: Place = this.places.find((p) => p.id === pid) as Place;
    if (!p) return;
    this.itemForm.get('lat')?.setValue(p.lat);
    this.itemForm.get('lng')?.setValue(p.lng);
    if (pid !== HOME_PLACE_ID)
      this.itemForm.get('price')?.setValue(this.isAccommodationPlace(p) ? null : p.price || 0, { emitEvent: false });
    if (pid !== HOME_PLACE_ID)
      this.itemForm
        .get('price_currency')
        ?.setValue(p.price_currency || this.trip?.currency || null, { emitEvent: false });
    if (!this.itemForm.get('text')?.value) this.itemForm.get('text')?.setValue(p.name);
    if (p.description && !this.itemForm.get('comment')?.value) this.itemForm.get('comment')?.setValue(p.description);
    if (this.isAccommodationPlace(p)) {
      this.normalizeAccommodationArrivalDay();
      this.itemForm.get('status')?.setValue(null, { emitEvent: false });
      this.itemForm.get('duration_minutes')?.setValue(null);
      // Stays: leave `time` empty by default — it represents an optional
      // check-in override, not an arrival pin. The form input shows the
      // place's check-in time as a ghost placeholder so users can see the
      // default without it being persisted as an override.
      if (!this.itemForm.get('stay_checkout_time')?.value)
        this.itemForm.get('stay_checkout_time')?.setValue(p.checkout_time || '10:00');

      const arrivalDayId = this.selectedArrivalDayId();
      if (arrivalDayId && !this.itemForm.get('stay_checkout_day_id')?.value) {
        this.syncCheckoutDayFromNights();
      }
      this.itemForm.get('booking_status')?.setValue('requested', { emitEvent: false });
      if (!this.itemForm.get('cost_status')?.value) {
        this.itemForm.get('cost_status')?.setValue('estimated', { emitEvent: false });
      }
      this.itemForm.get('fee_amount')?.setValue(0, { emitEvent: false });
      this.accommodationPriceMode = 'calculated';
      this.applyCalculatedAccommodationPrice(true);
    } else if (pid !== HOME_PLACE_ID && this.itemForm.get('duration_minutes')?.value == null) {
      this.itemForm.get('duration_minutes')?.setValue(p.duration ?? null);
    }
    this.refreshTimeValidators();
  }

  private refreshTimeValidators() {
    const timeControl = this.itemForm.get('time');
    if (!timeControl) return;
    const pattern = Validators.pattern(/^([01]\d|2[0-3])(:[0-5]\d)?$/);
    if (this.isSelectedPlaceAccommodation()) {
      timeControl.setValidators([pattern]);
    } else {
      timeControl.setValidators([Validators.required, pattern]);
    }
    timeControl.updateValueAndValidity({ emitEvent: false });
  }

  isAccommodationPlace(place?: Place | null): boolean {
    return place?.category?.name?.toLowerCase() === 'accommodation';
  }

  selectedPlace(): Place | null {
    const placeId = this.itemForm.get('place')?.value;
    if (!placeId || placeId === HOME_PLACE_ID) return null;
    return this.places.find((p) => p.id === placeId) ?? null;
  }

  isSelectedPlaceAccommodation(): boolean {
    return this.isAccommodationPlace(this.selectedPlace());
  }

  /** True when the form has no concrete place link (free-form item). */
  hasFreeFormCoordinates(): boolean {
    const placeId = this.itemForm.get('place')?.value;
    return !placeId || placeId === HOME_PLACE_ID;
  }

  /** Push parsed/resolved coordinates back into the form fields. */
  private applyResolvedLatLng(lat: number, lng: number) {
    const latControl = this.itemForm.get('lat');
    const lngControl = this.itemForm.get('lng');
    latControl?.setValue(formatLatLng(lat).trim(), { emitEvent: false });
    lngControl?.setValue(formatLatLng(lng).trim(), { emitEvent: false });
    lngControl?.markAsDirty();
    lngControl?.updateValueAndValidity();
  }

  /** Ask the backend to resolve a Google Maps short share link. */
  private resolveGoogleMapsShortLink(url: string) {
    if (this.resolvingGeoLink) return;
    this.resolvingGeoLink = true;
    this.geoLinkError = null;
    this.apiService
      .resolveGeoLink(url)
      .pipe(take(1))
      .subscribe({
        next: ({ lat, lng }) => {
          this.applyResolvedLatLng(lat, lng);
          this.resolvingGeoLink = false;
        },
        error: () => {
          this.geoLinkError = 'Could not extract coordinates from this link';
          this.resolvingGeoLink = false;
        },
      });
  }

  /** Short, read-only label for the place's coordinates (shown when a place is selected). */
  selectedPlaceCoordsLabel(): string | null {
    const place = this.selectedPlace();
    if (!place || place.lat == null || place.lng == null) return null;
    const lat = Number(place.lat).toFixed(4);
    const lng = Number(place.lng).toFixed(4);
    return `${lat}, ${lng}`;
  }

  /** Default check-in time from the selected place, used as a ghost hint. */
  selectedPlaceCheckinDefault(): string | null {
    const place = this.selectedPlace();
    return place?.checkin_time ?? null;
  }

  /** True when the user has set a check-in override that differs from the place default. */
  hasCheckinOverride(): boolean {
    const value = this.itemForm.get('time')?.value;
    if (!value) return false;
    const def = this.selectedPlaceCheckinDefault();
    return def == null || def !== value;
  }

  clearTimeOverride() {
    this.itemForm.get('time')?.setValue('');
  }

  selectedArrivalDayId(): number | null {
    const dayValue = this.itemForm.get('day_id')?.value;
    if (Array.isArray(dayValue)) return dayValue.length === 1 ? dayValue[0] : null;
    return dayValue ?? null;
  }

  canConfigureStay(): boolean {
    return (
      this.isSelectedPlaceAccommodation() &&
      this.selectedArrivalDayId() !== null &&
      this.checkoutDayOptions().length > 0
    );
  }

  normalizeAccommodationArrivalDay() {
    if (!this.isSelectedPlaceAccommodation()) return;
    const dayControl = this.itemForm.get('day_id');
    const dayValue = dayControl?.value;
    if (Array.isArray(dayValue) && dayValue.length > 1) {
      dayControl?.setValue([dayValue[0]], { emitEvent: false });
    }
  }

  checkoutDayOptions(): TripDay[] {
    const arrivalDayId = this.selectedArrivalDayId();
    const days = this.trip?.days ?? [];
    if (!arrivalDayId) return days;
    const arrivalIndex = days.findIndex((day) => day.id === arrivalDayId);
    if (arrivalIndex < 0) return days;
    return days.slice(arrivalIndex + 1);
  }

  defaultCheckoutDayId(arrivalDayId: number): number {
    const options = this.checkoutDayOptions();
    return options[0]?.id ?? arrivalDayId;
  }

  maxStayNights(): number {
    return Math.max(1, this.checkoutDayOptions().length);
  }

  staySummary(): string {
    const nights = this.clampedStayNights();
    const arrivalDay = this.trip?.days.find((day) => day.id === this.selectedArrivalDayId());
    const checkoutDay = this.checkoutDayOptions().find(
      (day) => day.id === this.itemForm.get('stay_checkout_day_id')?.value,
    );
    if (!arrivalDay || !checkoutDay) return 'Select one arrival day to configure the stay.';
    return `${nights} night${nights === 1 ? '' : 's'}: check-in ${arrivalDay.label} at ${this.itemForm.get('time')?.value || '15:00'}, checkout ${checkoutDay.label} at ${this.itemForm.get('stay_checkout_time')?.value || '10:00'}.`;
  }

  priceLabel(): string {
    return this.isSelectedPlaceAccommodation() ? 'Total price' : 'Price';
  }

  accommodationPriceSummary(): string | null {
    if (!this.isSelectedPlaceAccommodation()) return null;
    const nightly = this.selectedAccommodationNightlyPrice();
    if (nightly === null) return null;

    const nights = this.clampedStayNights();
    const fees = this.accommodationExtraFees();
    const total = this.calculatedAccommodationTotalPrice();
    const currency = this.itemForm.get('price_currency')?.value || this.trip?.currency || this.defaultCurrency;
    const nightlyLabel = `${this.formatPriceAmount(nightly)}${currency ? ` ${currency}` : ''}/night`;
    const feesLabel = fees > 0 ? ` + ${this.formatPriceAmount(fees)}${currency ? ` ${currency}` : ''} fees` : '';
    const calcLabel =
      total === null
        ? nightlyLabel
        : `${nightlyLabel} x ${nights}${feesLabel} = ${this.formatPriceAmount(total)}${currency ? ` ${currency}` : ''}`;
    return this.accommodationPriceMode === 'manual' ? `Manual total (${calcLabel})` : calcLabel;
  }

  clampedStayNights(): number {
    const value = Number(this.itemForm.get('stay_nights')?.value || 1);
    const nights = Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1;
    return Math.min(nights, this.maxStayNights());
  }

  durationAsTime(): string {
    const minutes = this.itemForm.get('duration_minutes')?.value;
    if (minutes == null || minutes === '' || !Number.isFinite(Number(minutes))) return '';
    const total = Math.max(0, Math.min(Number(minutes), 23 * 60 + 59));
    const hh = Math.floor(total / 60).toString().padStart(2, '0');
    const mm = (total % 60).toString().padStart(2, '0');
    return `${hh}:${mm}`;
  }

  onDurationTimeChange(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    const control = this.itemForm.get('duration_minutes');
    if (!value) {
      control?.setValue(null);
    } else {
      const [h, m] = value.split(':').map(Number);
      control?.setValue(h * 60 + m);
    }
    control?.markAsDirty();
    this.itemForm.markAsDirty();
  }

  syncCheckoutDayFromNights() {
    const arrivalDayId = this.selectedArrivalDayId();
    if (!arrivalDayId) return;

    const days = this.trip?.days ?? [];
    const arrivalIndex = days.findIndex((day) => day.id === arrivalDayId);
    if (arrivalIndex < 0) return;

    const nights = this.clampedStayNights();
    const checkoutDay = days[Math.min(arrivalIndex + nights, days.length - 1)];
    this.itemForm.get('stay_nights')?.setValue(nights, { emitEvent: false });
    this.itemForm.get('stay_checkout_day_id')?.setValue(checkoutDay?.id ?? arrivalDayId, { emitEvent: false });
  }

  syncNightsFromCheckoutDay(checkoutDayId: number) {
    const arrivalDayId = this.selectedArrivalDayId();
    const days = this.trip?.days ?? [];
    const arrivalIndex = days.findIndex((day) => day.id === arrivalDayId);
    const checkoutIndex = days.findIndex((day) => day.id === checkoutDayId);
    if (arrivalIndex < 0 || checkoutIndex <= arrivalIndex) {
      this.syncCheckoutDayFromNights();
      return;
    }
    this.itemForm.get('stay_nights')?.setValue(checkoutIndex - arrivalIndex, { emitEvent: false });
  }

  private initializeAccommodationPricingFromCurrentValue() {
    if (!this.isSelectedPlaceAccommodation()) return;
    const base = this.calculatedAccommodationBasePrice();
    if (base === null) return;

    const value = this.itemForm.get('price')?.value;
    if (this.isEmptyPrice(value)) {
      this.itemForm.get('fee_amount')?.setValue(0, { emitEvent: false });
      this.accommodationPriceMode = 'calculated';
      this.applyCalculatedAccommodationPrice(true);
      return;
    }

    const price = Number(value);
    if (Number.isFinite(price) && price >= base) {
      const existingFee = Number(this.itemForm.get('fee_amount')?.value || 0);
      if (!existingFee) this.itemForm.get('fee_amount')?.setValue(this.roundPrice(price - base), { emitEvent: false });
    }

    const calculated = this.calculatedAccommodationTotalPrice();
    if (calculated === null) return;
    this.accommodationPriceMode = this.samePrice(this.itemForm.get('price')?.value, calculated)
      ? 'calculated'
      : 'manual';
  }

  private applyCalculatedAccommodationPrice(force = false) {
    if (!this.isSelectedPlaceAccommodation()) return;
    if (!force && this.accommodationPriceMode === 'manual') return;

    const calculated = this.calculatedAccommodationTotalPrice();
    if (calculated === null) return;

    this.accommodationPriceMode = 'calculated';
    this.updatingAccommodationPrice = true;
    this.itemForm.get('price')?.setValue(calculated, { emitEvent: false });
    this.updatingAccommodationPrice = false;
  }

  private selectedAccommodationNightlyPrice(): number | null {
    const price = this.selectedPlace()?.price;
    if (price === null || price === undefined) return null;
    const value = Number(price);
    return Number.isFinite(value) ? value : null;
  }

  private calculatedAccommodationBasePrice(): number | null {
    const nightly = this.selectedAccommodationNightlyPrice();
    if (nightly === null) return null;
    return this.roundPrice(nightly * this.clampedStayNights());
  }

  private calculatedAccommodationTotalPrice(): number | null {
    const base = this.calculatedAccommodationBasePrice();
    if (base === null) return null;
    return this.roundPrice(base + this.accommodationExtraFees());
  }

  private accommodationExtraFees(): number {
    const value = Number(this.itemForm.get('fee_amount')?.value || 0);
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  }

  private isEmptyPrice(value: unknown): boolean {
    return value === null || value === undefined || value === '';
  }

  private samePrice(value: unknown, expected: number): boolean {
    const price = Number(value);
    return Number.isFinite(price) && Math.abs(price - expected) < 0.005;
  }

  private roundPrice(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private formatPriceAmount(value: number): string {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
  }

  private placeDraftFromItem(): Partial<Place> {
    const text = this.itemForm.get('text')?.value || '';
    return {
      name: text,
      place: text,
      lat: this.itemForm.get('lat')?.value || '',
      lng: this.itemForm.get('lng')?.value || '',
      description: this.itemForm.get('comment')?.value || null,
      price: this.itemForm.get('price')?.value || null,
      price_currency: this.itemForm.get('price_currency')?.value || this.trip?.currency || this.defaultCurrency || null,
      duration: this.itemForm.get('duration_minutes')?.value || null,
      image: this.itemForm.get('image')?.value || null,
      gpx: this.itemForm.get('gpx')?.value || null,
    };
  }

  private pendingNewPlacePayload(): Partial<Place> | null {
    if (!this.pendingNewPlace) return null;
    const { id, category, ...place } = this.pendingNewPlace;
    return {
      ...place,
      category_id: category.id,
      trip_only: true,
    };
  }

  togglePriceMembersPopover(e: any) {
    this.op.toggle(e);
  }

  get paidByControl(): any {
    return this.itemForm.get('paid_by');
  }

  selectPriceMember(member: any) {
    this.itemForm.markAsDirty();
    if (this.paidByControl.value == member) {
      this.paidByControl.setValue(null);
      this.op.hide();
      return;
    }
    this.paidByControl.setValue(member);
    this.op.hide();
  }

  onImageSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      const file = input.files[0];
      const reader = new FileReader();

      reader.onload = (e) => {
        if (this.itemForm.get('image_id')?.value) {
          this.previous_image_id = this.itemForm.get('image_id')?.value;
          this.previous_image = this.itemForm.get('image')?.value;
          this.itemForm.get('image_id')?.setValue(null);
        }

        this.itemForm.get('image')?.setValue(e.target?.result as string);
        this.itemForm.get('image')?.markAsDirty();
      };

      reader.readAsDataURL(file);
    }
  }

  clearImage() {
    this.itemForm.get('image')?.setValue(null);
    this.itemForm.get('image_id')?.setValue(null);
    this.itemForm.markAsDirty();

    if (this.previous_image && this.previous_image_id) {
      this.itemForm.get('image_id')?.setValue(this.previous_image_id);
      this.itemForm.get('image')?.setValue(this.previous_image);
    }
  }

  onGPXSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      const reader = new FileReader();

      reader.onload = (e) => {
        this.itemForm.get('gpx')?.setValue(e.target?.result as string);
        this.itemForm.get('gpx')?.markAsDirty();
      };

      reader.readAsText(file);
    }
  }

  clearGPX() {
    this.itemForm.get('gpx')?.setValue(null);
    this.itemForm.get('gpx')?.markAsDirty();
  }

  planningStatusDisplayLabel(label?: string | null): string {
    switch (label) {
      case 'pending':
        return 'To decide';
      case 'booked':
        return 'Locked in';
      case 'constraint':
        return 'Constraint';
      case 'optional':
        return 'Optional';
      default:
        return label ?? '';
    }
  }

  onFileUploadInputChange(event: Event) {
    if (!this.trip) return;
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    const formdata = new FormData();
    formdata.append('file', input.files[0]);

    this.apiService
      .postTripAttachment(this.trip?.id, formdata)
      .pipe(take(1))
      .subscribe({
        next: (attachment) => (this.trip!.attachments = [...this.trip!.attachments!, attachment]),
      });
  }
}
