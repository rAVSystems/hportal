import { Component, signal } from '@angular/core';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { Router, RouterModule } from '@angular/router';
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
  showNavConfirm = signal(false);
  private pendingUrl: string | null = null;

  constructor(
    public auth: AuthService,
    private router: Router,
    private navGuard: NavigationGuardService
  ) {}

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
