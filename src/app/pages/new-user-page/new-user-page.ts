import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth-service';

@Component({
  selector: 'app-new-user-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    RouterModule
  ],
  templateUrl: './new-user-page.html',
  styleUrl: './new-user-page.scss',
})
export class NewUserPage {
  constructor(
    private authService: AuthService,
    private router: Router
  ) {}
  hidePassword = true;
  hideVerifyPassword = true;

  username = '';
  password = '';
  verifyPassword = '';

  isLoading = signal(false);
  errorMessage = signal<string>('');
  private errorTimer: any = null;

  private showError(message: string) {
    this.errorMessage.set(message);

    if (this.errorTimer) {
      clearTimeout(this.errorTimer);
      this.errorTimer = null;
    }

    this.errorTimer = setTimeout(() => {
      this.errorMessage.set('');
      this.errorTimer = null;
    }, 3000);
  }

  onSubmit() {
    if (this.isLoading()) return;

    // Normalize + basic validation
    this.username = this.username.trim();

    if (!this.username || !this.password || !this.verifyPassword) {
      this.showError('All fields are required.');
      return;
    }

    if (this.password !== this.verifyPassword) {
      this.showError('Passwords do not match.');
      return;
    }

    this.isLoading.set(true);

    this.authService.register(this.username, this.password).subscribe({
      next: (res) => {
        console.log('User registered:', res);
        this.isLoading.set(false);

        if (this.errorTimer) {
          clearTimeout(this.errorTimer);
          this.errorTimer = null;
        }
        this.errorMessage.set('');

        // After successful registration, go back to login
        this.router.navigate(['/monitor']);
      },
      error: (err) => {
        console.error('Registration failed:', err);
        this.isLoading.set(false);

        // Try common Fastify/Angular error shapes
        const apiErr = err?.error;

        let msg = '';

        // Fastify often returns: { statusCode, error, message }
        if (apiErr && typeof apiErr === 'object') {
          const m = (apiErr as any).message;
          const e = (apiErr as any).error;
          msg =
            (Array.isArray(m) ? m.join(', ') : m) ||
            (typeof e === 'string' ? e : '') ||
            '';
        } else if (typeof apiErr === 'string') {
          // Sometimes the body is a plain string
          msg = apiErr;
        }

        // Fall back to Angular's message
        msg = msg || err?.message || '';

        console.log('API error payload:', err?.error);

        // CORS / network failures often surface as status 0 in Angular
        if (err?.status === 0) {
          this.showError(
            'Could not reach the API. Check that the API is running and CORS is enabled.'
          );
          return;
        }

        this.showError(msg || 'Failed to create user. Please try again.');
      }
    });
  }
}
