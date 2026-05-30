import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';

import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { environment } from '../../../environments/environment';
@Component({
  selector: 'app-setup-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
  ],
  templateUrl: './setup-page.html',
  styleUrls: ['./setup-page.scss'],
})
export class SetupPage {
  private readonly apiBase = environment.apiUrl;

  step = signal(1); // 1 = admin account, 2 = api credentials, 3 = done

  // Step 1 — admin account
  adminUsername = signal('admin');
  adminPassword = signal('');
  adminPasswordConfirm = signal('');
  step1Loading = signal(false);
  step1Error = signal<string | null>(null);

  // Step 2 — credentials
  portalName = signal('');
  apiUsername = signal('');
  apiPassword = signal('');
  anthropicKey = signal('');
  openclawUsername = signal('');
  openclawPassword = signal('');
  mqttUsername = signal('');
  mqttPassword = signal('');
  step2Loading = signal(false);
  step2Error = signal<string | null>(null);

  // visibility toggles
  showAdminPw = signal(false);
  showAdminPwConfirm = signal(false);
  showApiPw = signal(false);
  showAnthropicKey = signal(false);
  showOpenclawPw = signal(false);
  showMqttPw = signal(false);

  constructor(private http: HttpClient, private router: Router) {}

  get step1Valid(): boolean {
    return (
      !!this.adminUsername().trim() &&
      this.adminPassword().length >= 8 &&
      this.adminPassword() === this.adminPasswordConfirm()
    );
  }

  get step1PasswordMismatch(): boolean {
    return !!this.adminPasswordConfirm() && this.adminPassword() !== this.adminPasswordConfirm();
  }

  createAdmin(): void {
    if (!this.step1Valid || this.step1Loading()) return;
    this.step1Loading.set(true);
    this.step1Error.set(null);

    this.http.post<{ token: string; user: any }>(`${this.apiBase}/auth/register`, {
      username: this.adminUsername().trim(),
      password: this.adminPassword(),
      role: 'admin',
    }).subscribe({
      next: () => {
        this.step1Loading.set(false);
        this.step.set(2);
      },
      error: (err) => {
        this.step1Loading.set(false);
        this.step1Error.set(err?.error?.error || err?.error?.message || 'Failed to create admin account.');
      },
    });
  }

  get step2Valid(): boolean {
    return !!this.portalName().trim();
  }

  saveSettings(): void {
    if (!this.step2Valid || this.step2Loading()) return;
    this.step2Loading.set(true);
    this.step2Error.set(null);

    // Log in as the newly created admin to get a token for PUT /settings
    this.http.post<{ token: string }>(`${this.apiBase}/auth/login`, {
      username: this.adminUsername().trim(),
      password: this.adminPassword(),
    }).subscribe({
      next: ({ token }) => {
        const body: any = { portalName: this.portalName().trim() };
        if (this.apiUsername().trim()) {
          body.apiCredentials = { username: this.apiUsername().trim(), password: this.apiPassword() };
        }
        if (this.anthropicKey().trim()) {
          body.anthropicApiKey = this.anthropicKey().trim();
        }
        if (this.openclawUsername().trim()) {
          body.openclawCredentials = { username: this.openclawUsername().trim(), password: this.openclawPassword() };
        }
        if (this.mqttUsername().trim()) {
          body.mqttCredentials = { username: this.mqttUsername().trim(), password: this.mqttPassword() };
        }

        this.http.put(`${this.apiBase}/settings`, body, {
          headers: { Authorization: `Bearer ${token}` },
        }).subscribe({
          next: () => {
            this.step2Loading.set(false);
            this.step.set(3);
          },
          error: (err) => {
            this.step2Loading.set(false);
            this.step2Error.set(err?.error?.error || err?.error?.message || 'Failed to save settings.');
          },
        });
      },
      error: (err) => {
        this.step2Loading.set(false);
        this.step2Error.set(err?.error?.error || 'Failed to authenticate for settings save.');
      },
    });
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }
}
