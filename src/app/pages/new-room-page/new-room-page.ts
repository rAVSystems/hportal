import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../services/auth-service';
import { environment } from '../../../environments/environment';

interface TemplateDoc {
  _id: string;
  name: string;
  permission: string;
  createdby: string;
}

@Component({
  selector: 'app-new-room-page',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatIconModule],
  templateUrl: './new-room-page.html',
  styleUrl: './new-room-page.scss',
})
export class NewRoomPage implements OnInit {
  private readonly apiBase = environment.apiUrl;

  campus = signal('');
  building = signal('');
  room = signal('');
  ip = signal('');
  selectedTemplateId = signal('');

  templates = signal<TemplateDoc[]>([]);
  saving = signal(false);
  error = signal<string | null>(null);

  constructor(
    private http: HttpClient,
    private router: Router,
    public auth: AuthService,
  ) {}

  ngOnInit(): void {
    this.http.get<TemplateDoc[]>(`${this.apiBase}/templates`, {
      headers: { Authorization: `Bearer ${this.auth.token()}` }
    }).subscribe({
      next: (data) => this.templates.set(data),
      error: () => {} // templates are optional, fail silently
    });
  }

  get formValid(): boolean {
    return !!this.campus().trim() && !!this.building().trim() && !!this.room().trim() && !!this.ip().trim();
  }

  private buildConfig(): any {
    const template = this.templates().find(t => t._id === this.selectedTemplateId());
    return {
      campus: this.campus().trim(),
      building: this.building().trim(),
      room: this.room().trim(),
      ip: this.ip().trim(),
      templateId: template?._id ?? null,
    };
  }

  create(): void {
    if (!this.formValid || this.saving()) return;
    this.saving.set(true);
    this.error.set(null);

    const templateId = this.selectedTemplateId();

    if (templateId) {
      // Load template config first, then merge basic fields and create room
      this.http.get<any>(`${this.apiBase}/templates/${templateId}`, {
        headers: { Authorization: `Bearer ${this.auth.token()}` }
      }).subscribe({
        next: (tmpl) => {
          const config = {
            ...(tmpl.config ?? {}),
            campus: this.campus().trim(),
            building: this.building().trim(),
            room: this.room().trim(),
            ip: this.ip().trim(),
          };
          this.postRoom(config);
        },
        error: () => {
          this.saving.set(false);
          this.error.set('Failed to load template.');
        }
      });
    } else {
      this.postRoom({
        campus: this.campus().trim(),
        building: this.building().trim(),
        room: this.room().trim(),
        ip: this.ip().trim(),
      });
    }
  }

  private postRoom(config: any): void {
    this.http.post<{ roomId: string }>(`${this.apiBase}/rooms`, config, {
      headers: { Authorization: `Bearer ${this.auth.token()}` }
    }).subscribe({
      next: () => {
        this.saving.set(false);
        this.router.navigate(['/monitor']);
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(err?.error?.error || 'Failed to create room.');
      }
    });
  }

  customize(): void {
    if (!this.formValid || this.saving()) return;
    this.saving.set(true);
    this.error.set(null);

    const templateId = this.selectedTemplateId();

    if (templateId) {
      this.http.get<any>(`${this.apiBase}/templates/${templateId}`, {
        headers: { Authorization: `Bearer ${this.auth.token()}` }
      }).subscribe({
        next: (tmpl) => {
          const config = {
            ...(tmpl.config ?? {}),
            campus: this.campus().trim(),
            building: this.building().trim(),
            room: this.room().trim(),
            ip: this.ip().trim(),
          };
          this.postRoomAndEdit(config);
        },
        error: () => {
          this.saving.set(false);
          this.error.set('Failed to load template.');
        }
      });
    } else {
      this.postRoomAndEdit({
        campus: this.campus().trim(),
        building: this.building().trim(),
        room: this.room().trim(),
        ip: this.ip().trim(),
      });
    }
  }

  private postRoomAndEdit(config: any): void {
    this.http.post<{ roomId: string }>(`${this.apiBase}/rooms`, config, {
      headers: { Authorization: `Bearer ${this.auth.token()}` }
    }).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.router.navigate(['/edit', res.roomId]);
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(err?.error?.error || 'Failed to create room.');
      }
    });
  }

  goBack(): void {
    this.router.navigate(['/monitor']);
  }
}
