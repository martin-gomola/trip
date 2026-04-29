import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { MenuModule } from 'primeng/menu';
import { Place } from '../../types/poi';
import { MenuItem } from 'primeng/api';
import { UtilsService } from '../../services/utils.service';
import { Observable } from 'rxjs';
import { AsyncPipe } from '@angular/common';
import { LinkifyPipe } from '../pipes/linkify.pipe';
import { TooltipModule } from 'primeng/tooltip';
import { ClipboardModule } from '@angular/cdk/clipboard';
import { NaturalDurationPipe } from '../pipes/naturalduration.pipe';
import { googleMapsNavigationUrl, openGoogleMapsNavigation } from '../navigation';

@Component({
  selector: 'app-place-box-content',
  standalone: true,
  imports: [ButtonModule, MenuModule, AsyncPipe, LinkifyPipe, ClipboardModule, TooltipModule, NaturalDurationPipe],
  templateUrl: './place-box-content.component.html',
  styleUrls: ['./place-box-content.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlaceBoxContentComponent implements OnChanges {
  @Input() selectedPlace: Place | null = null;
  @Input() showButtons: boolean = true;
  @Input() showMeta: boolean = true;
  tooltipCopied = signal(false);
  externalUrl = signal<string | null>(null);

  @Output() editEmitter = new EventEmitter<void>();
  @Output() deleteEmitter = new EventEmitter<void>();
  @Output() visitEmitter = new EventEmitter<void>();
  @Output() favoriteEmitter = new EventEmitter<void>();
  @Output() gpxEmitter = new EventEmitter<void>();
  @Output() closeEmitter = new EventEmitter<void>();
  @Output() openNavigationEmitter = new EventEmitter<void>();
  @Output() flyToEmitter = new EventEmitter<void>();

  menuItems: MenuItem[] = [];
  secondaryMenuItems: MenuItem[] = [];
  readonly currency$: Observable<string>;

  constructor(private utilsService: UtilsService) {
    this.currency$ = this.utilsService.currency$;
    this.buildMenu();
  }

  ngOnChanges() {
    this.buildMenu();
  }

  buildMenu() {
    const externalUrl = this.resolveExternalUrl();
    this.externalUrl.set(externalUrl);

    if (!this.selectedPlace) {
      this.menuItems = [];
      this.secondaryMenuItems = [];
      return;
    }

    const items = [
      {
        label: 'Edit',
        icon: 'pi pi-pencil',
        iconClass: 'text-blue-500!',
        command: () => this.editPlace(),
      },
      {
        label: this.selectedPlace?.favorite ? 'Unfavorite' : 'Favorite',
        icon: this.selectedPlace?.favorite ? 'pi pi-heart-fill' : 'pi pi-heart',
        iconClass: 'text-rose-500!',
        command: () => this.favoritePlace(),
      },
      {
        label: this.selectedPlace?.visited ? 'Mark not visited' : 'Mark visited',
        icon: 'pi pi-check',
        iconClass: 'text-green-500!',
        command: () => this.visitPlace(),
      },
      {
        label: 'Fly To',
        icon: 'pi pi-expand',
        command: () => this.flyToPlace(),
      },
      {
        label: 'Navigation',
        icon: 'pi pi-car',
        command: () => this.openNavigationToPlace(),
      },
      {
        label: 'Delete',
        icon: 'pi pi-trash',
        iconClass: 'text-red-500!',
        command: () => this.deletePlace(),
      },
    ];

    if (externalUrl) {
      items.splice(4, 0, {
        label: 'Open source',
        icon: 'pi pi-external-link',
        command: () => this.openUrl(),
      });
    }

    if (this.selectedPlace?.gpx) {
      items.unshift({
        label: 'Display GPX',
        icon: 'pi pi-compass',
        iconClass: 'text-primary-500!',
        command: () => {
          this.displayGPX();
        },
      });
    }

    const secondaryItems = [
      {
        label: this.selectedPlace.visited ? 'Mark not visited' : 'Mark visited',
        icon: this.selectedPlace.visited ? 'pi pi-eye-slash' : 'pi pi-check',
        iconClass: 'text-green-500!',
        command: () => this.visitPlace(),
      },
      {
        label: 'Delete',
        icon: 'pi pi-trash',
        iconClass: 'text-red-500!',
        command: () => this.deletePlace(),
      },
    ];

    if (this.selectedPlace.gpx) {
      secondaryItems.unshift({
        label: 'Display GPX',
        icon: 'pi pi-compass',
        iconClass: 'text-primary-500!',
        command: () => {
          this.displayGPX();
        },
      });
    }

    this.menuItems = [
      {
        label: 'Place',
        items: items,
      },
    ];
    this.secondaryMenuItems = [
      {
        label: 'More',
        items: secondaryItems,
      },
    ];
  }

  visitPlace() {
    this.visitEmitter.emit();
    this.selectedPlace!.visited = !this.selectedPlace?.visited;
    this.buildMenu();
  }

  favoritePlace() {
    this.favoriteEmitter.emit();
    this.selectedPlace!.favorite = !this.selectedPlace?.favorite;
    this.buildMenu();
  }

  editPlace() {
    this.editEmitter.emit();
  }

  displayGPX() {
    this.gpxEmitter.emit();
  }

  deletePlace() {
    this.deleteEmitter.emit();
  }

  openNavigationToPlace() {
    const place = this.selectedPlace;
    if (!place || place.lat == null || place.lng == null) return;
    openGoogleMapsNavigation([{ lat: place.lat, lng: place.lng }]);
  }

  googleMapsUrl(): string {
    const place = this.selectedPlace;
    if (!place) return '';
    const namedQuery = [place.name, place.place].filter(Boolean).join(' ').trim();
    const query = namedQuery || `${place.lat},${place.lng}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }

  navigationUrl(): string {
    const place = this.selectedPlace;
    if (!place || place.lat == null || place.lng == null) return 'https://www.google.com/maps';
    return googleMapsNavigationUrl([{ lat: place.lat, lng: place.lng }]);
  }

  openUrl() {
    const url = this.externalUrl();
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  private resolveExternalUrl(): string | null {
    const explicitUrl = this.selectedPlace?.url?.trim();
    if (explicitUrl) return explicitUrl;

    const description = this.selectedPlace?.description || '';
    const match = description.match(/https?:\/\/[^\s<>"']+/);
    return match ? match[0].replace(/[),.;!?]+$/, '') : null;
  }

  flyToPlace() {
    this.flyToEmitter.emit();
  }

  isAccommodation() {
    return this.selectedPlace?.category?.name?.toLowerCase() === 'accommodation';
  }

  close() {
    this.closeEmitter.emit();
  }

  onCoordsCopied() {
    this.tooltipCopied.set(true);
    setTimeout(() => this.tooltipCopied.set(false), 1200);
  }
}
