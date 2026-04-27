import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnDestroy,
  signal,
  ViewChild,
  untracked,
  ElementRef,
  ChangeDetectorRef,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ApiService } from '../../services/api.service';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SkeletonModule } from 'primeng/skeleton';
import { FloatLabelModule } from 'primeng/floatlabel';
import * as L from 'leaflet';
import { TableModule } from 'primeng/table';
import {
  Trip,
  TripDay,
  TripItem,
  TripStatus,
  PackingItem,
  ChecklistItem,
  TripMember,
  TripAttachment,
  PrintOptions,
  SharedTripDetails,
  ViewTripItem,
  DayViewModel,
  HighlightData,
  TripRetimingChange,
  PrintMapProvider,
} from '../../types/trip';
import { Category, Place } from '../../types/poi';
import {
  createMap,
  placeToMarker,
  createClusterGroup,
  openNavigation,
  tripDayMarker,
  gpxToPolyline,
  toDotMarker,
  getGeolocationLatLng,
} from '../../shared/map';
import { ActivatedRoute, Router } from '@angular/router';
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog';
import { TripPlaceSelectModalComponent } from '../../modals/trip-place-select-modal/trip-place-select-modal.component';
import { TripCreateDayModalComponent } from '../../modals/trip-create-day-modal/trip-create-day-modal.component';
import { TripCreateDayItemModalComponent } from '../../modals/trip-create-day-item-modal/trip-create-day-item-modal.component';
import { debounceTime, distinctUntilChanged, forkJoin, map, Observable, of, switchMap, take, tap } from 'rxjs';
import { YesNoModalComponent } from '../../modals/yes-no-modal/yes-no-modal.component';
import { UtilsService } from '../../services/utils.service';
import { TripCreateModalComponent } from '../../modals/trip-create-modal/trip-create-modal.component';
import { CommonModule } from '@angular/common';
import { MenuItem } from 'primeng/api';
import { Menu, MenuModule } from 'primeng/menu';
import { LinkifyPipe } from '../../shared/pipes/linkify.pipe';
import { PlaceCreateModalComponent } from '../../modals/place-create-modal/place-create-modal.component';
import { Settings } from '../../types/settings';
import { DialogModule } from 'primeng/dialog';
import { Clipboard, ClipboardModule } from '@angular/cdk/clipboard';
import { TooltipModule } from 'primeng/tooltip';
import { ToggleButtonModule } from 'primeng/togglebutton';
import { MultiSelectModule } from 'primeng/multiselect';
import { CheckboxChangeEvent, CheckboxModule } from 'primeng/checkbox';
import { TripCreatePackingModalComponent } from '../../modals/trip-create-packing-modal/trip-create-packing-modal.component';
import { TripCreateChecklistModalComponent } from '../../modals/trip-create-checklist-modal/trip-create-checklist-modal.component';
import { TripInviteMemberModalComponent } from '../../modals/trip-invite-member-modal/trip-invite-member-modal.component';
import { TripNotesModalComponent } from '../../modals/trip-notes-modal/trip-notes-modal.component';
import { TripArchiveModalComponent } from '../../modals/trip-archive-modal/trip-archive-modal.component';
import { generateTripICSFile } from '../../shared/trip-base/ics';
import { generateTripCSVFile } from '../../shared/trip-base/csv';
import {
  ROADBOOK_LEGEND_GROUPS,
  mapProviderUrl,
  RoadbookLegendGroup,
  RoadbookRow,
  roadbookDayTotalKm,
  roadbookEmergencyMapsUrl,
  roadbookRowsForDay,
} from '../../shared/trip-base/roadbook';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FileSizePipe } from '../../shared/pipes/filesize.pipe';
import { computeDistLatLng, daterangeToTripDays } from '../../shared/utils';
import { TabList, TabsModule } from 'primeng/tabs';
import { PlaceBoxContentComponent } from '../../shared/place-box-content/place-box-content.component';
import { TripBulkEditModalComponent } from '../../modals/trip-bulk-edit-modal/trip-bulk-edit-modal.component';
import { PlaceListItemComponent } from '../../shared/place-list-item/place-list-item.component';
import { RouteManagerService } from '../../services/route-manager.service';
import { TripPrettyPrintModalComponent } from '../../modals/trip-pretty-print-modal/trip-pretty-print-modal.component';
import { TripRetimingPreviewModalComponent } from '../../modals/trip-retiming-preview-modal/trip-retiming-preview-modal.component';
import { qrCodeSvg } from '../../shared/qr';

const HIGHLIGHT_COLORS = [
  '#e6194b',
  '#2c8638',
  '#4363d8',
  '#9a6324',
  '#b56024',
  '#911eb4',
  '#268383',
  '#cb2ac3',
  '#617f06',
  '#906e6e',
  '#008080',
  '#856e93',
  '#7a7a00',
];

const HOME_PLACE_ID = -1;
const ROUTE_ESTIMATE_SPEEDS_KMH = {
  car: 70,
  foot: 5,
};
const VIRTUAL_ITEM_ID_OFFSET = 1_000_000_000;

const ETA_DELTA_BADGE_THRESHOLD_MIN = 5;

type TripItemFormValue = Omit<TripItem, 'place'> & { place?: number | null };
type NewTripItemFormValue = Omit<TripItemFormValue, 'day_id'> & { day_id: number[] };

@Component({
  selector: 'app-trip',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    SkeletonModule,
    MenuModule,
    InputTextModule,
    LinkifyPipe,
    FloatLabelModule,
    TableModule,
    ButtonModule,
    DialogModule,
    TooltipModule,
    ClipboardModule,
    MultiSelectModule,
    CheckboxModule,
    FileSizePipe,
    TabsModule,
    PlaceBoxContentComponent,
    PlaceListItemComponent,
    ToggleButtonModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './trip.component.html',
  styleUrls: ['./trip.component.scss'],
})
export class TripComponent implements AfterViewInit, OnDestroy {
  @ViewChild('resizeHandle') resizeHandle?: ElementRef<HTMLDivElement>;
  @ViewChild('menuTripActions') menuTripActions!: Menu;
  @ViewChild('menuPlanDayActions') menuPlanDayActions!: Menu;
  @ViewChild('menuSelectedItemActions') menuSelectedItemActions!: Menu;
  @ViewChild('menuSelectedPlaceActions') menuSelectedPlaceActions!: Menu;
  @ViewChild('menuTripDayActions') menuTripDayActions!: Menu;
  @ViewChild('menuSelectedDayActions') menuSelectedDayActions!: Menu;
  @ViewChild('selectedPanel', { read: ElementRef }) selectedPanelRef?: ElementRef;
  @ViewChild('selectedTabListRef') selectedTabListRef: TabList | undefined;

  selectedPanelHeight = signal<number>(0);
  plansSearchInput = new FormControl<string>('');
  apiService: ApiService;
  route: ActivatedRoute;
  router: Router;
  dialogService: DialogService;
  utilsService: UtilsService;
  clipboard: Clipboard;
  routeManager: RouteManagerService;
  changeDetectionRef: ChangeDetectorRef;
  sanitizer: DomSanitizer;

  trip = signal<Trip | null>(null);
  allPlaces = signal<Place[]>([]);
  tripMembers = signal<TripMember[]>([]);
  packingList = signal<PackingItem[]>([]);
  checklistItems = signal<ChecklistItem[]>([]);
  routeEstimates = signal<Map<string, { distance: number; duration: number }>>(new Map());

  searchQuery = signal<string>('');
  isPlansPanelCollapsed = signal<boolean>(false);
  isFilteringMode = signal<boolean>(false);
  selectedPlace = signal<Place | null>(null);
  selectedItem = signal<ViewTripItem | null>(null);
  selectedPlaceActiveTabIndex = signal<number>(0);
  highlightedDayId = signal<number | null>(null);
  isPlacesPanelVisible = signal<boolean>(false);
  isDaysPanelVisible = signal<boolean>(false);
  showOnlyUnplannedPlaces = signal<boolean>(false);
  printOptions = signal<PrintOptions | null>(null);
  isArchivalReviewDisplayed = signal<boolean>(false);
  isArchiveWarningVisible = signal<boolean>(true);
  tooltipCopied = signal(false);
  isMultiSelectMode = signal<boolean>(false);
  selectedItemIds = signal<Set<number>>(new Set());
  selectedDay = signal<TripDay | null>(null);
  isTextAndPlaceToggled = signal<boolean>(false);

  panelWidth = signal<number | null>(null);
  panelDeltaX = 0;
  panelDeltaWidth = 0;

  isShareDialogVisible = false;
  isPackingDialogVisible = false;
  isMembersDialogVisible = false;
  isAttachmentsDialogVisible = false;
  isChecklistDialogVisible = false;
  selectedItemProps = signal<string[]>(['place', 'comment', 'price', 'distance']);

  tripSharedDetails$?: Observable<SharedTripDetails>;
  username: string;

  places = computed(() => this.trip()?.places ?? []);
  itemPlaces = computed(() => {
    const placesById = new Map<number, Place>();
    for (const place of this.allPlaces()) placesById.set(place.id, place);
    for (const place of this.places()) placesById.set(place.id, place);
    return [...placesById.values()].sort((a, b) => a.name.localeCompare(b.name));
  });
  itemPlaceOptions = computed(() => {
    const home = this.tripHomePlaceOption();
    const places = this.itemPlaces();
    return home ? [home, ...places] : places;
  });
  printOptionsPlaces = computed(() => {
    const options = this.printOptions();
    const places: Set<Place> = new Set();
    this.trip()?.days.forEach((d) => {
      if (!options?.days.has(d.id)) return;
      d.items.forEach((i) => {
        if (!i.place) return;
        places.add(i.place);
      });
    });
    return places;
  });
  usedPlaceIds = computed(() => {
    const trip = this.trip();
    if (!trip?.days) return new Set<number>();
    const ids = new Set<number>();
    for (const day of trip.days) {
      for (const item of day.items) {
        if (item.place?.id) ids.add(item.place.id);
      }
    }
    return ids;
  });
  selectedItemsCount = computed(() => this.selectedItemIds().size);
  selectedPlaceItems = computed<ViewTripItem[]>(() => {
    const place = this.selectedPlace();
    if (!place) return [];

    return this.tripViewModel()
      .flatMap((vm) => vm.items)
      .filter((item) => item.place?.id === place.id && !item.isVirtualStay && !item.isVirtualCheckout);
  });

  dayHasRealItems(group: DayViewModel): boolean {
    return group.items.some((item) => !item.isVirtualStay && !item.isVirtualCheckout);
  }
  selectedItems = computed(() => {
    const ids = this.selectedItemIds();
    return this.tripViewModel()
      .flatMap((vm) => vm.items)
      .filter((item) => ids.has(item.id));
  });
  dispSelectedPlace = computed(() => {
    const place = this.selectedPlace();
    if (!place) return null;
    const items = this.selectedPlaceItems();
    return {
      place,
      items,
      count: items.length,
      isUsed: items.length > 0,
    };
  });
  dispSelectedItem = computed(() => {
    const item = this.selectedItem();
    if (!item) return null;

    const trip = this.trip();
    const dayId = item.day_id;
    const dayLabel = dayId && trip?.days?.length ? (trip.days.find((d) => d.id === dayId)?.label ?? '') : '';

    return { ...item, day: dayLabel };
  });
  hasSelection = computed(() => this.selectedPlace() !== null || this.selectedItem() !== null);
  tripViewModel = computed(() => {
    const currentTrip = this.trip();
    if (!currentTrip?.days) return [];

    const query = this.searchQuery().toLowerCase().trim();
    const hasQuery = query.length > 0;
    const statusesMap = new Map(this.utilsService.statuses.map((s) => [s.label, s]));
    const routeEstimates = this.routeEstimates();
    const dayIndexById = new Map(currentTrip.days.map((day, index) => [day.id, index]));

    return currentTrip.days
      .map((day, dayIndex) => {
        const stayItems = currentTrip.days.flatMap((candidateDay) =>
          candidateDay.items.filter((item) => this.isAccommodationStay(item)),
        );
        let displayItems: ViewTripItem[] = [
          ...(day.items as ViewTripItem[]),
          ...this.virtualStayItemsForDay(day, dayIndex, stayItems, dayIndexById),
        ];

        if (hasQuery) {
          displayItems = displayItems.filter(
            (item) =>
              item.text?.toLowerCase().includes(query) ||
              item.place?.name.toLowerCase().includes(query) ||
              item.comment?.toLowerCase().includes(query),
          );
        }

        if (displayItems.length === 0 && hasQuery) return null;
        displayItems.sort((a, b) => (a.time || '').localeCompare(b.time || ''));

        const anchor = this.computeDayAnchor(day, dayIndex, stayItems, dayIndexById);
        let prevLat: number | null = anchor?.lat ?? null;
        let prevLng: number | null = anchor?.lng ?? null;
        let prevDepartureMinutes: number | null = anchor?.departureMinutes ?? null;
        let chainBroken = false;
        const costs = new Map<string, number>();
        let hasPlaces = false;

        const items = displayItems.map((item) => {
          const statusObj =
            typeof item.status === 'string' ? statusesMap.get(item.status) : (item.status as TripStatus | undefined);

          const lat = item.isVirtualStay ? null : (item.lat ?? item.place?.lat);
          const lng = item.isVirtualStay ? null : (item.lng ?? item.place?.lng);

          let distance: number | undefined;
          let eta: string | undefined;
          let travelDuration: string | undefined;
          let arrivalMinutes: number | null = null;

          if (lat != null && lng != null && !chainBroken) {
            if (prevLat != null && prevLng != null) {
              const routeKey = this.routeEstimateKey({ lat: prevLat, lng: prevLng }, { lat, lng });
              const routeEstimate = routeEstimates.get(routeKey);
              const rawDistanceKm = routeEstimate
                ? routeEstimate.distance / 1000
                : computeDistLatLng(prevLat, prevLng, lat, lng);
              distance = Math.round(rawDistanceKm * 10) / 10;

              const travelMinutes = routeEstimate
                ? Math.ceil(routeEstimate.duration / 60)
                : this.estimateTravelMinutes(rawDistanceKm);
              if (travelMinutes > 0) travelDuration = this.formatDurationMinutes(travelMinutes);
              if (prevDepartureMinutes != null && travelMinutes > 0) {
                arrivalMinutes = prevDepartureMinutes + travelMinutes;
                eta = this.formatTimeMinutes(arrivalMinutes);
              }
            }
          }

          if (item.price && !item.isVirtualStay && !item.isVirtualCheckout) {
            const currency = this.itemCurrency(item);
            costs.set(currency, (costs.get(currency) ?? 0) + item.price);
          }
          if (item.place && !item.isVirtualStay && !item.isVirtualCheckout) hasPlaces = true;

          const pinned = this.parseTimeMinutes(item.time);
          const isStayArrival = this.isAccommodationStay(item) && !item.isVirtualStay && !item.isVirtualCheckout;

          // For stays, `item.time` is interpreted as a check-in override
          // (not an arrival pin), so we don't compute an ETA delta against it.
          const etaDeltaMinutes =
            !isStayArrival && arrivalMinutes != null && pinned != null
              ? arrivalMinutes - pinned
              : undefined;

          // For accommodation arrivals: derive effective check-in time
          // (override if user set it, else the place's default check-in)
          // and the free window between arrival and check-in.
          let effectiveCheckinTime: string | undefined;
          let freeWindowMinutes: number | undefined;
          if (isStayArrival) {
            const overrideMinutes = pinned;
            const placeCheckin = this.parseTimeMinutes(item.place?.checkin_time || '');
            const checkinMinutes = overrideMinutes ?? placeCheckin;
            if (checkinMinutes != null) {
              effectiveCheckinTime = this.formatTimeMinutes(checkinMinutes);
              if (arrivalMinutes != null) freeWindowMinutes = checkinMinutes - arrivalMinutes;
            }
          }

          // Advance the chain. The user-pinned `time` is treated as a target,
          // not an anchor — so we trust the computed arrival and only fall back
          // to the pinned time when no chain is running yet (legacy behavior
          // for trips without a home or stay context).
          if (item.isVirtualCheckout) {
            // Virtual checkout: hotel coords, departing at user-set check-out time.
            if (lat != null && lng != null) {
              prevLat = lat;
              prevLng = lng;
            }
            if (pinned != null) prevDepartureMinutes = pinned;
            chainBroken = false;
          } else if (this.isAccommodationStay(item)) {
            // Arriving at the accommodation that we'll stay at: chain ends here.
            // Subsequent rows on this day get no ETA (in practice there are none).
            if (lat != null && lng != null) {
              prevLat = lat;
              prevLng = lng;
            }
            chainBroken = true;
          } else if (lat != null && lng != null) {
            const baseStart = arrivalMinutes ?? pinned;
            if (baseStart != null) {
              const effectiveStart = pinned != null ? Math.max(baseStart, pinned) : baseStart;
              const stopDuration = item.duration_minutes ?? item.place?.duration ?? 0;
              prevDepartureMinutes = effectiveStart + stopDuration;
            }
            prevLat = lat;
            prevLng = lng;
          } else if (pinned != null && prevDepartureMinutes == null) {
            // Item without coords on a day with no anchor yet — let its time
            // start the chain so following items can still get ETAs.
            prevDepartureMinutes = pinned + (item.duration_minutes ?? 0);
          }

          return {
            ...item,
            status: statusObj,
            distance,
            eta,
            travelDuration,
            etaDeltaMinutes,
            isHome: this.isHomeItem(item),
            checkinTime: item.place?.checkin_time,
            checkoutTime: item.stay_checkout_time ?? item.place?.checkout_time,
            effectiveCheckinTime,
            freeWindowMinutes,
            earlyArrivalMinutes: this.earlyArrivalMinutes(item, eta),
          };
        });

        return {
          day,
          items,
          stats: {
            count: items.length,
            cost: [...costs.values()].reduce((total, value) => total + value, 0),
            costSummary: this.formatPriceSummary(costs),
            hasPlaces,
          },
        };
      })
      .filter((vm) => vm !== null);
  });
  totalPrice = computed(() => {
    const trip = this.trip();
    if (!trip?.days) return 0;

    return trip.days.reduce((total, day) => {
      return (
        total +
        day.items.reduce((dayTotal, item) => {
          return dayTotal + (item.price || 0);
        }, 0)
      );
    }, 0);
  });
  totalPriceSummary = computed(() => {
    const costs = new Map<string, number>();
    for (const day of this.trip()?.days ?? []) {
      for (const item of day.items) {
        if (!item.price) continue;
        const currency = this.itemCurrency(item);
        costs.set(currency, (costs.get(currency) ?? 0) + item.price);
      }
    }
    return this.formatPriceSummary(costs);
  });

  isAccommodationPlace(place?: Place | null): boolean {
    return place?.category?.name?.toLowerCase() === 'accommodation';
  }

  itemCurrency(item: Partial<TripItem>): string {
    return item.price_currency || item.place?.price_currency || this.trip()?.currency || '';
  }

  currencyCode(currency?: string | null): string {
    const value = (currency || '').trim().toUpperCase();
    const aliases: Record<string, string> = {
      $: 'USD',
      US$: 'USD',
      '€': 'EUR',
      '£': 'GBP',
      KČ: 'CZK',
      KC: 'CZK',
      KORUNA: 'CZK',
      '฿': 'THB',
      BAHT: 'THB',
      '₫': 'VND',
      DONG: 'VND',
    };
    if (aliases[value]) return aliases[value];
    return value.replace(/[^A-Z]/g, '').slice(0, 3);
  }

  tripPriceCurrencies(): string[] {
    const currencies = new Set<string>();
    for (const day of this.trip()?.days ?? []) {
      for (const item of day.items) {
        if (!item.price) continue;
        const currency = this.currencyCode(this.itemCurrency(item));
        if (currency) currencies.add(currency);
      }
    }
    return [...currencies].sort();
  }

  formatPrice(price?: number | null, currency?: string | null): string {
    if (!price) return '';
    return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(price)} ${currency || this.trip()?.currency || ''}`.trim();
  }

  formatPriceSummary(costs: Map<string, number>): string {
    const converted = this.convertPriceSummary(costs);
    if (converted != null) return `≈ ${this.formatPrice(converted, this.trip()?.currency)}`;

    return [...costs.entries()]
      .filter(([, value]) => value > 0)
      .map(([currency, value]) => this.formatPrice(value, currency))
      .join(' · ');
  }

  convertPriceSummary(costs: Map<string, number>): number | null {
    const base = this.currencyCode(this.trip()?.currency);
    const rates = this.exchangeRates();
    let converted = 0;
    let hasCosts = false;

    for (const [currency, value] of costs.entries()) {
      if (!value) continue;
      hasCosts = true;
      const code = this.currencyCode(currency);
      if (!code || code === base) {
        converted += value;
        continue;
      }
      const rate = rates[code];
      if (!rate) return null;
      converted += value * rate;
    }

    return hasCosts ? converted : null;
  }

  memberBalanceSummary(member: TripMember): string {
    const entries = Object.entries(member.balance ?? {}).filter(([, value]) => Math.abs(value) >= 0.005);
    if (!entries.length) return '-';
    const converted = this.convertPriceSummary(new Map(entries));
    if (converted != null) return `≈ ${this.formatPrice(converted, this.trip()?.currency)}`;
    return entries.map(([currency, value]) => this.formatPrice(value, currency)).join(' · ');
  }

  memberBalanceClass(member: TripMember): string {
    const values = Object.values(member.balance ?? {}).filter((value) => Math.abs(value) >= 0.005);
    if (!values.length) return 'bg-primary-100 text-primary-800';
    if (values.every((value) => value > 0)) return 'bg-green-100 text-green-800';
    if (values.every((value) => value < 0)) return 'bg-red-100 text-red-800';
    return 'bg-primary-100 text-primary-800';
  }

  isAccommodationStay(item: Partial<TripItem>): boolean {
    return this.isAccommodationPlace(item.place) && item.stay_checkout_day_id != null && !!item.stay_checkout_time;
  }

  virtualStayItemsForDay(
    day: TripDay,
    dayIndex: number,
    stayItems: TripItem[],
    dayIndexById: Map<number, number>,
  ): ViewTripItem[] {
    const virtualItems: ViewTripItem[] = [];

    for (const item of stayItems) {
      if (!item.place || item.stay_checkout_day_id == null || !item.stay_checkout_time) continue;

      const arrivalIndex = dayIndexById.get(item.day_id);
      const checkoutIndex = dayIndexById.get(item.stay_checkout_day_id);
      if (arrivalIndex == null || checkoutIndex == null || checkoutIndex <= arrivalIndex) continue;

      if (dayIndex > arrivalIndex && dayIndex < checkoutIndex) {
        virtualItems.push({
          ...item,
          status: typeof item.status === 'string' ? undefined : item.status,
          id: -(VIRTUAL_ITEM_ID_OFFSET + item.id * 10 + day.id),
          day_id: day.id,
          time: '00:00',
          text: `Staying at ${item.place.name}`,
          comment: undefined,
          price: undefined,
          isVirtualStay: true,
          sourceItemId: item.id,
        });
      }

      if (day.id === item.stay_checkout_day_id) {
        virtualItems.push({
          ...item,
          status: typeof item.status === 'string' ? undefined : item.status,
          id: -(VIRTUAL_ITEM_ID_OFFSET + item.id * 10 + 1),
          day_id: day.id,
          time: item.stay_checkout_time,
          text: `Check out · ${item.place.name}`,
          comment: undefined,
          price: undefined,
          isVirtualCheckout: true,
          sourceItemId: item.id,
        });
      }
    }

    return virtualItems;
  }

  /**
   * Compute the start-of-day anchor used by the ETA chain.
   *
   * - Day 0 (arrival/first day) with `home` set → anchor at home,
   *   departing at the user-set day_start_time, otherwise '08:00',
   *   otherwise the first item's pinned time, otherwise null.
   * - Mid-trip day where a stay is "in progress" (active accommodation
   *   covering this day, but not the arrival or checkout day) → anchor
   *   at the accommodation's coords, departing at day_start_time
   *   (or '09:00' default).
   * - Checkout day → null (the virtual checkout row carries its own
   *   anchor via its `time` and place coords).
   * - Otherwise → null (chain falls back to the first item's `time`).
   */
  computeDayAnchor(
    day: TripDay,
    dayIndex: number,
    stayItems: TripItem[],
    dayIndexById: Map<number, number>,
  ): { lat: number; lng: number; departureMinutes: number } | null {
    const home = this.tripHomeCoordinate();
    const explicitStart = day.day_start_time ? this.parseTimeMinutes(day.day_start_time) : null;

    if (dayIndex === 0 && home) {
      // Find the first non-stay pinned time. A stay's `time` is a check-in
      // override, not a departure-from-home anchor, so we ignore it here.
      const firstNonStay = day.items.find((candidate) => !this.isAccommodationStay(candidate));
      const firstPinned = this.parseTimeMinutes(firstNonStay?.time ?? '');
      const startMinutes = explicitStart ?? firstPinned ?? this.parseTimeMinutes('08:00');
      if (startMinutes == null) return null;
      return { lat: home.lat, lng: home.lng, departureMinutes: startMinutes };
    }

    for (const stay of stayItems) {
      if (!stay.place || stay.stay_checkout_day_id == null) continue;
      const arrivalIndex = dayIndexById.get(stay.day_id);
      const checkoutIndex = dayIndexById.get(stay.stay_checkout_day_id);
      if (arrivalIndex == null || checkoutIndex == null) continue;
      const isBaseCampDay = dayIndex > arrivalIndex && dayIndex < checkoutIndex;
      if (!isBaseCampDay) continue;
      const lat = stay.place.lat;
      const lng = stay.place.lng;
      if (lat == null || lng == null) continue;
      const startMinutes = explicitStart ?? this.parseTimeMinutes('09:00');
      if (startMinutes == null) continue;
      return { lat, lng, departureMinutes: startMinutes };
    }

    return null;
  }

  /**
   * Render hint for the ETA-vs-pinned-time delta badge.
   * Returns null when |delta| is below the threshold (no badge shown).
   * Negative delta = arriving earlier than planned (muted).
   * Positive delta = arriving later than planned (red).
   */
  etaDeltaBadge(item: ViewTripItem): { label: string; cssClass: string } | null {
    if (item.etaDeltaMinutes == null) return null;
    if (Math.abs(item.etaDeltaMinutes) < ETA_DELTA_BADGE_THRESHOLD_MIN) return null;
    if (item.isVirtualStay || item.isVirtualCheckout || item.isHome) return null;
    // Stays don't show a late/early badge — `time` is a check-in override,
    // not an arrival pin, so the comparison would be misleading.
    if (this.isAccommodationStay(item)) return null;

    const minutes = Math.abs(item.etaDeltaMinutes);
    const formatted = this.formatDurationMinutes(minutes);
    if (item.etaDeltaMinutes > 0) {
      return { label: `${formatted} late`, cssClass: 'text-red-500 dark:text-red-400 font-medium' };
    }
    return { label: `${formatted} early`, cssClass: 'text-primary-400 dark:text-primary-500' };
  }

  /**
   * For accommodation arrivals, the prominent time on the row is the
   * computed arrival ETA — that's what matters when planning a free-time
   * stop before check-in. Falls back to the effective check-in time, then
   * to the raw item.time, then to em-dash.
   */
  primaryTimeLabel(item: ViewTripItem): string {
    if (this.isAccommodationStay(item) && !item.isVirtualStay && !item.isVirtualCheckout) {
      return item.eta || item.effectiveCheckinTime || item.time || '—';
    }
    return item.time || '—';
  }

  primaryTimeKind(item: ViewTripItem): 'eta' | 'checkin' | 'time' {
    if (this.isAccommodationStay(item) && !item.isVirtualStay && !item.isVirtualCheckout) {
      if (item.eta) return 'eta';
      if (item.effectiveCheckinTime) return 'checkin';
    }
    return 'time';
  }

  /**
   * Free-window helper used by the stay row narration:
   * positive minutes = arrived before check-in (planning opportunity),
   * negative = arrived after check-in (no free window),
   * zero = arrives exactly at check-in.
   */
  formatFreeWindow(minutes: number): string {
    if (minutes <= 0) return '';
    return `${this.formatDurationMinutes(minutes)} free`;
  }

  /** Threshold (minutes) at which we surface a + Add stop prompt. */
  readonly ADD_STOP_THRESHOLD_MIN = 60;

  earlyArrivalMinutes(item: ViewTripItem, eta?: string): number | undefined {
    if (!eta || item.isVirtualStay || item.isVirtualCheckout || !this.isAccommodationPlace(item.place))
      return undefined;

    // Effective check-in is the per-item override if set, otherwise the
    // place's default. The override lets a user record a confirmed early
    // check-in (e.g. 14:00 instead of the hotel's listed 15:00).
    const overrideMinutes = this.parseTimeMinutes(item.time);
    const placeCheckin = this.parseTimeMinutes(item.place?.checkin_time || '');
    const checkin = overrideMinutes ?? placeCheckin;
    const arrival = this.parseTimeMinutes(eta);
    if (checkin == null || arrival == null || arrival >= checkin) return undefined;
    return checkin - arrival;
  }

  displayedPlaces = computed(() => {
    const allPlaces = this.places();
    if (!this.showOnlyUnplannedPlaces()) return allPlaces;

    const usedIds = this.usedPlaceIds();
    return allPlaces.filter((place) => !usedIds.has(place.id));
  });
  dispPackingList = computed(() => {
    const list = this.packingList();
    const sorted = [...list].sort((a, b) =>
      a.packed !== b.packed ? (a.packed ? 1 : -1) : a.text.localeCompare(b.text),
    );

    return sorted.reduce<Record<string, PackingItem[]>>((acc, item) => {
      (acc[item.category] ??= []).push(item);
      return acc;
    }, {});
  });
  dispChecklist = computed(() => {
    const items = this.checklistItems();
    return [...items].sort((a, b) => (a.checked !== b.checked ? (a.checked ? 1 : -1) : b.id - a.id));
  });
  watchlistItems = computed(() => {
    return this.tripViewModel()
      .flatMap((day) => day.items)
      .filter((item) => item.status && ['pending', 'constraint'].includes(item.status.label));
  });
  itemsToPasteCount = computed(() => this.utilsService.packingListToCopy.length);
  highlightLayerData = computed<HighlightData | null>(() => {
    const dayId = this.highlightedDayId();
    const trip = this.trip();
    if (dayId === null || !trip?.days) return null;

    const paths: { coords: [number, number][]; options: any }[] = [];
    const markers: any[] = [];
    const gpxData: string[] = [];
    const bounds: [number, number][] = [];
    const activePlaceIds = new Set<number>();

    const processItems = (items: TripItem[], color: string, isSingleDay: boolean) => {
      const coords: [number, number][] = [];

      for (const item of items) {
        if (item.place?.id) activePlaceIds.add(item.place.id);
        const lat = item.lat || item.place?.lat;
        const lng = item.lng || item.place?.lng;

        if (!lat || !lng) continue;

        if (!item.place) markers.push(item);
        if (item.gpx) gpxData.push(item.gpx);
        bounds.push([lat, lng]);
        coords.push([lat, lng]);
      }

      if (items.length > 2 && coords.length > 0) {
        paths.push({
          coords,
          options: {
            delay: isSingleDay ? 400 : 600,
            weight: 5,
            color,
          },
        });
      }
    };

    if (dayId === -1) {
      trip.days.forEach((day, idx) => {
        const color = HIGHLIGHT_COLORS[idx % HIGHLIGHT_COLORS.length];
        processItems(day.items, color, false);
      });
    } else {
      const day = trip.days.find((d) => d.id === dayId);
      if (day) processItems(day.items, '#0000FF', true);
    }

    return bounds.length >= 2 || paths.length > 0 ? { paths, markers, gpxData, bounds, activePlaceIds } : null;
  });
  selectedItemPropsSet = computed(() => new Set(this.selectedItemProps()));
  canToggleTextAndPlace = computed(() => this.selectedItemPropsSet().has('place'));

  menuTripExportItems: MenuItem[] = [
    {
      label: 'Export',
      items: [
        {
          label: 'Calendar (.ics)',
          icon: 'pi pi-calendar',
          command: () => generateTripICSFile(this.trip()!, this.utilsService),
        },
        {
          label: 'CSV',
          icon: 'pi pi-file',
          command: () => generateTripCSVFile(this.trip()!),
        },
        {
          label: 'Pretty Print',
          icon: 'pi pi-print',
          command: () => this.togglePrint(),
        },
      ],
    },
  ];
  menuTripActionsItems: MenuItem[] = [];
  menuTripPackingItems: MenuItem[] = [];
  menuTripDayActionsItems: MenuItem[] = [];
  menuPlanDayActionsItems: MenuItem[] = [];
  menuSelectedItemActionsItems: MenuItem[] = [];
  menuSelectedPlaceActionsItems: MenuItem[] = [];
  menuSelectedDayActionsItems: MenuItem[] = [];
  selectedTripDayForMenu?: TripDay;
  statuses: TripStatus[];
  availableItemProps = ['place', 'comment', 'latlng', 'price', 'status', 'distance'];
  roadbookLegendGroups: RoadbookLegendGroup[] = ROADBOOK_LEGEND_GROUPS;
  exchangeRates = signal<Record<string, number>>({});
  private exchangeRateKey = '';

  map?: L.Map;
  markerClusterGroup?: L.MarkerClusterGroup;
  tripMapAntLayer?: L.FeatureGroup;
  markers = new Map<number, L.Marker>();
  selectedItemMarker?: L.Marker;
  highlightedMarkerElement?: HTMLElement;

  constructor() {
    this.apiService = inject(ApiService);
    this.route = inject(ActivatedRoute);
    this.router = inject(Router);
    this.dialogService = inject(DialogService);
    this.utilsService = inject(UtilsService);
    this.clipboard = inject(Clipboard);
    this.routeManager = inject(RouteManagerService);
    this.changeDetectionRef = inject(ChangeDetectorRef);
    this.sanitizer = inject(DomSanitizer);

    this.statuses = this.utilsService.statuses;
    this.username = this.utilsService.loggedUser;

    this.plansSearchInput.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((value) => this.searchQuery.set(value || ''));

    effect(() => {
      const trip = this.trip();
      const currencies = this.tripPriceCurrencies();
      if (!trip) return;

      const base = this.currencyCode(trip.currency);
      const externalCurrencies = currencies.filter((currency) => currency && currency !== base);
      const key = `${base}:${externalCurrencies.join(',')}`;
      if (key === this.exchangeRateKey) return;
      this.exchangeRateKey = key;

      if (!externalCurrencies.length) {
        untracked(() => this.exchangeRates.set({}));
        return;
      }

      untracked(() => {
        this.apiService
          .getCurrencyRates(base, externalCurrencies)
          .pipe(take(1))
          .subscribe({
            next: (response) => this.exchangeRates.set(response.rates),
            error: () => this.exchangeRates.set({}),
          });
      });
    });

    effect(() => {
      const vm = this.tripViewModel();
      untracked(() => {
        if (this.map && this.trip()) this.updateMapVisualization(vm);
      });
    });

    effect(() => {
      const data = this.highlightLayerData();

      untracked(() => {
        const activePlaceIds = data?.activePlaceIds || new Set<number>();
        this.markers.forEach((marker: any, placeId) => {
          const isHighlighted = activePlaceIds.has(placeId);
          marker.isHighlightedPlace = isHighlighted;
          const el = marker.getElement();
          if (!el) return;

          if (isHighlighted) el.classList.add('active-trip-place');
          else el.classList.remove('active-trip-place');
        });

        if (this.tripMapAntLayer) {
          this.map?.removeLayer(this.tripMapAntLayer);
          this.tripMapAntLayer = undefined;
        }

        const mapContainer = this.map?.getContainer();
        if (!data || !this.map) {
          if (mapContainer) mapContainer.classList.remove('leaflet-tripday-pane-highlighting');
          return;
        }

        if (mapContainer) mapContainer.classList.add('leaflet-tripday-pane-highlighting');

        const layerGroup = L.featureGroup();
        data.paths.forEach((p) => {
          const polyline = L.polyline(p.coords, {
            color: p.options.color,
            weight: p.options.weight,
            className: 'animated-path',
            smoothFactor: 1.5,
          });
          layerGroup.addLayer(polyline);
        });
        data.markers.forEach((item) => {
          const marker = tripDayMarker(item);
          marker.on('add', (e: any) => e.target.getElement()?.classList.add('active-trip-marker'));
          marker.on('click', () => {
            if (this.selectedItem()?.id === item.id) {
              this.selectedItem.set(null);
              this.selectedPlace.set(null);
              this.selectedDay.set(null);
              return;
            }
            this.selectedItem.set(this.normalizeItem(item));
            this.selectedPlace.set(null);
            this.selectedDay.set(null);
          });
          layerGroup.addLayer(marker);
        });
        data.gpxData.forEach((gpx) => layerGroup.addLayer(gpxToPolyline(gpx)));

        this.tripMapAntLayer = layerGroup;
        requestAnimationFrame(() => {
          if (this.tripMapAntLayer && this.map) {
            this.tripMapAntLayer.addTo(this.map);
            this.map.fitBounds(data.bounds, { padding: [30, 30], maxZoom: 16 });
          }
        });
      });
    });

    effect(() => {
      // fix p-tabs scroll state issues
      const selection = this.dispSelectedPlace();
      const activeIndex = this.selectedPlaceActiveTabIndex();

      if (!selection || !this.selectedTabListRef) return;
      requestAnimationFrame(() => {
        (this.selectedTabListRef as any).updateButtonState();
        const element = document.querySelector('[data-pc-name="tab"][data-p-active="true"]');
        element?.scrollIntoView?.({ block: 'nearest' });
      });
    });

    effect(() => {
      const place = this.selectedPlace();
      const item = this.selectedItem();
      const _ = this.selectedDay(); //Force recompute height on day toggle
      const __ = this.selectedPlaceActiveTabIndex(); //Force recompute height on tab change

      //RAF for angular CD
      requestAnimationFrame(() => {
        if (this.selectedPanelRef?.nativeElement) {
          const height = this.selectedPanelRef.nativeElement.offsetHeight;
          this.selectedPanelHeight.set(height);
        } else this.selectedPanelHeight.set(0);
      });

      untracked(() => {
        this.clearSelectedItemHighlight();
        if (!this.map) return;
        if (place) {
          const existingMarker = this.markers.get(place.id);
          if (existingMarker) {
            this.highlightExistingMarker(existingMarker);
            const latlng = existingMarker.getLatLng();
            this.flyTo([latlng.lat, latlng.lng]);
          }
          return;
        } else if (item) {
          const lat = item.lat;
          const lng = item.lng;
          if (lat && lng) {
            this.selectedItemMarker = tripDayMarker(item);
            this.selectedItemMarker.addTo(this.map);
            this.flyTo([lat, lng]);
          }
        }
      });
    });

    const plansPanelWidth = localStorage.getItem('plansPanelWidth');
    if (plansPanelWidth) this.panelWidth.set(parseInt(plansPanelWidth));
  }

  ngAfterViewInit() {
    this.route.paramMap.pipe(take(1)).subscribe((params) => {
      const id = params.get('id');
      if (id) {
        this.loadTripData(+id);
        this.tripSharedDetails$ = this.apiService.getSharedTripDetails(+id);
      } else {
        this.router.navigate(['/trips']);
      }
    });
  }

  ngOnDestroy() {
    this.cleanupMap();
  }

  cleanupMap() {
    if (this.tripMapAntLayer) {
      this.map?.removeLayer(this.tripMapAntLayer);
      this.tripMapAntLayer = undefined;
    }

    this.markers.forEach((marker) => marker.remove());
    this.markers.clear();

    if (this.markerClusterGroup) {
      this.markerClusterGroup.clearLayers();
      this.markerClusterGroup = undefined;
    }

    if (this.map) {
      this.map.remove();
      this.map = undefined;
    }
  }

  getItemDayLabel(item: ViewTripItem): string {
    const trip = this.trip();
    if (!trip?.days) return '';
    const day = trip.days.find((d) => d.id === item.day_id);
    return day?.label || '';
  }

  loadTripData(id: number) {
    forkJoin({
      trip: this.apiService.getTrip(id),
      places: this.apiService.getPlaces(),
      settings: this.apiService.getSettings(),
      members: this.apiService.getTripMembers(id),
    })
      .pipe(take(1))
      .subscribe({
        next: ({ trip, places, settings, members }) => {
          this.trip.set(trip);
          this.allPlaces.set(places);
          this.tripMembers.set(members);
          if (!this.map) this.initMap(settings);
        },
        error: () => {
          this.utilsService.toast('error', 'Error', 'Could not load trip');
          this.router.navigate(['/trips']);
        },
      });
  }

  initMap(settings: Settings) {
    this.cleanupMap();

    const contextMenuItems = [
      {
        text: 'Add Point of Interest',
        callback: (e: any) => {
          this.addPlace(e);
        },
      },
      {
        text: 'Copy coordinates',
        callback: (e: any) => {
          const { lat, lng } = e.latlng;
          navigator.clipboard.writeText(`${parseFloat(lat).toFixed(5)}, ${parseFloat(lng).toFixed(5)}`);
        },
      },
    ];

    this.map = createMap(contextMenuItems, settings.tile_layer);
    this.markerClusterGroup = createClusterGroup().addTo(this.map);
    this.map.setView([settings.map_lat, settings.map_lng]);
    this.updateMapVisualization(this.tripViewModel());
    this.resetMapBounds();
  }

  updateMapVisualization(viewModels: DayViewModel[]) {
    if (!this.map || !this.markerClusterGroup) return;

    this.markerClusterGroup.clearLayers();
    this.markers.clear();

    if (this.tripMapAntLayer) {
      this.map.removeLayer(this.tripMapAntLayer);
      this.tripMapAntLayer = undefined;
    }

    const usedIds = this.usedPlaceIds();
    const allPlaces = this.places();
    const markersToAdd: L.Marker[] = [];
    const homePlace = this.tripHomePlaceOption();

    allPlaces.forEach((place) => {
      const isUsed = usedIds.has(place.id);
      const marker = placeToMarker(place, false, !isUsed, false, () => this.markerRightClickFn(place));
      marker.on('add', (e: any) => {
        const el = e.target.getElement();
        if (el && e.target.isHighlightedPlace) el.classList.add('active-trip-place');
      });

      marker.on('click', () => {
        this.selectedPlace.set(place);
        this.selectedItem.set(null);
        this.selectedDay.set(null);
        const liveItemCount = this.selectedPlaceItems().length;
        this.selectedPlaceActiveTabIndex.set(liveItemCount);
      });

      this.markers.set(place.id, marker);
      markersToAdd.push(marker);
    });

    if (homePlace) {
      const marker = placeToMarker(homePlace, false, false, false, () => this.addHomeItem());
      marker.on('click', () => this.flyTo([homePlace.lat, homePlace.lng]));
      markersToAdd.push(marker);
    }

    if (markersToAdd.length) {
      this.markerClusterGroup.addLayers(markersToAdd);
    }
  }

  resetMapBounds() {
    const allPlaces = this.places();

    if (!allPlaces.length) {
      const trip = this.trip();
      if (!trip?.days.length) return;

      const itemsWithCoordinates = this.tripViewModel()
        .flatMap((dayVM) => dayVM.items)
        .filter((i) => i.lat != null && i.lng != null);

      if (!itemsWithCoordinates.length) return;
      this.map?.fitBounds(
        itemsWithCoordinates.map((i) => [i.lat!, i.lng!]),
        { padding: [15, 15] },
      );
      return;
    }

    this.map?.fitBounds(
      allPlaces.map((p) => [p.lat, p.lng]),
      { padding: [15, 15] },
    );
  }

  normalizeItem(item: TripItem): ViewTripItem {
    const statusObj =
      typeof item.status === 'string'
        ? this.utilsService.statuses.find((s) => s.label === item.status)
        : (item.status as TripStatus | undefined);

    return { ...item, status: statusObj };
  }

  openMenuTripDayActions(event: any, day: TripDay) {
    this.menuTripDayActionsItems = [
      {
        label: 'Actions',
        items: [
          {
            label: 'Plan',
            icon: 'pi pi-plus',
            command: () => this.addItem(),
          },
          {
            label: 'Recalculate Times',
            icon: 'pi pi-refresh',
            disabled: this.trip()!.archived,
            command: () => this.retimeDay(day),
          },
          {
            label: 'Add Home',
            icon: 'pi pi-home',
            disabled: !this.tripHomeCoordinate(),
            command: () => this.addHomeItem(day.id),
          },
          {
            label: 'Edit',
            icon: 'pi pi-pencil',
            command: () => this.editDay(day),
          },
          {
            label: 'Delete',
            icon: 'pi pi-trash',
            iconClass: 'text-red-500!',
            command: () => this.deleteDay(day),
          },
        ],
      },
    ];
    this.menuTripDayActions.toggle(event);
  }

  openMenuSelectedItemActions(event: any, item: any) {
    this.menuSelectedItemActionsItems = [
      {
        label: 'Actions',
        items: [
          {
            label: 'Open Navigation',
            icon: 'pi pi-directions',
            command: () => this.itemToNavigation(),
          },
          {
            label: 'Edit plan item',
            icon: 'pi pi-pencil',
            disabled: this.trip()!.archived,
            command: () => this.editItem(item),
          },
          {
            label: 'Delete plan item',
            icon: 'pi pi-trash',
            disabled: this.trip()!.archived,
            command: () => this.deleteItem(item),
          },
        ],
      },
    ];
    this.menuSelectedItemActions.toggle(event);
  }

  openMenuSelectedPlaceActions(event: any, place: Place) {
    this.menuSelectedPlaceActionsItems = [
      {
        label: 'Actions',
        items: [
          {
            label: 'Create plan from this place',
            icon: 'pi pi-link',
            disabled: this.trip()!.archived,
            command: () => this.addItem(undefined, place.id),
          },
          {
            label: 'Edit place (template)',
            icon: 'pi pi-pencil',
            disabled: this.trip()!.archived,
            command: () => this.editPlace(place),
          },
          {
            label: 'Remove place from trip',
            icon: 'pi pi-trash',
            disabled: this.trip()!.archived,
            command: () => this.unlinkPlaceFromTrip(place.id),
          },
        ],
      },
    ];
    this.menuSelectedPlaceActions.toggle(event);
  }

  openMenuPlanDayActionsItems(event: any, d: TripDay) {
    this.menuPlanDayActionsItems = [
      {
        label: 'Actions',
        items: [
          {
            label: 'Summary',
            icon: 'pi pi-minus',
            command: () => this.onDayClick(d),
          },
          {
            label: 'Highlight',
            icon: 'pi pi-wave-pulse',
            command: () => this.toggleTripDayHighlight(d.id),
          },
          {
            label: 'Routing',
            icon: 'pi pi-car',
            command: () => this.dayRouting(d),
          },
          {
            label: 'Recalculate Times',
            icon: 'pi pi-refresh',
            disabled: this.trip()!.archived,
            command: () => this.retimeDay(d),
          },
          {
            label: 'Add Home',
            icon: 'pi pi-home',
            disabled: !this.tripHomeCoordinate() || this.trip()!.archived,
            command: () => this.addHomeItem(d.id),
          },
          {
            label: 'Open Navigation',
            icon: 'pi pi-directions',
            command: () => this.tripDayToNavigation(d.id),
          },
        ],
      },
    ];
    this.menuPlanDayActions.toggle(event);
  }

  openMenuTripActionsItems(event: any) {
    const lists = {
      label: 'Lists',
      items: [
        {
          label: 'Attachments',
          icon: 'pi pi-paperclip',
          command: () => {
            this.openAttachmentsModal();
          },
        },
        {
          label: 'Checklist',
          icon: 'pi pi-list-check',
          command: () => {
            this.openChecklist();
          },
        },
        {
          label: 'Packing list',
          icon: 'pi pi-briefcase',
          command: () => {
            this.openPackingList();
          },
        },
      ],
    };
    const collaboration = {
      label: 'Collaboration',
      items: [
        {
          label: 'Members',
          icon: 'pi pi-users',
          command: () => {
            this.openMembersDialog();
          },
        },
        {
          label: 'Share',
          icon: 'pi pi-share-alt',
          command: () => {
            this.isShareDialogVisible = !this.isShareDialogVisible;
          },
        },
      ],
    };
    const actions = {
      label: 'Trip',
      items: [
        {
          label: 'Pretty Print',
          icon: 'pi pi-print',
          command: () => {
            this.togglePrint();
          },
        },
        {
          label: 'Notes',
          icon: 'pi pi-info-circle',
          command: () => {
            this.openTripNotesModal();
          },
        },
        {
          label: this.trip()!.archived ? 'Unarchive' : 'Archive',
          icon: 'pi pi-box',
          command: () => {
            this.toggleArchiveTrip();
          },
        },
        {
          label: 'Edit',
          icon: 'pi pi-pencil',
          disabled: this.trip()!.archived,
          command: () => {
            this.editTrip();
          },
        },
        {
          label: 'Delete',
          icon: 'pi pi-trash',
          disabled: this.trip()!.archived,
          command: () => {
            this.deleteTrip();
          },
        },
      ],
    };

    this.menuTripActionsItems = [lists, collaboration, actions];
    this.menuTripActions.toggle(event);
  }

  openMenuSelectedDayActions(event: any, d: TripDay) {
    this.menuSelectedDayActionsItems = [
      {
        label: 'Actions',
        items: [
          {
            label: 'Open Navigation',
            icon: 'pi pi-directions',
            command: () => this.tripDayToNavigation(d.id),
          },
          {
            label: 'Recalculate Times',
            icon: 'pi pi-refresh',
            disabled: this.trip()!.archived,
            command: () => this.retimeDay(d),
          },
          {
            label: 'Add Home',
            icon: 'pi pi-home',
            disabled: !this.tripHomeCoordinate() || this.trip()!.archived,
            command: () => this.addHomeItem(d.id),
          },
          {
            label: 'Highlight',
            icon: 'pi pi-wave-pulse',
            command: () => this.toggleTripDayHighlight(d.id),
          },
          {
            label: 'Edit',
            icon: 'pi pi-pencil',
            disabled: this.trip()!.archived,
            command: () => this.editDay(d),
          },
          {
            label: 'Delete',
            icon: 'pi pi-trash',
            disabled: this.trip()!.archived,
            command: () => this.deleteDay(d),
          },
        ],
      },
    ];
    this.menuSelectedDayActions.toggle(event);
  }

  toggleTripDayHighlight(newValue: number | null) {
    this.highlightedDayId.update((current) => (current === newValue ? null : newValue));
  }

  toggleTripDaysHighlight() {
    this.highlightedDayId.update((current) => (current === -1 ? null : -1));
  }

  back() {
    this.router.navigate(['/trips']);
  }

  togglePrint() {
    const trip = this.trip();
    if (!trip || !trip.days.length) return;

    const modal = this.dialogService.open(TripPrettyPrintModalComponent, {
      header: 'Print options',
      modal: true,
      appendTo: 'body',
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      width: '30vw',
      breakpoints: {
        '960px': '70vw',
        '640px': '90vw',
      },
      data: {
        props: this.availableItemProps,
        selectedProps: this.selectedItemProps(),
        days: trip.days,
      },
    })!;

    modal.onClose.pipe(take(1)).subscribe((data: PrintOptions | null) => {
      if (!data) return;
      this.printOptions.set(data);
      this.changeDetectionRef.detectChanges();
      window.print();
      this.printOptions.set(null);
    });
  }

  toggleFiltering() {
    this.isFilteringMode.update((v) => !v);
  }

  togglePlansPanel() {
    this.isPlansPanelCollapsed.update((v) => !v);
  }

  togglePlacesPanel() {
    this.isPlacesPanelVisible.update((v) => !v);
  }

  toggleDaysPanel() {
    this.isDaysPanelVisible.update((v) => !v);
  }

  toggleUnplannedPlacesFilter() {
    this.showOnlyUnplannedPlaces.update((v) => !v);
  }

  toggleArchiveTrip() {
    if (this.trip()!.archived) this.openUnarchiveTripModal();
    else this.openArchiveTripModal();
  }

  toggleArchiveReview() {
    this.isArchivalReviewDisplayed.update((v) => !v);
  }

  toggleMultiSelectMode() {
    this.isMultiSelectMode.update((v) => !v);
    if (!this.isMultiSelectMode()) this.clearMultiSelectSelection();
    else {
      this.selectedPlace.set(null);
      this.selectedItem.set(null);
    }
  }

  clearMultiSelectSelection() {
    this.selectedItemIds.set(new Set());
  }

  toggleItemSelection(itemId: number) {
    this.selectedItemIds.update((ids) => {
      const newIds = new Set(ids);
      if (newIds.has(itemId)) newIds.delete(itemId);
      else newIds.add(itemId);
      return newIds;
    });
  }

  unlinkPlaceFromTrip(placeId: number) {
    if (this.usedPlaceIds().has(placeId)) {
      this.utilsService.toast('error', 'Place in use', 'This place is referenced by at least one plan');
      return;
    }

    const modal = this.dialogService.open(YesNoModalComponent, {
      header: 'Unlink Place',
      modal: true,
      appendTo: 'body',
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      data: 'Remove the place from this Trip?',
    })!;

    modal.onClose.pipe(take(1)).subscribe((bool) => {
      if (!bool) return;
      const new_places = this.trip()
        ?.places.map((p) => p.id)
        .filter((id) => id !== placeId);
      this.apiService
        .putTrip({ place_ids: new_places }, this.trip()!.id)
        .pipe(take(1))
        .subscribe({
          next: (trip) => {
            this.trip.set(trip);
            this.selectedPlace.set(null);
            this.selectedPlaceActiveTabIndex.set(0);
          },
        });
    });
  }

  getDayAttachments(day: TripDay): TripAttachment[] {
    const attachments = new Map<number, TripAttachment>();
    day.items.forEach((item) => {
      if (!item.attachments) return;
      item.attachments.forEach((attachment) => {
        attachments.set(attachment.id, attachment);
      });
    });
    return Array.from(attachments.values());
  }

  getDayPlaces(day: TripDay): Place[] {
    const places = new Map<number, Place>();
    day.items.forEach((item) => {
      if (item.place) {
        places.set(item.place.id, item.place);
      }
    });
    return Array.from(places.values());
  }

  getCategoriesFromPlaces(places: Set<Place>): Category[] {
    const categories = new Map<number, Category>();
    places.forEach((p) => categories.set(p.category.id, p.category));
    return Array.from(categories.values());
  }

  roadbookRows(group: DayViewModel, mapProvider: PrintMapProvider = 'mapy'): RoadbookRow[] {
    return roadbookRowsForDay(group, mapProvider);
  }

  roadbookDayTotal(group: DayViewModel): string {
    return roadbookDayTotalKm(group);
  }

  printMapProvider(options?: PrintOptions | null): PrintMapProvider {
    return options?.mapProvider ?? 'mapy';
  }

  roadbookEmergencyUrl(mapProvider: PrintMapProvider = 'mapy'): string {
    return roadbookEmergencyMapsUrl(this.trip(), mapProvider);
  }

  roadbookEmergencyText(mapProvider: PrintMapProvider = 'mapy'): string {
    const providerName = mapProvider === 'google' ? 'Google Maps' : 'Mapy.com';
    return `V prípade straty orientácie naskenujte tento kód pre ${providerName} offline mapu.`;
  }

  roadbookQr(url?: string | null): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(qrCodeSvg(url));
  }

  roadbookPlaceUrl(place: Place, mapProvider: PrintMapProvider = 'mapy'): string {
    return mapProviderUrl(place.lat, place.lng, place.name, mapProvider);
  }

  resetPlansWidth() {
    this.panelWidth.set(null);
    localStorage.removeItem('plansPanelWidth');
  }

  onPlansResizeStart(event: PointerEvent): void {
    event.preventDefault();

    const section = (event.target as HTMLElement).closest('section');
    this.panelDeltaX = event.clientX;
    this.panelDeltaWidth = section?.offsetWidth || 512;

    const handle = event.target as HTMLElement;
    handle.setPointerCapture(event.pointerId);

    const onMove = (e: PointerEvent) => {
      const newWidth = Math.max(320, Math.min(1280, this.panelDeltaWidth + (e.clientX - this.panelDeltaX)));
      this.panelWidth.set(newWidth);
    };

    const onUp = (e: PointerEvent) => {
      handle.releasePointerCapture(e.pointerId);
      localStorage.setItem('plansPanelWidth', this.panelWidth()!.toString());
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  onCoordsCopied() {
    this.tooltipCopied.set(true);
    setTimeout(() => this.tooltipCopied.set(false), 1200);
  }

  onDayClick(day: TripDay) {
    this.toggleTripDayHighlight(null);
    if (this.selectedDay()?.id === day.id) {
      this.selectedPlace.set(null);
      this.selectedItem.set(null);
      this.selectedDay.set(null);
      return;
    }

    this.selectedDay.set(day);
    this.selectedPlace.set(null);
    this.selectedItem.set(null);
    this.toggleTripDayHighlight(day.id);
  }

  onPlaceClick(place: Place) {
    if (this.selectedPlace()?.id === place.id) {
      this.selectedPlace.set(null);
      this.selectedItem.set(null);
      this.selectedDay.set(null);
      this.selectedPlaceActiveTabIndex.set(0);
      return;
    }

    this.selectedPlace.set(place);
    this.selectedItem.set(null);
    this.selectedDay.set(null);
    const itemCount = this.selectedPlaceItems().length;
    this.selectedPlaceActiveTabIndex.set(itemCount);
  }

  onRowClick(item: ViewTripItem) {
    if (this.isMultiSelectMode()) {
      this.toggleItemSelection(item.id);
      return;
    }

    if (item.place) {
      const currentSelection = this.selectedPlace();
      // compute tab index for items
      const placeItems = this.tripViewModel()
        .flatMap((vm) => vm.items)
        .filter((i) => i.place?.id === item.place?.id);

      const newTabIndex = placeItems.findIndex((i) => i.id === item.id);
      const targetTabIndex = newTabIndex >= 0 ? newTabIndex : 0;
      if (currentSelection?.id === item.place.id) {
        const currentTabIndex = this.selectedPlaceActiveTabIndex();

        if (currentTabIndex === targetTabIndex) {
          this.selectedPlace.set(null);
          this.selectedItem.set(null);
          this.selectedDay.set(null);
          this.selectedPlaceActiveTabIndex.set(0);
          return;
        }

        this.selectedPlaceActiveTabIndex.set(targetTabIndex);
        this.selectedItem.set(null);
        return;
      }

      this.selectedPlace.set(item.place);
      this.selectedItem.set(null);
      this.selectedDay.set(null);
      this.selectedPlaceActiveTabIndex.set(targetTabIndex);
      return;
    }

    const currentItem = this.selectedItem();
    if (currentItem?.id === item.id) {
      this.selectedItem.set(null);
      this.selectedPlace.set(null);
      this.selectedDay.set(null);
      return;
    }

    this.selectedItem.set(item);
    this.selectedPlace.set(null);
    this.selectedDay.set(null);
  }

  onRowEnter(item: ViewTripItem) {
    if (this.selectedPlace() || this.selectedItem()) return;
    this.clearSelectedItemHighlight();

    const placeId = item?.place?.id;
    if (!placeId) return;

    const marker = this.markers.get(placeId);
    if (marker) this.highlightExistingMarker(marker);
  }

  onRowLeave() {
    if (this.selectedPlace() || this.selectedItem()) return;
    this.clearSelectedItemHighlight();
  }

  async centerOnMe() {
    const position = await getGeolocationLatLng();
    if (position.err) {
      this.utilsService.toast('error', 'Error', position.err);
      return;
    }

    const coords: any = [position.lat!, position.lng!];
    this.map?.flyTo(coords);
    const marker = toDotMarker(coords);
    marker.addTo(this.map!);
    setTimeout(() => {
      marker.remove();
    }, 4000);
  }

  highlightExistingMarker(marker: L.Marker) {
    if (!this.markerClusterGroup) return;
    const markerElement = marker.getElement() as HTMLElement;
    if (markerElement) {
      markerElement.classList.add('list-hover');
      this.highlightedMarkerElement = markerElement;
    } else {
      const parentCluster = (this.markerClusterGroup as any).getVisibleParent(marker);
      if (parentCluster) {
        const clusterEl = parentCluster.getElement();
        if (clusterEl) {
          clusterEl.classList.add('list-hover');
          this.highlightedMarkerElement = clusterEl;
        }
      }
    }
  }

  clearSelectedItemHighlight() {
    if (this.selectedItemMarker) {
      this.map?.removeLayer(this.selectedItemMarker);
      this.selectedItemMarker = undefined;
    }

    if (this.highlightedMarkerElement) {
      this.highlightedMarkerElement.classList.remove('list-hover');
      this.highlightedMarkerElement = undefined;
    }
  }

  addItem(
    dayId?: number,
    placeId?: number,
    options?: { prefillTime?: string; helperBanner?: string },
  ) {
    const modal = this.dialogService.open(TripCreateDayItemModalComponent, {
      header: 'Add Item',
      modal: true,
      appendTo: 'body',
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      breakpoints: {
        '640px': '90vw',
      },
      data: {
        trip: this.trip(),
        selectedDayId: dayId,
        selectedPlaceId: placeId,
        selectedHome: placeId === HOME_PLACE_ID,
        places: this.itemPlaceOptions(),
        members: this.tripMembers(),
        prefillTime: options?.prefillTime,
        helperBanner: options?.helperBanner,
      },
    })!;

    modal.onClose.pipe(take(1)).subscribe((newItem: NewTripItemFormValue | null) => {
      if (!newItem) return;

      this.ensureTripPlace(newItem.place)
        .pipe(
          switchMap(() => {
            const obs$ = newItem.day_id.map((day_id) =>
              this.apiService.postTripDayItem({ ...newItem, day_id } as TripItem, this.trip()!.id, day_id),
            );
            return forkJoin(obs$);
          }),
          take(1),
        )
        .subscribe({
          next: (items: TripItem[]) => {
            this.trip.update((currentTrip) => {
              if (!currentTrip) return null;

              const newItemsByDay = items.reduce(
                (acc, item) => {
                  (acc[item.day_id] ??= []).push(item);
                  return acc;
                },
                {} as Record<number, TripItem[]>,
              );

              const updatedDays = currentTrip.days.map((day) =>
                newItemsByDay[day.id] ? { ...day, items: [...day.items, ...newItemsByDay[day.id]] } : day,
              );

              return { ...currentTrip, days: updatedDays };
            });
          },
        });
    });
  }

  addHomeItem(dayId?: number) {
    if (!this.tripHomeCoordinate()) {
      this.utilsService.toast('warn', 'Home missing', 'Set trip home before adding it to the plan');
      return;
    }
    this.addItem(dayId, HOME_PLACE_ID);
  }

  /**
   * Suggestive entry point invoked from a stay row when there is a non-trivial
   * free window between the computed arrival ETA and effective check-in.
   * Opens the item modal pre-filled with the day, the ETA as the target time,
   * and a helper banner that explains the context.
   */
  addStopInFreeWindow(item: ViewTripItem) {
    if (!item.day_id || !item.eta || !item.freeWindowMinutes || item.freeWindowMinutes <= 0) return;
    const checkin = item.effectiveCheckinTime;
    const window = this.formatDurationMinutes(item.freeWindowMinutes);
    const banner = checkin
      ? `Arriving at ${item.eta}, check-in ${checkin} — about ${window} free before the room is ready.`
      : `Arriving at ${item.eta} — about ${window} free before check-in.`;
    this.addItem(item.day_id, undefined, { prefillTime: item.eta, helperBanner: banner });
  }

  editItem(item: TripItem) {
    const editItem = {
      ...item,
      place: item.place?.id ?? (this.isHomeItem(item) ? HOME_PLACE_ID : null),
      status: item.status ? (item.status as TripStatus)?.label : null,
    };
    const modal = this.dialogService.open(TripCreateDayItemModalComponent, {
      header: 'Update Item',
      modal: true,
      appendTo: 'body',
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      data: {
        trip: this.trip(),
        item: editItem,
        places: this.itemPlaceOptions(),
        members: this.tripMembers(),
      },
    })!;

    modal.onClose.pipe(take(1)).subscribe((updated: TripItemFormValue | null) => {
      if (!updated) return;

      this.ensureTripPlace(updated.place)
        .pipe(
          switchMap(() =>
            this.apiService.putTripDayItem(updated as Partial<TripItem>, this.trip()!.id, item.day_id, item.id),
          ),
        )
        .subscribe((newItem) => {
          this.trip.update((current) => {
            if (!current) return null;

            let days = [...current.days];

            if (item.day_id !== newItem.day_id) {
              days = days.map((d) =>
                d.id === item.day_id ? { ...d, items: d.items.filter((i) => i.id !== item.id) } : d,
              );
            }

            days = days.map((d) => {
              if (d.id === newItem.day_id) {
                const exists = d.items.some((i) => i.id === newItem.id);
                const newItems = exists
                  ? d.items.map((i) => (i.id === newItem.id ? newItem : i))
                  : [...d.items, newItem];
                return { ...d, items: newItems };
              }
              return d;
            });

            return { ...current, days };
          });
          const normalizedItem = this.normalizeItem(newItem);
          if (this.selectedItem()?.id === item.id) this.selectedItem.set(normalizedItem);
          if (this.selectedPlace()?.id === item.place?.id || this.selectedPlace()?.id === newItem.place?.id) {
            const currentPlace = this.selectedPlace();
            if (currentPlace) this.selectedPlace.set({ ...currentPlace });
          }
        });
    });
  }

  ensureTripPlace(placeId?: number | null): Observable<Trip | null> {
    const trip = this.trip();
    if (!trip || !placeId || placeId === HOME_PLACE_ID || this.places().some((place) => place.id === placeId)) {
      return of(trip);
    }
    return this.apiService.putTrip({ place_ids: [placeId, ...this.places().map((place) => place.id)] }, trip.id).pipe(
      tap((updatedTrip) => {
        this.trip.set(updatedTrip);
      }),
    );
  }

  deleteItem(item: TripItem) {
    const modal = this.dialogService.open(YesNoModalComponent, {
      header: 'Delete Item',
      modal: true,
      appendTo: 'body',
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      data: `Delete ${item.text.substring(0, 50)}?`,
    })!;

    modal.onClose.pipe(take(1)).subscribe((bool) => {
      if (!bool) return;
      this.apiService.deleteTripDayItem(this.trip()!.id, item.day_id, item.id).subscribe(() => {
        this.trip.update((current) => {
          if (!current) return null;
          const days = current.days.map((d) =>
            d.id === item.day_id ? { ...d, items: d.items.filter((i) => i.id !== item.id) } : d,
          );
          return { ...current, days };
        });
        if (this.selectedItem()?.id === item.id) this.selectedItem.set(null);
        if (this.selectedPlace()?.id === item.place?.id) {
          const remainingItems = this.selectedPlaceItems().filter((i) => i.id !== item.id);
          if (remainingItems.length === 0) this.selectedPlaceActiveTabIndex.set(0);
        }
      });
    });
  }

  addDay() {
    const modal = this.dialogService.open(TripCreateDayModalComponent, {
      header: 'Add Day(s)',
      modal: true,
      appendTo: 'body',
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      data: { days: this.trip()!.days },
      breakpoints: {
        '640px': '80vw',
      },
    })!;

    modal.onClose.pipe(take(1)).subscribe((data: TripDay | { daterange: Date[]; notes?: string[] } | null) => {
      if (!data) return;

      if ('daterange' in data && data.daterange && data.daterange.length === 2) {
        const tripDays = daterangeToTripDays(data.daterange);
        const obs$ = tripDays.map((td) =>
          this.apiService.postTripDay({ id: -1, label: td.label!, dt: td.dt, items: [] }, this.trip()!.id),
        );

        forkJoin(obs$)
          .pipe(take(1))
          .subscribe((newDays: TripDay[]) => {
            this.trip.update((t) => {
              if (!t) return null;
              const days = [...t.days, ...newDays].sort((a, b) => (a.dt || '').localeCompare(b.dt || ''));
              return { ...t, days };
            });
          });
      } else {
        const newDay = data as TripDay;
        this.apiService.postTripDay(newDay, this.trip()!.id).subscribe((createdDay) => {
          this.trip.update((t) => {
            if (!t) return null;
            const days = [...t.days, createdDay].sort((a, b) => (a.dt || '').localeCompare(b.dt || ''));
            return { ...t, days };
          });
        });
      }
    });
  }

  /**
   * True when this day is "in the middle of" an accommodation stay
   * (i.e. between check-in and check-out, exclusive). Used to show the
   * inline "Day starts at HH:MM" pill on base-camp days only.
   */
  dayHasActiveStay(day: TripDay): boolean {
    const trip = this.trip();
    if (!trip?.days?.length) return false;
    const dayIndex = trip.days.findIndex((d) => d.id === day.id);
    if (dayIndex < 0) return false;
    for (const candidateDay of trip.days) {
      for (const stay of candidateDay.items) {
        if (!this.isAccommodationStay(stay)) continue;
        const arrivalIndex = trip.days.findIndex((d) => d.id === stay.day_id);
        const checkoutIndex = trip.days.findIndex((d) => d.id === stay.stay_checkout_day_id);
        if (arrivalIndex < 0 || checkoutIndex < 0) continue;
        if (dayIndex > arrivalIndex && dayIndex < checkoutIndex) return true;
      }
    }
    return false;
  }

  dayStartTimeDisplay(day: TripDay): string {
    return day.day_start_time || '09:00';
  }

  /**
   * Persist a new day_start_time. Empty string clears it (back to default).
   * Sends a full TripDay payload because the backend's PUT requires `label`.
   */
  setDayStartTime(day: TripDay, value: string | null) {
    const cleaned = (value ?? '').trim();
    if (cleaned && !/^([01]\d|2[0-3]):[0-5]\d$/.test(cleaned)) return;
    const newValue = cleaned || null;
    if ((day.day_start_time ?? null) === newValue) return;
    const tripId = this.trip()?.id;
    if (tripId == null) return;

    const payload: Partial<TripDay> = {
      id: day.id,
      label: day.label,
      dt: day.dt,
      notes: day.notes,
      day_start_time: newValue ?? undefined,
    };
    this.apiService.putTripDay(payload, tripId).subscribe((updated) => {
      this.trip.update((t) => {
        if (!t) return null;
        const days = t.days.map((d) => (d.id === updated.id ? { ...d, ...updated } : d));
        return { ...t, days };
      });
    });
  }

  editDay(day: TripDay) {
    const modal = this.dialogService.open(TripCreateDayModalComponent, {
      header: 'Edit Day',
      modal: true,
      appendTo: 'body',
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      data: { day, days: this.trip()!.days },
      breakpoints: {
        '640px': '80vw',
      },
    })!;

    modal.onClose.pipe(take(1)).subscribe((newDay: TripDay | null) => {
      if (!newDay) return;
      this.apiService.putTripDay(newDay, this.trip()!.id).subscribe((updated) => {
        this.trip.update((t) => {
          if (!t) return null;
          const days = t.days
            .map((d) => (d.id === updated.id ? { ...d, ...updated } : d))
            .sort((a, b) => (a.dt || '').localeCompare(b.dt || ''));
          return { ...t, days };
        });

        if (this.selectedDay()?.id === updated.id) this.selectedDay.set(updated);
      });
    });
  }

  deleteDay(day: TripDay) {
    const modal = this.dialogService.open(YesNoModalComponent, {
      header: 'Delete Day',
      modal: true,
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      breakpoints: {
        '640px': '90vw',
      },
      data: `Delete ${day.label} and associated plans?`,
    })!;

    modal.onClose.pipe(take(1)).subscribe((bool) => {
      if (!bool) return;
      this.apiService.deleteTripDay(this.trip()!.id, day.id).subscribe(() => {
        this.trip.update((t) => {
          if (!t) return null;
          return { ...t, days: t.days.filter((d) => d.id !== day.id) };
        });
        if (this.selectedDay()?.id === day.id) this.selectedDay.set(null);
      });
    });
  }

  addPlace(e?: any) {
    const opts = e ? { data: { place: e.latlng } } : {};
    const modal: DynamicDialogRef = this.dialogService.open(PlaceCreateModalComponent, {
      header: 'Create Place',
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
      ...opts,
    })!;

    modal.onClose.pipe(take(1)).subscribe({
      next: (place: Place | null) => {
        if (!place) return;

        this.apiService
          .postPlace(place)
          .pipe(
            switchMap((createdPlace: Place) =>
              this.apiService.putTrip(
                { place_ids: [createdPlace.id, ...this.places().map((p) => p.id)] },
                this.trip()!.id,
              ),
            ),
            take(1),
          )
          .subscribe({
            next: (trip) => this.trip.set(trip),
          });
      },
    });
  }

  editPlace(pEdit: Place) {
    const modal: DynamicDialogRef = this.dialogService.open(PlaceCreateModalComponent, {
      header: 'Edit Place',
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
        place: { ...pEdit, category: pEdit.category.id },
      },
    })!;

    modal.onClose.pipe(take(1)).subscribe({
      next: (updatedPlace: Place | null) => {
        if (!updatedPlace) return;

        this.apiService
          .putPlace(updatedPlace.id, updatedPlace)
          .pipe(take(1))
          .subscribe({
            next: (place: Place) => {
              this.trip.update((t) => {
                if (!t) return null;
                const places = t.places.map((p) => (p.id === place.id ? place : p));
                const days = t.days.map((d) => ({
                  ...d,
                  items: d.items.map((i) => (i.place?.id === place.id ? { ...i, place: place } : i)),
                }));

                return { ...t, places, days };
              });
              if (this.selectedPlace()?.id === place.id) this.selectedPlace.set(place);
              const selItem = this.selectedItem();
              if (selItem?.place?.id === place.id)
                this.selectedItem.update((curr) => (curr ? { ...curr, place } : null));
            },
          });
      },
    });
  }

  manageTripPlaces() {
    const modal: DynamicDialogRef = this.dialogService.open(TripPlaceSelectModalComponent, {
      header: 'Attached Places',
      modal: true,
      appendTo: 'body',
      closable: true,
      width: '50vw',
      data: {
        places: this.places(),
        usedPlaces: this.usedPlaceIds(),
      },
      breakpoints: {
        '640px': '90vw',
      },
    })!;

    modal.onClose.pipe(take(1)).subscribe({
      next: (places: Place[] | null) => {
        if (!places) return;

        this.apiService
          .putTrip({ place_ids: places.map((p) => p.id) }, this.trip()!.id)
          .pipe(take(1))
          .subscribe({
            next: (trip) => {
              this.trip.set(trip);
              if (this.selectedPlace() && !trip.places.some((p) => p.id == this.selectedPlace()!.id))
                this.selectedPlace.set(null);
            },
          });
      },
    });
  }

  editTrip() {
    const modal: DynamicDialogRef = this.dialogService.open(TripCreateModalComponent, {
      header: 'Update Trip',
      modal: true,
      appendTo: 'body',
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      width: '50vw',
      breakpoints: {
        '640px': '90vw',
      },
      data: { trip: this.trip() },
    })!;

    modal.onClose.pipe(take(1)).subscribe({
      next: (new_trip: Trip | null) => {
        if (!new_trip) return;
        this.apiService
          .putTrip(new_trip, this.trip()!.id)
          .pipe(take(1))
          .subscribe((trip) => this.trip.set(trip));
      },
    });
  }

  deleteTrip() {
    const modal = this.dialogService.open(YesNoModalComponent, {
      header: 'Delete Trip',
      modal: true,
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      breakpoints: {
        '640px': '90vw',
      },
      data: `Delete ${this.trip()!.name}?`,
    })!;

    modal.onClose.pipe(take(1)).subscribe({
      next: (bool) => {
        if (bool)
          this.apiService
            .deleteTrip(this.trip()!.id)
            .pipe(take(1))
            .subscribe({
              next: () => this.router.navigate(['/trips']),
            });
      },
    });
  }

  openPackingList() {
    this.apiService.getPackingList(this.trip()!.id).subscribe((items) => {
      this.packingList.set(items);
      this.isPackingDialogVisible = !this.isPackingDialogVisible;
      this.computeMenuTripPackingItems();
    });
  }

  computeMenuTripPackingItems() {
    this.menuTripPackingItems = [
      {
        label: 'Actions',
        items: [
          {
            label: 'Copy to clipboard (text)',
            icon: 'pi pi-clipboard',
            command: () => this.copyPackingListToClipboard(),
          },
          {
            label: 'Quick Copy',
            icon: 'pi pi-copy',
            command: () => this.copyPackingListToService(),
          },
          {
            label: `Quick Paste (${this.utilsService.packingListToCopy.length})`,
            icon: 'pi pi-copy',
            command: () => this.pastePackingList(),
            disabled: this.trip()?.archived || !this.utilsService.packingListToCopy.length,
          },
        ],
      },
    ];
  }

  addPackingItem() {
    const modal: DynamicDialogRef = this.dialogService.open(TripCreatePackingModalComponent, {
      header: 'Add Packing',
      modal: true,
      appendTo: 'body',
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      breakpoints: {
        '640px': '90vw',
      },
    })!;

    modal.onClose.pipe(take(1)).subscribe({
      next: (item: PackingItem | null) => {
        if (!item) return;

        this.apiService
          .postPackingItem(this.trip()!.id, item)
          .pipe(take(1))
          .subscribe({
            next: (item) => this.packingList.update((l) => [...l, item]),
          });
      },
    });
  }

  onCheckPackingItem(e: CheckboxChangeEvent, id: number) {
    this.apiService
      .putPackingItem(this.trip()!.id, id, { packed: e.checked })
      .pipe(take(1))
      .subscribe({
        next: (updated) => this.packingList.update((l) => l.map((i) => (i.id === id ? updated : i))),
      });
  }

  deletePackingItem(item: PackingItem) {
    const modal = this.dialogService.open(YesNoModalComponent, {
      header: 'Delete Item',
      modal: true,
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      breakpoints: {
        '640px': '90vw',
      },
      data: `Delete ${item.text.substring(0, 50)}?`,
    })!;

    modal.onClose.pipe(take(1)).subscribe({
      next: (bool) => {
        if (!bool) return;
        this.apiService
          .deletePackingItem(this.trip()!.id, item.id)
          .pipe(take(1))
          .subscribe({
            next: () => this.packingList.update((l) => l.filter((i) => i.id !== item.id)),
          });
      },
    });
  }

  copyPackingListToClipboard() {
    const content = this.packingList()
      .sort((a, b) =>
        a.category !== b.category
          ? a.category.localeCompare(b.category)
          : a.text < b.text
            ? -1
            : a.text > b.text
              ? 1
              : 0,
      )
      .map((item) => `[${item.category}] ${item.qt ? item.qt + ' ' : ''}${item.text}`)
      .join('\n');
    const success = this.clipboard.copy(content);
    if (success) this.utilsService.toast('success', 'Success', `Content copied to clipboard`);
    else this.utilsService.toast('error', 'Error', 'Content could not be copied to clipboard');
  }

  copyPackingListToService() {
    const content: Partial<PackingItem>[] = this.packingList().map((item) => ({
      qt: item.qt,
      text: item.text,
      category: item.category,
    }));
    this.utilsService.packingListToCopy = content;
    this.utilsService.toast(
      'success',
      'Ready to Paste',
      `${content.length} item${content.length > 1 ? 's' : ''}  copied. Go to another Trip and use Quick Paste`,
    );
  }

  pastePackingList() {
    const content: Partial<PackingItem>[] = this.utilsService.packingListToCopy;
    const modal = this.dialogService.open(YesNoModalComponent, {
      header: 'Confirm Paste',
      modal: true,
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      breakpoints: {
        '640px': '90vw',
      },
      data: `Paste ${content.length} items?`,
    })!;

    modal.onClose.pipe(take(1)).subscribe({
      next: (bool) => {
        if (!bool) return;

        const obs$ = content.map((packingItem) =>
          this.apiService.postPackingItem(this.trip()!.id, packingItem as PackingItem),
        );

        forkJoin(obs$)
          .pipe(take(1))
          .subscribe({
            next: (newItems: PackingItem[]) => {
              this.packingList.update((l) => [...l, ...newItems]);
              this.utilsService.packingListToCopy = [];
              this.utilsService.toast('success', 'Success', 'Items pasted');
            },
          });
      },
    });
  }

  openChecklist() {
    this.apiService.getChecklist(this.trip()!.id).subscribe((items) => {
      this.checklistItems.set(items);
      this.isChecklistDialogVisible = !this.isChecklistDialogVisible;
    });
  }

  addChecklistItem() {
    const modal: DynamicDialogRef = this.dialogService.open(TripCreateChecklistModalComponent, {
      header: 'Add Checklist',
      modal: true,
      appendTo: 'body',
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      breakpoints: {
        '640px': '90vw',
      },
    })!;

    modal.onClose.pipe(take(1)).subscribe({
      next: (item: ChecklistItem | null) => {
        if (!item) return;

        this.apiService
          .postChecklistItem(this.trip()!.id, item)
          .pipe(take(1))
          .subscribe({
            next: (created) => this.checklistItems.update((l) => [...l, created]),
          });
      },
    });
  }

  onCheckChecklistItem(e: CheckboxChangeEvent, id: number) {
    this.apiService
      .putChecklistItem(this.trip()!.id, id, { checked: e.checked })
      .pipe(take(1))
      .subscribe({
        next: (updated) => this.checklistItems.update((l) => l.map((i) => (i.id === id ? updated : i))),
      });
  }

  deleteChecklistItem(item: ChecklistItem) {
    const modal = this.dialogService.open(YesNoModalComponent, {
      header: 'Delete Item',
      modal: true,
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      breakpoints: {
        '640px': '90vw',
      },
      data: `Delete ${item.text.substring(0, 50)}?`,
    })!;

    modal.onClose.pipe(take(1)).subscribe({
      next: (bool) => {
        if (!bool) return;
        this.apiService
          .deleteChecklistItem(this.trip()!.id, item.id)
          .pipe(take(1))
          .subscribe({
            next: () => this.checklistItems.update((l) => l.filter((i) => i.id !== item.id)),
          });
      },
    });
  }

  openAttachmentsModal() {
    this.isAttachmentsDialogVisible = !this.isAttachmentsDialogVisible;
  }

  onFileUploadInputChange(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    const formdata = new FormData();
    formdata.append('file', input.files[0]);

    this.apiService
      .postTripAttachment(this.trip()!.id, formdata)
      .pipe(take(1))
      .subscribe({
        next: (attachment) =>
          this.trip.update((t) => ({ ...t!, attachments: [...(t!.attachments || []), attachment] })),
      });
  }

  downloadAttachment(attachment: TripAttachment) {
    this.apiService
      .downloadTripAttachment(this.trip()!.id, attachment.id)
      .pipe(take(1))
      .subscribe({
        next: (data) => {
          const blob = new Blob([data], { type: 'application/pdf' });
          const url = window.URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.download = attachment.filename;
          anchor.href = url;

          document.body.appendChild(anchor);
          anchor.click();

          document.body.removeChild(anchor);
          window.URL.revokeObjectURL(url);
        },
      });
  }

  deleteAttachment(attachmentId: number) {
    const modal = this.dialogService.open(YesNoModalComponent, {
      header: 'Delete Attachment',
      modal: true,
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      breakpoints: {
        '640px': '90vw',
      },
      data: 'Delete attachment? This cannot be undone.',
    })!;

    modal.onClose.pipe(take(1)).subscribe({
      next: (bool) => {
        if (!bool) return;

        this.apiService
          .deleteTripAttachment(this.trip()!.id, attachmentId)
          .pipe(take(1))
          .subscribe({
            next: () => {
              this.trip.update((t) => {
                const attachments = t!.attachments?.filter((a) => a.id !== attachmentId);
                const days = t!.days.map((day) => ({
                  ...day,
                  items: day.items.map((item) => ({
                    ...item,
                    attachments: item.attachments?.filter((a) => a.id !== attachmentId),
                  })),
                }));
                return { ...t, attachments, days } as Trip;
              });

              if (this.selectedItem()?.attachments)
                this.selectedItem.update((curr) =>
                  curr ? { ...curr, attachments: curr.attachments?.filter((a) => a.id !== attachmentId) ?? [] } : null,
                );
            },
          });
      },
    });
  }

  openUnarchiveTripModal() {
    const modal = this.dialogService.open(YesNoModalComponent, {
      header: 'Restore Trip',
      modal: true,
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      breakpoints: {
        '640px': '90vw',
      },
      data: `Restore ${this.trip()!.name}?`,
    })!;

    modal.onClose.pipe(take(1)).subscribe({
      next: (bool) => {
        if (!bool) return;
        this.apiService
          .putTrip({ archived: false }, this.trip()!.id!)
          .pipe(take(1))
          .subscribe({
            next: (trip) => this.trip.set(trip),
          });
      },
    });
  }

  openArchiveTripModal() {
    const modal = this.dialogService.open(TripArchiveModalComponent, {
      header: `Archive ${this.trip()!.name}`,
      modal: true,
      closable: true,
      appendTo: 'body',
      dismissableMask: true,
      draggable: false,
      resizable: false,
      breakpoints: {
        '640px': '90vw',
      },
      data: this.trip(),
    })!;

    modal.onClose.pipe(take(1)).subscribe({
      next: (review: string) => {
        if (review === undefined) return;
        this.apiService
          .putTrip({ archived: true, archival_review: review }, this.trip()!.id!)
          .pipe(take(1))
          .subscribe({
            next: (trip) => this.trip.set(trip),
          });
      },
    });
  }

  downloadItemGPX() {
    const item = this.selectedItem();
    const placeItems = this.selectedPlaceItems();
    const gpx = this.selectedItem()?.gpx || this.selectedPlaceItems()[this.selectedPlaceActiveTabIndex()]?.gpx;
    if (!gpx) return;

    const itemName = item?.text || placeItems[this.selectedPlaceActiveTabIndex()]?.text || 'item';
    const dataBlob = new Blob([gpx]);
    const downloadURL = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = downloadURL;
    link.download = `TRIP_${this.trip()!.name}_${itemName}.gpx`;
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadURL);
  }

  itemToNavigation() {
    const item = this.selectedItem();
    const placeItems = this.selectedPlaceItems();
    const target = item || placeItems[this.selectedPlaceActiveTabIndex()];
    if (!target?.lat || !target?.lng) return;

    openNavigation([{ lat: target.lat, lng: target.lng }]);
  }

  tripDayToNavigation(dayId: number) {
    const idx = this.trip()?.days.findIndex((d) => d.id === dayId);
    if (!this.trip() || idx === undefined || idx == -1) return;
    const coordinates = this.tripDayRouteCoordinates(this.trip()!.days[idx]);
    if (!coordinates.length) return;
    openNavigation(coordinates);
  }

  tripToNavigation() {
    const coordinates = this.tripViewModel()
      .flatMap((d) => d.items)
      .map((item) => this.tripItemCoordinate(item))
      .filter((coordinate): coordinate is L.LatLngLiteral => coordinate !== null);
    const home = this.tripHomeCoordinate();
    if (home) {
      coordinates.unshift(home);
      coordinates.push(home);
    }
    const route = this.dedupeCoordinates(coordinates);
    if (!route.length) return;
    openNavigation(route);
  }

  getSharedTripDetails() {
    this.apiService.getSharedTripDetails(this.trip()!.id).pipe(take(1)).subscribe();
  }

  shareTrip(is_full_access = true) {
    this.apiService
      .createSharedTrip(this.trip()!.id, is_full_access)
      .pipe(take(1))
      .subscribe({
        next: (resp) => {
          this.trip.update((t) => (t ? { ...t, shared: true } : null));
          this.tripSharedDetails$ = of(resp);
        },
      });
  }

  unshareTrip() {
    const modal = this.dialogService.open(YesNoModalComponent, {
      header: 'Disable Share',
      modal: true,
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      breakpoints: {
        '640px': '90vw',
      },
      data: `Stop sharing ${this.trip()!.name}?`,
    })!;

    modal.onClose.pipe(take(1)).subscribe({
      next: (bool) => {
        if (!bool) return;
        this.apiService
          .deleteSharedTrip(this.trip()!.id)
          .pipe(take(1))
          .subscribe({
            next: () => {
              this.trip.update((t) => (t ? { ...t, shared: false } : null));
              this.isShareDialogVisible = !this.isShareDialogVisible;
            },
          });
      },
    });
  }

  openMembersDialog() {
    this.apiService
      .getTripMembers(this.trip()!.id)
      .pipe(take(1))
      .subscribe({
        next: (members) => {
          this.tripMembers.set(members);

          if (members.length > 1) {
            this.apiService.getTripBalance(this.trip()!.id).subscribe({
              next: (balances) =>
                this.tripMembers.update((current) => current.map((m) => ({ ...m, balance: balances[m.user] ?? {} }))),
            });
          }
          this.isMembersDialogVisible = !this.isMembersDialogVisible;
        },
      });
  }

  addMember() {
    const modal: DynamicDialogRef = this.dialogService.open(TripInviteMemberModalComponent, {
      header: 'Invite member',
      modal: true,
      appendTo: 'body',
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      breakpoints: {
        '640px': '90vw',
      },
    })!;

    modal.onClose.pipe(take(1)).subscribe({
      next: (user: string | null) => {
        if (!user) return;

        this.apiService
          .inviteTripMember(this.trip()!.id, user)
          .pipe(take(1))
          .subscribe({
            next: (member) => this.tripMembers.update((list) => [...list, member]),
          });
      },
    });
  }

  deleteMember(username: string) {
    const modal = this.dialogService.open(YesNoModalComponent, {
      header: 'Remove Member',
      modal: true,
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      breakpoints: {
        '640px': '90vw',
      },
      data: `Delete ${username.substring(0, 50)} from Trip ?`,
    })!;

    modal.onClose.pipe(take(1)).subscribe({
      next: (bool) => {
        if (!bool) return;
        this.apiService
          .deleteTripMember(this.trip()!.id, username)
          .pipe(take(1))
          .subscribe({
            next: () => {
              this.tripMembers.update((list) => list.filter((m) => m.user !== username));

              this.trip.update((t) => {
                if (!t) return null;
                const days = t.days.map((d) => ({
                  ...d,
                  items: d.items.map((i) => (i.paid_by === username ? { ...i, paid_by: undefined } : i)),
                }));
                return { ...t, days };
              });
            },
          });
      },
    });
  }

  openTripNotesModal() {
    const modal = this.dialogService.open(TripNotesModalComponent, {
      header: 'Notes',
      modal: true,
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      width: '30vw',
      breakpoints: {
        '640px': '90vw',
      },
      data: this.trip(),
    })!;

    modal.onClose.pipe(take(1)).subscribe({
      next: (notes: string) => {
        if (notes === undefined) return;
        this.apiService
          .putTrip({ notes }, this.trip()!.id)
          .pipe(take(1))
          .subscribe({
            next: (trip) => this.trip.set(trip),
          });
      },
    });
  }

  bulkDeleteItems() {
    const items = this.selectedItems();
    if (!items.length) return;

    const modal = this.dialogService.open(YesNoModalComponent, {
      header: 'Delete Plans',
      modal: true,
      appendTo: 'body',
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      data: `Delete ${items.length} plan${items.length > 1 ? 's' : ''}? This cannot be undone.`,
    })!;

    modal.onClose.pipe(take(1)).subscribe((bool) => {
      if (!bool) return;

      const obs$ = items.map((item) => this.apiService.deleteTripDayItem(this.trip()!.id, item.day_id, item.id));
      forkJoin(obs$)
        .pipe(take(1))
        .subscribe({
          next: () => {
            const idsToDelete = new Set(items.map((i) => i.id));
            this.trip.update((current) => {
              if (!current) return null;
              const days = current.days.map((day) => ({
                ...day,
                items: day.items.filter((item) => !idsToDelete.has(item.id)),
              }));
              return { ...current, days };
            });
            this.toggleMultiSelectMode();
          },
        });
    });
  }

  bulkDuplicateItems() {
    const items = this.selectedItems();
    if (!items.length) return;

    const modal = this.dialogService.open(YesNoModalComponent, {
      header: 'Duplicate Plans',
      modal: true,
      appendTo: 'body',
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      data: `Duplicate ${items.length} plan${items.length > 1 ? 's' : ''}?`,
    })!;

    modal.onClose.pipe(take(1)).subscribe((bool) => {
      if (!bool) return;
      const obs$ = items.map((item) => {
        const data: any = {
          ...item,
          status: item.status ? item.status.label : null,
          attachments: item.attachments ? item.attachments.map((a) => a.id) : [],
          place: item.place ? item.place.id : null,
        };
        return this.apiService.postTripDayItem(data, this.trip()!.id, item.day_id);
      });

      forkJoin(obs$)
        .pipe(take(1))
        .subscribe({
          next: (items: TripItem[]) => {
            this.trip.update((currentTrip) => {
              if (!currentTrip) return null;

              const newItemsByDay = items.reduce(
                (acc, item) => {
                  (acc[item.day_id] ??= []).push(item);
                  return acc;
                },
                {} as Record<number, TripItem[]>,
              );

              const updatedDays = currentTrip.days.map((day) =>
                newItemsByDay[day.id] ? { ...day, items: [...day.items, ...newItemsByDay[day.id]] } : day,
              );

              return { ...currentTrip, days: updatedDays };
            });
            this.toggleMultiSelectMode();
          },
        });
    });
  }

  bulkEditItems() {
    const items = this.selectedItems();
    if (!items.length) return;

    const modal = this.dialogService.open(TripBulkEditModalComponent, {
      header: `Edit ${items.length} Plan${items.length > 1 ? 's' : ''}`,
      modal: true,
      appendTo: 'body',
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      data: {
        trip: this.trip(),
        members: this.tripMembers(),
        statuses: this.utilsService.statuses,
      },
    })!;

    modal.onClose.pipe(take(1)).subscribe((editData) => {
      if (!editData) return;
      const obs$ = items.map((item) =>
        this.apiService.putTripDayItem({ ...editData }, this.trip()!.id, item.day_id, item.id),
      );
      forkJoin(obs$)
        .pipe(take(1))
        .subscribe({
          next: (updatedItems: TripItem[]) => {
            this.trip.update((currentTrip) => {
              if (!currentTrip) return null;
              const itemsById = Object.fromEntries(updatedItems.map((item) => [item.id, item]));
              const updatedDays = currentTrip.days.map((day) => ({
                ...day,
                items: [
                  ...day.items.filter((item) => !itemsById[item.id]),
                  ...updatedItems.filter((item) => item.day_id === day.id),
                ],
              }));

              return { ...currentTrip, days: updatedDays };
            });
            this.toggleMultiSelectMode();
            this.utilsService.toast('success', 'Success', `${updatedItems.length} items updated`);
          },
          error: (err) => {
            this.utilsService.toast('error', 'Error', 'Bulk edition failed, check console for details');
            console.error('Bulk edit failed:', err);
          },
        });
    });
  }

  canRetimeDay(day: TripDay): boolean {
    const routeItems = this.sortedRouteableDayItems(day);
    return routeItems.length >= 2 && this.parseTimeMinutes(routeItems[0].time) !== null;
  }

  routeableDayItems(day: TripDay): ViewTripItem[] {
    const trip = this.trip();
    if (!trip) return day.items as ViewTripItem[];

    const dayIndexById = new Map(trip.days.map((tripDay, index) => [tripDay.id, index]));
    const dayIndex = dayIndexById.get(day.id) ?? 0;
    const stayItems = trip.days.flatMap((candidateDay) =>
      candidateDay.items.filter((item) => this.isAccommodationStay(item)),
    );
    const virtualCheckoutItems = this.virtualStayItemsForDay(day, dayIndex, stayItems, dayIndexById).filter(
      (item) => item.isVirtualCheckout,
    );
    return [...(day.items as ViewTripItem[]), ...virtualCheckoutItems];
  }

  sortedRouteableDayItems(day: TripDay): ViewTripItem[] {
    return this.routeableDayItems(day)
      .slice()
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''))
      .filter((item) => this.tripItemCoordinate(item) !== null);
  }

  getRouteEstimate(from: L.LatLngLiteral, to: L.LatLngLiteral): Observable<{ distance: number; duration: number }> {
    const key = this.routeEstimateKey(from, to);
    const existing = this.routeEstimates().get(key);
    if (existing) return of(existing);

    const start: [number, number] = [from.lat, from.lng];
    const end: [number, number] = [to.lat, to.lng];
    const profile = this.routeManager.getProfile(start, end);

    return this.apiService
      .completionRouting({
        coordinates: [from, to],
        profile,
      })
      .pipe(
        map((resp) => ({ distance: resp.distance ?? 0, duration: resp.duration ?? 0 })),
        tap((estimate) => {
          this.routeEstimates.update((estimates) => {
            const updated = new Map(estimates);
            updated.set(key, estimate);
            return updated;
          });
        }),
      );
  }

  buildRetimingChanges(
    routeItems: ViewTripItem[],
    estimates: { distance: number; duration: number }[],
  ): TripRetimingChange[] {
    let cursor = this.parseTimeMinutes(routeItems[0].time);
    if (cursor === null) return [];

    const changes: TripRetimingChange[] = [];
    for (let index = 1; index < routeItems.length; index++) {
      const previous = routeItems[index - 1];
      const current = routeItems[index];
      const estimate = estimates[index - 1];
      const travelMinutes = Math.ceil((estimate?.duration ?? 0) / 60);
      const stopDuration =
        previous.isVirtualCheckout || this.isAccommodationPlace(previous.place) ? 0 : (previous.place?.duration ?? 0);
      cursor += stopDuration + travelMinutes;

      let newTime = this.formatTimeMinutes(cursor);
      if (current.isVirtualCheckout || current.isVirtualStay) {
        const fixedTime = this.parseTimeMinutes(current.time);
        if (fixedTime != null) cursor = fixedTime;
        continue;
      }

      if (this.isAccommodationPlace(current.place)) {
        const checkinMinutes = this.parseTimeMinutes(current.place?.checkin_time || current.time);
        if (checkinMinutes != null && cursor < checkinMinutes) {
          cursor = checkinMinutes;
          newTime = this.formatTimeMinutes(checkinMinutes);
        }
      }

      if (current.time === newTime) continue;

      changes.push({
        item: this.normalizeItem(current),
        oldTime: current.time ?? '',
        newTime,
        travelDuration: this.formatDurationMinutes(travelMinutes),
        distance: estimate?.distance ? Math.round((estimate.distance / 1000) * 10) / 10 : undefined,
      });
    }

    return changes;
  }

  retimeDay(day: TripDay) {
    const routeItems = this.sortedRouteableDayItems(day);
    if (routeItems.length < 2) {
      this.utilsService.toast('warn', 'Not enough stops', 'Add at least two stops with coordinates');
      return;
    }

    if (this.parseTimeMinutes(routeItems[0].time) === null) {
      this.utilsService.toast('warn', 'Missing start time', 'The first stop needs a valid time');
      return;
    }

    const routeRequests = [];
    for (let index = 0; index < routeItems.length - 1; index++) {
      const from = this.tripItemCoordinate(routeItems[index]);
      const to = this.tripItemCoordinate(routeItems[index + 1]);
      if (!from || !to) continue;
      routeRequests.push(this.getRouteEstimate(from, to));
    }

    if (!routeRequests.length) return;

    this.utilsService.setLoading(`Calculating schedule (0/${routeRequests.length})...`);
    forkJoin(routeRequests)
      .pipe(take(1))
      .subscribe({
        next: (estimates) => {
          this.utilsService.setLoading('');
          const changes = this.buildRetimingChanges(routeItems, estimates);
          if (!changes.length) {
            this.utilsService.toast('info', 'Already aligned', 'Times already match the current route order');
            return;
          }
          this.openRetimingPreview(day, changes);
        },
        error: (err) => {
          this.utilsService.setLoading('');
          this.utilsService.toast('error', 'Routing error', 'Could not calculate schedule');
          console.error('Retiming failed:', err);
        },
      });
  }

  openRetimingPreview(day: TripDay, changes: TripRetimingChange[]) {
    const modal = this.dialogService.open(TripRetimingPreviewModalComponent, {
      header: 'Recalculate Times',
      modal: true,
      appendTo: 'body',
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      width: '34vw',
      breakpoints: {
        '960px': '70vw',
        '640px': '90vw',
      },
      data: { changes },
    })!;

    modal.onClose.pipe(take(1)).subscribe((confirmed: boolean) => {
      if (!confirmed) return;
      this.applyRetimingChanges(day, changes);
    });
  }

  applyRetimingChanges(day: TripDay, changes: TripRetimingChange[]) {
    if (!changes.length) return;
    this.utilsService.setLoading('Updating times...');

    const updates = changes.map((change) =>
      this.apiService.putTripDayItem({ time: change.newTime }, this.trip()!.id, day.id, change.item.id),
    );

    forkJoin(updates)
      .pipe(take(1))
      .subscribe({
        next: (updatedItems) => {
          const updatedById = new Map(updatedItems.map((item) => [item.id, item]));
          this.trip.update((current) => {
            if (!current) return null;
            const days = current.days.map((currentDay) => {
              if (currentDay.id !== day.id) return currentDay;
              return {
                ...currentDay,
                items: currentDay.items.map((item) => updatedById.get(item.id) ?? item),
              };
            });
            return { ...current, days };
          });

          const selected = this.selectedItem();
          if (selected && updatedById.has(selected.id))
            this.selectedItem.set(this.normalizeItem(updatedById.get(selected.id)!));
          this.utilsService.setLoading('');
          this.utilsService.toast(
            'success',
            'Times updated',
            `${updatedItems.length} stop${updatedItems.length > 1 ? 's' : ''} updated`,
          );
        },
        error: (err) => {
          this.utilsService.setLoading('');
          this.utilsService.toast('error', 'Update failed', 'Could not update plan times');
          console.error('Retiming update failed:', err);
        },
      });
  }

  dayRouting(day: TripDay) {
    const coords = this.tripDayRouteCoordinates(day).map(
      (coordinate) => [coordinate.lat, coordinate.lng] as [number, number],
    );
    const markers: any[] = [];

    day.items.forEach((item) => {
      const lat = item.lat || item.place?.lat;
      const lng = item.lng || item.place?.lng;
      if (lat == null || lng == null) return;
      if (!item.place) markers.push(item);
    });

    if (coords.length < 2) {
      this.utilsService.toast('warn', 'Not enough values', 'Not enough values to route');
      return;
    }

    this.utilsService.setLoading(`Calculating routes (0/${coords.length - 1})...`);
    const routeSegments: Array<{ start: [number, number]; end: [number, number] }> = [];
    for (let i = 0; i < coords.length - 1; i++) {
      routeSegments.push({
        start: coords[i],
        end: coords[i + 1],
      });
    }

    const layerGroup = L.featureGroup();
    markers.forEach((item) => {
      const marker = tripDayMarker(item);
      marker.on('click', () => {
        if (this.selectedItem()?.id === item.id) {
          this.selectedItem.set(null);
          this.selectedPlace.set(null);
          this.selectedDay.set(null);
          return;
        }
        this.selectedItem.set(this.normalizeItem(item));
        this.selectedPlace.set(null);
        this.selectedDay.set(null);
      });
      layerGroup.addLayer(marker);
    });

    this.tripMapAntLayer = layerGroup;
    requestAnimationFrame(() => {
      if (!this.tripMapAntLayer || !this.map) return;
      this.tripMapAntLayer.addTo(this.map);
    });

    let completedRoutes = 0;
    routeSegments.forEach((segment, index) => {
      const profile = this.routeManager.getProfile(segment.start, segment.end);
      this.apiService
        .completionRouting({
          coordinates: [
            { lat: segment.start[0], lng: segment.start[1] },
            { lat: segment.end[0], lng: segment.end[1] },
          ],
          profile,
        })
        .subscribe({
          next: (resp) => {
            completedRoutes++;
            this.utilsService.setLoading(
              completedRoutes === routeSegments.length
                ? ''
                : `Calculating routes (${completedRoutes}/${routeSegments.length})...`,
            );
            this.routeEstimates.update((estimates) => {
              const updated = new Map(estimates);
              updated.set(
                this.routeEstimateKey(
                  { lat: segment.start[0], lng: segment.start[1] },
                  { lat: segment.end[0], lng: segment.end[1] },
                ),
                { distance: resp.distance ?? 0, duration: resp.duration ?? 0 },
              );
              return updated;
            });

            const layer = this.routeManager.addRoute({
              id: this.routeManager.createRouteId(segment.start, segment.end, profile),
              coordinates: resp.coordinates,
              distance: resp.distance ?? 0,
              duration: resp.duration ?? 0,
              profile,
            });

            const currentMap = this.map;
            if (currentMap) layer.addTo(currentMap);
          },
          error: (err) => {
            completedRoutes++;
            if (completedRoutes === routeSegments.length) this.utilsService.setLoading('');
            this.utilsService.toast('error', 'Routing error', 'Route computation failed');
            console.error(`Routing error for segment ${index + 1}:`, err);
          },
        });
    });
  }

  flyTo(latlng?: [number, number]) {
    const selected = this.selectedItem() || this.selectedPlace();
    if (!this.map || (!latlng && (!selected || !selected.lat || !selected.lng))) return;

    const lat: number = latlng ? latlng[0] : selected!.lat!;
    const lng: number = latlng ? latlng[1] : selected!.lng!;
    this.map.flyTo([lat, lng], this.map.getZoom() || 9, { duration: 2 });
  }

  tripHomeCoordinate(): L.LatLngLiteral | null {
    const trip = this.trip();
    if (trip?.home_lat == null || trip.home_lng == null) return null;
    return { lat: trip.home_lat, lng: trip.home_lng };
  }

  tripHomePlaceOption(): Place | null {
    const trip = this.trip();
    if (trip?.home_lat == null || trip.home_lng == null) return null;
    return {
      id: HOME_PLACE_ID,
      name: trip.home_name || 'Home',
      place: trip.home_name || 'Home',
      lat: trip.home_lat,
      lng: trip.home_lng,
      image: '/favicon.png',
      category: {
        id: HOME_PLACE_ID,
        name: 'Home',
        image_id: HOME_PLACE_ID,
        image: '/favicon.png',
        color: '#111827',
        icon: '',
      },
    };
  }

  isHomeCoordinate(lat?: number | null, lng?: number | null): boolean {
    const home = this.tripHomeCoordinate();
    if (!home || lat == null || lng == null) return false;
    return Math.abs(home.lat - lat) < 0.000001 && Math.abs(home.lng - lng) < 0.000001;
  }

  isHomeItem(item: Partial<TripItem>): boolean {
    return !item.place && this.isHomeCoordinate(item.lat, item.lng);
  }

  tripItemCoordinate(item: TripItem): L.LatLngLiteral | null {
    if ((item as ViewTripItem).isVirtualStay) return null;
    const lat = item.lat ?? item.place?.lat;
    const lng = item.lng ?? item.place?.lng;
    if (lat == null || lng == null) return null;
    return { lat, lng };
  }

  routeEstimateKey(from: L.LatLngLiteral, to: L.LatLngLiteral): string {
    return `${from.lat.toFixed(6)},${from.lng.toFixed(6)}>${to.lat.toFixed(6)},${to.lng.toFixed(6)}`;
  }

  parseTimeMinutes(value?: string | null): number | null {
    if (!value) return null;
    const match = value.match(/^([01]\d|2[0-3])(?::([0-5]\d))?$/);
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2] ?? 0);
  }

  formatTimeMinutes(value: number): string {
    const minutesInDay = 24 * 60;
    const normalized = ((value % minutesInDay) + minutesInDay) % minutesInDay;
    const hours = Math.floor(normalized / 60)
      .toString()
      .padStart(2, '0');
    const minutes = (normalized % 60).toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  formatDurationMinutes(minutes: number): string {
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const remaining = minutes % 60;
      return remaining > 0 ? `${hours}h ${remaining}m` : `${hours}h`;
    }
    return `${minutes}m`;
  }

  estimateTravelMinutes(distanceKm: number): number {
    if (distanceKm <= 0.05) return 0;
    const profile = distanceKm > 5 ? 'car' : 'foot';
    return Math.max(1, Math.ceil((distanceKm / ROUTE_ESTIMATE_SPEEDS_KMH[profile]) * 60));
  }

  tripDayRouteCoordinates(day: TripDay): L.LatLngLiteral[] {
    const trip = this.trip();
    const coordinates = this.routeableDayItems(day)
      .slice()
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''))
      .map((item) => this.tripItemCoordinate(item))
      .filter((coordinate): coordinate is L.LatLngLiteral => coordinate !== null);

    const home = this.tripHomeCoordinate();
    if (trip && home) {
      const dayIndex = trip.days.findIndex((d) => d.id === day.id);
      if (dayIndex === 0) coordinates.unshift(home);
      if (dayIndex === trip.days.length - 1) coordinates.push(home);
    }

    return this.dedupeCoordinates(coordinates);
  }

  dedupeCoordinates(coordinates: L.LatLngLiteral[]): L.LatLngLiteral[] {
    return coordinates.filter((coordinate, index) => {
      const previous = coordinates[index - 1];
      if (!previous) return true;
      return previous.lat !== coordinate.lat || previous.lng !== coordinate.lng;
    });
  }

  markerRightClickFn(to: Place) {
    if (this.selectedItem() || this.selectedPlace()) return this.markerToMarkerRouting(to);
    return this.addItem(undefined, to.id);
  }

  markerToMarkerRouting(to: Place) {
    const from = this.selectedItem() || this.selectedPlace();
    if (!from || !from.lat || !from.lng) return;

    const profile = this.routeManager.getProfile([from.lat, from.lng], [to.lat, to.lng]);
    this.utilsService.setLoading('Calculating route...');
    this.apiService
      .completionRouting({
        coordinates: [
          { lng: from.lng, lat: from.lat },
          { lng: to.lng, lat: to.lat },
        ],
        profile,
      })
      .subscribe({
        next: (resp) => {
          this.utilsService.setLoading('');
          const layer = this.routeManager.addRoute({
            id: this.routeManager.createRouteId([from.lat!, from.lng!], [to.lat, to.lng], profile),
            coordinates: resp.coordinates,
            distance: resp.distance ?? 0,
            duration: resp.duration ?? 0,
            profile,
          });
          const currentMap = this.map;
          if (currentMap) layer.addTo(currentMap);
        },
        error: (err) => {
          this.utilsService.setLoading('');
          console.error('Routing error:', err);
        },
      });
  }
}
