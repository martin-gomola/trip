import { Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterOutlet } from '@angular/router';
import { ToastModule } from 'primeng/toast';
import { LoaderComponent } from './shared/loader';
import { UtilsService } from './services/utils.service';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { MessageService } from 'primeng/api';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ToastModule, LoaderComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  private utilsService = inject(UtilsService);
  private swUpdate = inject(SwUpdate);
  private messageService = inject(MessageService);
  private destroyRef = inject(DestroyRef);
  loadingMessage = this.utilsService.loadingMessage;

  constructor() {
    this.utilsService.initDarkMode();
    this.watchForUpdates();
  }

  private watchForUpdates(): void {
    if (!this.swUpdate.isEnabled) return;

    this.swUpdate.versionUpdates
      .pipe(
        filter((event): event is VersionReadyEvent => event.type === 'VERSION_READY'),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        this.messageService.add({
          key: 'app-update',
          severity: 'info',
          summary: 'Update available',
          detail: 'A new version of TRIP is ready. Tap to reload.',
          sticky: true,
          closable: true,
          data: { reloadOnClick: true },
        });
      });
  }

  reloadForUpdate(): void {
    this.swUpdate.activateUpdate().finally(() => document.location.reload());
  }
}
