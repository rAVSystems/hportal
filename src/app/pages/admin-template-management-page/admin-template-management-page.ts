import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth-service';

export interface TemplateDoc {
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
  selector: 'app-admin-template-management-page',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatIconModule],
  templateUrl: './admin-template-management-page.html',
  styleUrl: './admin-template-management-page.scss',
})
export class AdminTemplateManagementPage implements OnInit {
  private readonly apiBase: string = (window as any).API_BASE_URL || 'http://localhost:8080';

  templates = signal<TemplateDoc[]>([]);
  editState = new Map<string, TemplateEditState>();
  error = signal<string | null>(null);
  private stateVersion = signal(0);

  readonly permissionOptions = ['user', 'admin'];

  // ── Delete confirmation ───────────────────────────────────────────────────
  pendingDeleteId = signal<string | null>(null);
  pendingDeleteName = signal('');
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
    this.loadTemplates();
  }

  private authHeaders(): Record<string, string> {
    const token = this.auth.token();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  loadTemplates(): void {
    this.error.set(null);
    this.http.get<TemplateDoc[]>(`${this.apiBase}/templates`, { headers: this.authHeaders() }).subscribe({
      next: (data) => this.templates.set(data),
      error: (err) => this.error.set(err?.error?.error || 'Failed to load templates.'),
    });
  }

  stateFor(id: string): TemplateEditState {
    if (!this.editState.has(id)) {
      this.editState.set(id, { editingName: false, pendingName: '', saving: false });
    }
    return this.editState.get(id)!;
  }

  // ── Name ──────────────────────────────────────────────────────────────────

  startEditName(id: string, currentName: string): void {
    const s = this.stateFor(id);
    s.editingName = true;
    s.pendingName = currentName;
    this.stateVersion.update(v => v + 1);
  }

  cancelEditName(id: string): void {
    const s = this.stateFor(id);
    s.editingName = false;
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
        this.error.set(err?.error?.error || 'Failed to rename template.');
        s.saving = false;
        this.stateVersion.update(v => v + 1);
      },
    });
  }

  // ── Permission ────────────────────────────────────────────────────────────

  updatePermission(id: string, permission: string): void {
    this.http.patch(`${this.apiBase}/templates/${id}`, { permission }, { headers: this.authHeaders() }).subscribe({
      next: () => this.templates.update(list => list.map(t => t._id === id ? { ...t, permission } : t)),
      error: (err) => this.error.set(err?.error?.error || 'Failed to update permission.'),
    });
  }

  // ── Delete ────────────────────────────────────────────────────────────────

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
