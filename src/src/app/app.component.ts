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
  private static readonly UPDATE_RELOAD_KEY = 'trip.updateReload';
  private static readonly UPDATE_RELOAD_SUPPRESS_MS = 5 * 60 * 1000;
  private utilsService = inject(UtilsService);
  private swUpdate = inject(SwUpdate);
  private messageService = inject(MessageService);
  private destroyRef = inject(DestroyRef);
  private pendingUpdateHash: string | null = null;
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
      .subscribe((event) => {
        const updateHash = event.latestVersion.hash;
        if (this.wasUpdateReloadedRecently(updateHash)) return;

        this.pendingUpdateHash = updateHash;
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
    this.rememberUpdateReload();
    this.messageService.clear('app-update');
    this.swUpdate.activateUpdate().finally(() => document.location.reload());
  }

  private wasUpdateReloadedRecently(hash: string): boolean {
    try {
      const raw = sessionStorage.getItem(AppComponent.UPDATE_RELOAD_KEY);
      if (!raw) return false;
      const state = JSON.parse(raw) as { hash?: string; timestamp?: number };
      return (
        state.hash === hash &&
        typeof state.timestamp === 'number' &&
        Date.now() - state.timestamp < AppComponent.UPDATE_RELOAD_SUPPRESS_MS
      );
    } catch {
      return false;
    }
  }

  private rememberUpdateReload(): void {
    if (!this.pendingUpdateHash) return;
    try {
      sessionStorage.setItem(
        AppComponent.UPDATE_RELOAD_KEY,
        JSON.stringify({ hash: this.pendingUpdateHash, timestamp: Date.now() }),
      );
    } catch {
      // Reload still matters more than remembering the dismissed update toast.
    }
  }
}
