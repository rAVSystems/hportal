import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';

import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

import { AuthService } from '../../services/auth-service';
import { RoomCard } from '../room-card/room-card';

export type RoomDoc = {
  _id: string;
  config: {
    campus?: string;
    building?: string;
    room?: string;
    roomType?: string;
    version?: string;
    [key: string]: unknown;
  };
};

@Component({
  selector: 'app-monitor-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RoomCard,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    MatButtonModule,
  ],
  templateUrl: './monitor-page.html',
  styleUrls: ['./monitor-page.scss'],
})
export class MonitorPage implements OnInit {
  // Keep this consistent with AuthService/api setup
  private readonly apiBase = 'http://192.168.1.225:8080';

  rooms = signal<RoomDoc[]>([]);
  isLoading = signal(false);
  errorMessage = signal<string>('');

  // Search + filters
  searchText = signal('');
  campusFilter = signal('');
  buildingFilter = signal('');
  roomTypeFilter = signal('');

  private norm(v: unknown): string {
    return String(v ?? '').trim().toLowerCase();
  }

  campuses = computed(() => {
    const set = new Set<string>();
    for (const r of this.rooms()) {
      const v = r?.config?.campus;
      if (v) set.add(String(v));
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  });

  buildings = computed(() => {
    const set = new Set<string>();
    for (const r of this.rooms()) {
      const v = r?.config?.building;
      if (v) set.add(String(v));
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  });

  roomTypes = computed(() => {
    const set = new Set<string>();
    for (const r of this.rooms()) {
      const v = r?.config?.roomType;
      if (v) set.add(String(v));
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  });

  filteredRooms = computed(() => {
    const q = this.norm(this.searchText());
    const campus = this.norm(this.campusFilter());
    const building = this.norm(this.buildingFilter());
    const roomType = this.norm(this.roomTypeFilter());

    return this.rooms().filter((r) => {
      const cfg = r?.config ?? {};

      const c = this.norm(cfg.campus);
      const b = this.norm(cfg.building);
      const room = this.norm(cfg.room);
      const ip = this.norm((cfg as any).ip);
      const t = this.norm(cfg.roomType);

      if (campus && c !== campus) return false;
      if (building && b !== building) return false;
      if (roomType && t !== roomType) return false;

      if (!q) return true;

      const haystack = `${c} ${b} ${room} ${ip} ${t}`;
      return haystack.includes(q);
    });
  });

  constructor(
    private http: HttpClient,
    public auth: AuthService
  ) {}

  ngOnInit(): void {
    this.loadRooms();
  }

  loadRooms(): void {
    // If you later add an HTTP interceptor, you can remove the manual header below.
    const token = this.auth.token();

    if (!token) {
      // For now, just surface a friendly message; routing guard will handle this later.
      this.errorMessage.set('Not logged in. Please login to view rooms.');
      this.rooms.set([]);
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');

    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });

    this.http.get<RoomDoc[]>(`${this.apiBase}/rooms`, { headers }).subscribe({
      next: (data) => {
        this.rooms.set(Array.isArray(data) ? data : []);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to load rooms:', err);
        this.isLoading.set(false);

        const apiErr = err?.error;
        const msg =
          apiErr?.error ||
          apiErr?.message ||
          err?.message ||
          'Failed to load rooms.';

        this.errorMessage.set(msg);
      },
    });
  }
}
