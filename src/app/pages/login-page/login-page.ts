import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth-service';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterModule } from '@angular/router';


@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [CommonModule, FormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule, RouterModule],
  templateUrl: './login-page.html',
  styleUrl: './login-page.scss',
})
export class LoginPage {
  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  username = '';
  password = '';

  isLoading = signal(false);
  errorMessage = signal<string>('');
  private errorTimer: any = null;

  hidePassword = true;

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

    this.username = this.username.trim();

    if (!this.username || !this.password) {
      this.showError('Username and password are required.');
      return;
    }

    this.isLoading.set(true);

    this.authService.login(this.username, this.password).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.errorMessage.set('');

        // Default landing after login
        this.router.navigate(['/monitor'], { replaceUrl: true });
      },
      error: (err) => {
        this.isLoading.set(false);

        const apiErr = err?.error;
        const msg =
          apiErr?.error ||
          apiErr?.message ||
          err?.message ||
          'Login failed. Please try again.';

        this.showError(msg);
      },
    });
  }
}
