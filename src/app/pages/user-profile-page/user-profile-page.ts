import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { AuthService, AuthResponse } from '../../services/auth-service';

interface TemplateDoc {
  _id: string;
  name: string;
  icon: string;
  createdby: string;
  created: string;
  permission: string;
}

interface TemplateEditState {
  editingName: boolean;
  pendingName: string;
  saving: boolean;
}

@Component({
  selector: 'app-user-profile-page',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatIconModule, MatInputModule, MatFormFieldModule],
  templateUrl: './user-profile-page.html',
  styleUrl: './user-profile-page.scss',
})
export class UserProfilePage implements OnInit {
  private readonly apiBase: string = (window as any).API_BASE_URL || 'http://localhost:8080';

  // ── Username ──────────────────────────────────────────────────────────────
  newUsername = signal('');
  savingUsername = signal(false);
  usernameSuccess = signal(false);
  usernameError = signal<string | null>(null);

  // ── Password ──────────────────────────────────────────────────────────────
  newPassword = signal('');
  confirmPassword = signal('');
  savingPassword = signal(false);
  passwordSuccess = signal(false);
  passwordError = signal<string | null>(null);

  // ── Templates ─────────────────────────────────────────────────────────────
  templates = signal<TemplateDoc[]>([]);
  templatesLoading = signal(false);
  templatesError = signal<string | null>(null);
  editState = new Map<string, TemplateEditState>();
  private stateVersion = signal(0);

  // ── Delete confirmation ───────────────────────────────────────────────────
  pendingDeleteId = signal<string | null>(null);
  deleteConfirmInput = signal('');
  deleteError = signal<string | null>(null);
  deleting = signal(false);

  get pendingDeleteTemplate(): TemplateDoc | null {
    const id = this.pendingDeleteId();
    return id ? (this.templates().find(t => t._id === id) ?? null) : null;
  }

  constructor(
    private http: HttpClient,
    public auth: AuthService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.newUsername.set(this.auth.user()?.username ?? '');
    this.loadTemplates();
  }

  private authHeaders(): Record<string, string> {
    const token = this.auth.token();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  // ── Username ──────────────────────────────────────────────────────────────

  saveUsername(): void {
    const username = this.newUsername().trim();
    if (!username || username === this.auth.user()?.username) return;
    this.savingUsername.set(true);
    this.usernameError.set(null);
    this.http.patch<AuthResponse>(`${this.apiBase}/auth/me/username`, { username }, { headers: this.authHeaders() }).subscribe({
      next: (res) => {
        this.auth.updateAuth(res);
        this.savingUsername.set(false);
        this.usernameSuccess.set(true);
        setTimeout(() => this.usernameSuccess.set(false), 2000);
      },
      error: (err) => {
        this.usernameError.set(err?.error?.error || 'Failed to update username.');
        this.savingUsername.set(false);
      },
    });
  }

  // ── Password ──────────────────────────────────────────────────────────────

  savePassword(): void {
    const password = this.newPassword();
    if (!password) return;
    if (password !== this.confirmPassword()) {
      this.passwordError.set('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      this.passwordError.set('Password must be at least 8 characters.');
      return;
    }
    this.savingPassword.set(true);
    this.passwordError.set(null);
    this.http.patch(`${this.apiBase}/auth/me/password`, { password }, { headers: this.authHeaders() }).subscribe({
      next: () => {
        this.savingPassword.set(false);
        this.passwordSuccess.set(true);
        this.newPassword.set('');
        this.confirmPassword.set('');
        setTimeout(() => this.passwordSuccess.set(false), 2000);
      },
      error: (err) => {
        this.passwordError.set(err?.error?.error || 'Failed to update password.');
        this.savingPassword.set(false);
      },
    });
  }

  // ── Templates ─────────────────────────────────────────────────────────────

  loadTemplates(): void {
    this.templatesLoading.set(true);
    this.templatesError.set(null);
    this.http.get<TemplateDoc[]>(`${this.apiBase}/templates/mine`, { headers: this.authHeaders() }).subscribe({
      next: (data) => {
        this.templates.set(data);
        this.templatesLoading.set(false);
      },
      error: (err) => {
        this.templatesError.set(err?.error?.error || 'Failed to load templates.');
        this.templatesLoading.set(false);
      },
    });
  }

  stateFor(id: string): TemplateEditState {
    if (!this.editState.has(id)) {
      this.editState.set(id, { editingName: false, pendingName: '', saving: false });
    }
    return this.editState.get(id)!;
  }

  startEditName(id: string, currentName: string): void {
    const s = this.stateFor(id);
    s.editingName = true;
    s.pendingName = currentName;
    this.stateVersion.update(v => v + 1);
  }

  cancelEditName(id: string): void {
    this.stateFor(id).editingName = false;
    this.stateVersion.update(v => v + 1);
  }

  saveName(id: string): void {
    const s = this.stateFor(id);
    const name = s.pendingName.trim();
    if (!name) return;
    s.saving = true;
    this.http.patch(`${this.apiBase}/templates/${id}`, { name }, { headers: this.authHeaders() }).subscribe({
      next: () => {
        this.templates.update(list => list.map(t => t._id === id ? { ...t, name } : t));
        s.editingName = false;
        s.saving = false;
        this.stateVersion.update(v => v + 1);
      },
      error: (err) => {
        this.templatesError.set(err?.error?.error || 'Failed to rename template.');
        s.saving = false;
        this.stateVersion.update(v => v + 1);
      },
    });
  }

  promptDelete(id: string): void {
    this.pendingDeleteId.set(id);
    this.deleteConfirmInput.set('');
    this.deleteError.set(null);
  }

  cancelDelete(): void {
    this.pendingDeleteId.set(null);
    this.deleteError.set(null);
  }

  confirmDelete(): void {
    const template = this.pendingDeleteTemplate;
    if (!template) return;
    if (this.deleteConfirmInput().trim() !== template.name.trim()) {
      this.deleteError.set('Name does not match. Please try again.');
      return;
    }
    this.deleting.set(true);
    this.deleteError.set(null);
    this.http.delete(`${this.apiBase}/templates/${template._id}`, { headers: this.authHeaders() }).subscribe({
      next: () => {
        this.templates.update(list => list.filter(t => t._id !== template._id));
        this.pendingDeleteId.set(null);
        this.deleting.set(false);
      },
      error: (err) => {
        this.deleteError.set(err?.error?.error || 'Failed to delete template.');
        this.deleting.set(false);
      },
    });
  }

  formatDate(iso: string): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString();
  }

  goBack(): void {
    this.router.navigate(['/monitor']);
  }
}
