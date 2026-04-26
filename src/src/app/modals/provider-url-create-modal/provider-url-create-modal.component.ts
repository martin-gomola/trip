import { Component, HostListener } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DynamicDialogRef } from 'primeng/dynamicdialog';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputTextModule } from 'primeng/inputtext';

@Component({
  selector: 'app-provider-url-create-modal',
  imports: [ButtonModule, FloatLabelModule, InputTextModule, ReactiveFormsModule],
  standalone: true,
  templateUrl: './provider-url-create-modal.component.html',
  styleUrl: './provider-url-create-modal.component.scss',
})
export class ProviderUrlCreateModalComponent {
  @HostListener('keydown.control.enter', ['$event'])
  @HostListener('keydown.meta.enter', ['$event'])
  onCtrlEnter(event: Event) {
    event.preventDefault();
    this.closeDialog();
  }

  urlInput = new FormControl('', { nonNullable: true, validators: [Validators.required] });

  constructor(private ref: DynamicDialogRef) {}

  closeDialog() {
    const url = this.urlInput.value.trim();
    if (!url) return;
    this.ref.close(url);
  }
}
