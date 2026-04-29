import { Component, inject, signal } from '@angular/core';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs/operators';
import { AuthService } from '../../services/auth-service';
import { NavigationGuardService } from '../../services/navigation-guard.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [MatToolbarModule, MatButtonModule, RouterModule],
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class Header {
  auth = inject(AuthService);
  private router = inject(Router);
  private navGuard = inject(NavigationGuardService);

  showNavConfirm = signal(false);
  private pendingUrl: string | null = null;

  isLoginPage = toSignal(
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      map(e => (e as NavigationEnd).urlAfterRedirects === '/login'),
      startWith(this.router.url === '/login')
    ),
    { initialValue: this.router.url === '/login' }
  );

  constructor() {}

  navTo(url: string, event: Event): void {
    event.preventDefault();
    if (this.navGuard.isDirty()) {
      this.pendingUrl = url;
      this.showNavConfirm.set(true);
    } else {
      this.router.navigate([url]);
    }
  }

  cancelNavConfirm(): void {
    this.showNavConfirm.set(false);
    this.pendingUrl = null;
  }

  confirmNav(): void {
    this.showNavConfirm.set(false);
    if (this.pendingUrl) {
      this.navGuard.setDirty(false);
      this.router.navigate([this.pendingUrl]);
      this.pendingUrl = null;
    }
  }

  logout() {
    this.auth.logout();
    this.router.navigate(['/login'], { replaceUrl: true });
  }
}
