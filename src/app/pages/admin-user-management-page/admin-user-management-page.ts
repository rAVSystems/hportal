import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth-service';

export interface AdminUser {
  _id: string;
  username: string;
  roles: ('admin' | 'editor' | 'viewer')[];
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

interface UserEditState {
  editingUsername: boolean;
  pendingUsername: string;
  showPasswordInput: boolean;
  pendingPassword: string;
  saving: boolean;
}

@Component({
  selector: 'app-admin-user-management-page',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatIconModule, MatSelectModule],
  templateUrl: './admin-user-management-page.html',
  styleUrl: './admin-user-management-page.scss',
})
export class AdminUserManagementPage implements OnInit {
  private readonly apiBase: string = (window as any).API_BASE_URL || 'http://localhost:8080';

  users = signal<AdminUser[]>([]);
  editState = new Map<string, UserEditState>();
  error = signal<string | null>(null);
  private stateVersion = signal(0);

  readonly allRoles: ('admin' | 'editor' | 'viewer')[] = ['admin', 'editor', 'viewer'];

  constructor(
    private http: HttpClient,
    public auth: AuthService,
    private router: Router,
  ) {}

  goBack(): void {
    this.router.navigate(['/monitor']);
  }

  ngOnInit(): void {
    this.loadUsers();
  }

  private authHeaders(): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${this.auth.token()}` });
  }

  private getEditState(userId: string): UserEditState {
    if (!this.editState.has(userId)) {
      const user = this.users().find((u) => u._id === userId);
      this.editState.set(userId, {
        editingUsername: false,
        pendingUsername: user?.username ?? '',
        showPasswordInput: false,
        pendingPassword: '',
        saving: false,
      });
    }
    return this.editState.get(userId)!;
  }

  stateFor(userId: string): UserEditState {
    this.stateVersion(); // subscribe to version so template re-evaluates on tick
    return this.getEditState(userId);
  }

  private tick(): void {
    this.stateVersion.update((v) => v + 1);
  }

  loadUsers(): void {
    this.error.set(null);
    this.http
      .get<AdminUser[]>(`${this.apiBase}/admin/users`, { headers: this.authHeaders() })
      .subscribe({
        next: (users) => {
          this.users.set(users);
          this.editState.clear();
        },
        error: () => this.error.set('Failed to load users.'),
      });
  }

  updateRoles(userId: string, roles: ('admin' | 'editor' | 'viewer')[]): void {
    this.http
      .patch(`${this.apiBase}/admin/users/${userId}/roles`, { roles }, { headers: this.authHeaders() })
      .subscribe({
        next: () => {
          this.users.update((list) =>
            list.map((u) => (u._id === userId ? { ...u, roles } : u))
          );
        },
        error: () => this.error.set('Failed to update roles.'),
      });
  }

  startEditUsername(userId: string): void {
    const user = this.users().find((u) => u._id === userId);
    const state = this.getEditState(userId);
    state.editingUsername = true;
    state.pendingUsername = user?.username ?? '';
    this.tick();
  }

  cancelEditUsername(userId: string): void {
    const state = this.getEditState(userId);
    const user = this.users().find((u) => u._id === userId);
    state.editingUsername = false;
    state.pendingUsername = user?.username ?? '';
    this.tick();
  }

  updateUsername(userId: string): void {
    const state = this.getEditState(userId);
    const username = state.pendingUsername.trim();
    if (!username) return;

    state.saving = true;
    this.http
      .patch(`${this.apiBase}/admin/users/${userId}/username`, { username }, { headers: this.authHeaders() })
      .subscribe({
        next: () => {
          this.users.update((list) =>
            list.map((u) => (u._id === userId ? { ...u, username } : u))
          );
          state.editingUsername = false;
          state.saving = false;
          this.tick();
        },
        error: () => {
          this.error.set('Failed to update username.');
          state.saving = false;
          this.tick();
        },
      });
  }

  togglePasswordInput(userId: string): void {
    const state = this.getEditState(userId);
    state.showPasswordInput = !state.showPasswordInput;
    state.pendingPassword = '';
    this.tick();
  }

  resetPassword(userId: string): void {
    const state = this.getEditState(userId);
    const password = state.pendingPassword;
    if (!password || password.length < 8) {
      this.error.set('Password must be at least 8 characters.');
      return;
    }

    state.saving = true;
    this.http
      .patch(`${this.apiBase}/admin/users/${userId}/password`, { password }, { headers: this.authHeaders() })
      .subscribe({
        next: () => {
          state.showPasswordInput = false;
          state.pendingPassword = '';
          state.saving = false;
          this.tick();
        },
        error: () => {
          this.error.set('Failed to reset password.');
          state.saving = false;
          this.tick();
        },
      });
  }

  toggleActive(userId: string, isActive: boolean): void {
    this.http
      .patch(`${this.apiBase}/admin/users/${userId}/active`, { isActive }, { headers: this.authHeaders() })
      .subscribe({
        next: () => {
          this.users.update((list) =>
            list.map((u) => (u._id === userId ? { ...u, isActive } : u))
          );
        },
        error: () => this.error.set('Failed to update user status.'),
      });
  }

  onRoleChange(
    currentRoles: ('admin' | 'editor' | 'viewer')[],
    role: 'admin' | 'editor' | 'viewer',
    event: Event,
  ): ('admin' | 'editor' | 'viewer')[] {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) {
      return currentRoles.includes(role) ? currentRoles : [...currentRoles, role];
    } else {
      return currentRoles.filter((r) => r !== role);
    }
  }

  formatDate(dateStr: string | null): string {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }
}
