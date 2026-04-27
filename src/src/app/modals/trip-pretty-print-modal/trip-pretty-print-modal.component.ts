import { Component, HostListener } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { FloatLabelModule } from 'primeng/floatlabel';
import { PrintMapProvider, TripDay } from '../../types/trip';
import { MultiSelectModule } from 'primeng/multiselect';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { SelectModule } from 'primeng/select';

@Component({
  selector: 'app-trip-pretty-print-modal',
  imports: [FloatLabelModule, ButtonModule, ReactiveFormsModule, MultiSelectModule, ToggleSwitchModule, SelectModule],
  standalone: true,
  templateUrl: './trip-pretty-print-modal.component.html',
  styleUrl: './trip-pretty-print-modal.component.scss',
})
export class TripPrettyPrintModalComponent {
  @HostListener('keydown.control.enter', ['$event'])
  @HostListener('keydown.meta.enter', ['$event'])
  onCtrlEnter(event: Event) {
    event.preventDefault();
    this.closeDialog();
  }

  preventMobileKeyboard: any = {
    hiddenInput: {
      inputmode: 'none',
      readonly: true,
    },
  };

  printForm: FormGroup;
  days: TripDay[] = [];
  props: string[] = [];
  mapProviders: { label: string; value: PrintMapProvider }[] = [
    { label: 'Mapy.com (offline)', value: 'mapy' },
    { label: 'Google Maps', value: 'google' },
  ];

  constructor(
    private ref: DynamicDialogRef,
    private fb: FormBuilder,
    private config: DynamicDialogConfig,
  ) {
    this.printForm = this.fb.group({
      days: [Validators.required],
      props: [Validators.required],
      places: true,
      notes: true,
      metadata: true,
      mapProvider: 'mapy',
    });

    if (this.config.data) {
      this.days = this.config.data.days;
      this.props = this.config.data.props;
      this.printForm.get('days')?.setValue(this.days.map((d) => d.id));
      this.printForm.get('props')?.setValue(this.config.data.selectedProps);
    }
  }

  closeDialog() {
    const ret = this.printForm.value;
    if (!ret) return;
    ret['days'] = new Set<number>(ret['days']);
    ret['props'] = new Set<string>(ret['props']);
    ret['mapProvider'] = ret['mapProvider'] || 'mapy';
    this.ref.close(ret);
  }
}
