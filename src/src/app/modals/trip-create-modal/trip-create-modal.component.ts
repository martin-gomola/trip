import { Component, HostListener } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ButtonModule } from 'primeng/button';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputTextModule } from 'primeng/inputtext';
import { FocusTrapModule } from 'primeng/focustrap';
import { DatePickerModule } from 'primeng/datepicker';
import { ApiService } from '../../services/api.service';
import { take } from 'rxjs';
import { checkAndParseLatLng, formatLatLng } from '../../shared/latlng-parser';
import { UtilsService } from '../../services/utils.service';

@Component({
  selector: 'app-trip-create-modal',
  imports: [FloatLabelModule, InputTextModule, DatePickerModule, ButtonModule, ReactiveFormsModule, FocusTrapModule],
  standalone: true,
  templateUrl: './trip-create-modal.component.html',
  styleUrl: './trip-create-modal.component.scss',
})
export class TripCreateModalComponent {
  @HostListener('keydown.control.enter', ['$event'])
  @HostListener('keydown.meta.enter', ['$event'])
  onCtrlEnter(event: Event) {
    event.preventDefault();
    this.closeDialog();
  }

  tripForm: FormGroup;
  previous_image_id: number | null = null;
  previous_image: string | null = null;

  constructor(
    private ref: DynamicDialogRef,
    private fb: FormBuilder,
    private config: DynamicDialogConfig,
    private apiService: ApiService,
    private utilsService: UtilsService,
  ) {
    this.tripForm = this.fb.group({
      id: -1,
      name: ['', Validators.required],
      image: '',
      currency: null,
      home_name: null,
      home_lat: [
        null,
        {
          validators: [Validators.pattern('-?(90(\\.0+)?|[1-8]?\\d(\\.\\d+)?)')],
          updateOn: 'blur',
        },
      ],
      home_lng: [
        null,
        {
          validators: [
            Validators.pattern('-?(180(\\.0+)?|1[0-7]\\d(\\.\\d+)?|[1-9]?\\d(\\.\\d+)?)'),
          ],
        },
      ],
      image_id: null,
      daterange: null,
    });

    const patchValue = this.config.data?.trip;
    if (patchValue) {
      if (!patchValue.image_id) delete patchValue['image'];
      this.tripForm.patchValue(patchValue);
    } else {
      this.apiService
        .getSettings()
        .pipe(take(1))
        .subscribe({
          next: (settings) => this.tripForm.get('currency')?.setValue(settings.currency),
        });
    }

    this.tripForm
      .get('home_name')
      ?.valueChanges.pipe(takeUntilDestroyed())
      .subscribe({
        next: (value: string) => {
          this.parseHomeMapsUrl(value);
        },
      });

    this.tripForm
      .get('home_lat')
      ?.valueChanges.pipe(takeUntilDestroyed())
      .subscribe({
        next: (value: string) => {
          const result = checkAndParseLatLng(value);
          if (!result) return;
          const [lat, lng] = result;

          const latControl = this.tripForm.get('home_lat');
          const lngControl = this.tripForm.get('home_lng');

          latControl?.setValue(formatLatLng(lat).trim(), { emitEvent: false });
          lngControl?.setValue(formatLatLng(lng).trim(), { emitEvent: false });

          lngControl?.markAsDirty();
          lngControl?.updateValueAndValidity();
        },
      });
  }

  onHomeLinkPaste(event: ClipboardEvent) {
    const value = event.clipboardData?.getData('text')?.trim();
    if (!value) return;
    if (!this.isGoogleMapsLink(value)) return;

    event.preventDefault();
    this.tripForm.get('home_name')?.setValue(value, { emitEvent: false });
    this.tripForm.get('home_name')?.markAsDirty();
    this.parseHomeMapsUrl(value);
  }

  parseHomeMapsUrl(value: string | null) {
    if (!value) return;
    const trimmed = value.trim();

    if (/^(https?:\/\/)?(www\.)?google\.[a-z.]+\/maps/.test(trimmed)) {
      this.parseGoogleMapsPlaceUrl(trimmed);
      return;
    }

    const shortLinkId = this.utilsService.parseGoogleMapsShortUrl(trimmed);
    if (shortLinkId) this.parseGoogleMapsShortUrl(shortLinkId);
  }

  private isGoogleMapsLink(value: string) {
    const trimmed = value.trim();
    return /^(https?:\/\/)?(www\.)?google\.[a-z.]+\/maps/.test(trimmed) || !!this.utilsService.parseGoogleMapsShortUrl(trimmed);
  }

  private parseGoogleMapsPlaceUrl(url: string): void {
    const [place, latlng] = this.utilsService.parseGoogleMapsPlaceUrl(url);
    if (!place || !latlng) return;
    const [lat, lng] = latlng.split(',');
    this.setHome(place, lat, lng);
  }

  private parseGoogleMapsShortUrl(id: string) {
    this.utilsService.setLoading('Querying Google Maps API...');
    this.apiService
      .completionGoogleShortlink(id)
      .pipe(take(1))
      .subscribe({
        next: (result) => {
          this.utilsService.setLoading('');
          this.setHome(result.name || 'Home', formatLatLng(result.lat), formatLatLng(result.lng));
        },
        error: () => {
          this.utilsService.setLoading('');
          this.utilsService.toast('error', 'Error', 'Could not parse maps.app.goo.gl identifier');
        },
      });
  }

  private setHome(name: string, lat: string, lng: string) {
    this.tripForm.get('home_name')?.setValue(name, { emitEvent: false });
    this.tripForm.get('home_lat')?.setValue(lat, { emitEvent: false });
    this.tripForm.get('home_lng')?.setValue(lng, { emitEvent: false });
    this.tripForm.get('home_name')?.markAsDirty();
    this.tripForm.get('home_lat')?.markAsDirty();
    this.tripForm.get('home_lng')?.markAsDirty();
    this.tripForm.get('home_lat')?.updateValueAndValidity();
    this.tripForm.get('home_lng')?.updateValueAndValidity();
  }

  closeDialog() {
    if (!this.tripForm.valid) return;
    let ret = this.tripForm.value;
    if (!ret['name']) return;
    ret['home_name'] = ret['home_name']?.trim() || null;
    ret['home_lat'] = ret['home_lat'] === null || ret['home_lat'] === '' ? null : +ret['home_lat'];
    ret['home_lng'] = ret['home_lng'] === null || ret['home_lng'] === '' ? null : +ret['home_lng'];
    if (ret['image_id']) {
      delete ret['image'];
      delete ret['image_id'];
    }
    this.ref.close(ret);
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      const reader = new FileReader();

      reader.onload = (e) => {
        if (this.tripForm.get('image_id')?.value) {
          this.previous_image_id = this.tripForm.get('image_id')?.value;
          this.previous_image = this.tripForm.get('image')?.value;
          this.tripForm.get('image_id')?.setValue(null);
        }

        this.tripForm.get('image')?.setValue(e.target?.result as string);
        this.tripForm.get('image')?.markAsDirty();
      };

      reader.readAsDataURL(file);
    }
  }

  clearImage() {
    this.tripForm.get('image')?.setValue(null);

    if (this.previous_image && this.previous_image_id) {
      this.tripForm.get('image_id')?.setValue(this.previous_image_id);
      this.tripForm.get('image')?.setValue(this.previous_image);
    }
  }
}
