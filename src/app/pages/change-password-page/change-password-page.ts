import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';

import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { AuthService } from '../../services/auth-service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-change-password-page',
  standalone: true,
  imports: [CommonModule, FormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule],
  templateUrl: './change-password-page.html',
  styleUrls: ['./change-password-page.scss'],
})
export class ChangePasswordPage {
  private readonly apiBase = environment.apiUrl;

  currentPassword = signal('');
  newPassword = signal('');
  confirmPassword = signal('');
  loading = signal(false);
  error = signal<string | null>(null);

  showCurrent = signal(false);
  showNew = signal(false);
  showConfirm = signal(false);

  constructor(private http: HttpClient, public auth: AuthService, private router: Router) {}

  get passwordMismatch(): boolean {
    return !!this.confirmPassword() && this.newPassword() !== this.confirmPassword();
  }

  get formValid(): boolean {
    return (
      !!this.currentPassword() &&
      this.newPassword().length >= 8 &&
      this.newPassword() === this.confirmPassword()
    );
  }

  submit(): void {
    if (!this.formValid || this.loading()) return;
    this.loading.set(true);
    this.error.set(null);

    this.http.patch(`${this.apiBase}/auth/change-password`, {
      currentPassword: this.currentPassword(),
      newPassword: this.newPassword(),
    }, {
      headers: { Authorization: `Bearer ${this.auth.token()}` },
    }).subscribe({
      next: () => {
        // Clear the flag in the stored user so guards don't redirect again
        const u = this.auth.user();
        if (u) {
          this.auth.updateAuth({ token: this.auth.token()!, user: { ...u, mustChangePassword: false } });
        }
        this.loading.set(false);
        this.router.navigate(['/monitor'], { replaceUrl: true });
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.error || 'Failed to change password.');
      },
    });
  }
}
