import { Component } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { TripRetimingChange } from '../../types/trip';

@Component({
  selector: 'app-trip-retiming-preview-modal',
  imports: [ButtonModule],
  standalone: true,
  templateUrl: './trip-retiming-preview-modal.component.html',
  styleUrl: './trip-retiming-preview-modal.component.scss',
})
export class TripRetimingPreviewModalComponent {
  changes: TripRetimingChange[] = [];

  constructor(
    private ref: DynamicDialogRef,
    private config: DynamicDialogConfig,
  ) {
    this.changes = this.config.data?.changes ?? [];
  }

  close(confirm = false) {
    this.ref.close(confirm);
  }
}
