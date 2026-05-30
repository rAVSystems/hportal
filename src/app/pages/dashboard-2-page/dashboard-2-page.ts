import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router, RouterModule } from '@angular/router';

import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

import { AuthService } from '../../services/auth-service';
import { MqttService } from '../../services/mqtt.service';
import { RoomCard } from '../../components/room-card/room-card';
import { environment } from '../../../environments/environment';

interface TemplateDoc {
  _id: string;
  name: string;
}

export type RoomDoc = {
  _id: string;
  config: {
    campus?: string;
    building?: string;
    room?: string;
    roomType?: string;
    version?: string;
    ip?: string;
    [key: string]: unknown;
  };
};

type SortColumn = 'building' | 'room' | 'campus' | 'roomType' | 'ip' | 'systemOn' | 'occupied' | 'online' | 'temp' | 'lampHours';
type SortDir = 'asc' | 'desc';

@Component({
  selector: 'app-dashboard-2-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    RoomCard,
  ],
  templateUrl: './dashboard-2-page.html',
  styleUrl: './dashboard-2-page.scss',
})
export class Dashboard2Page implements OnInit {
  private readonly apiBase = environment.apiUrl;

  rooms = signal<RoomDoc[]>([]);
  isLoading = signal(false);
  errorMessage = signal('');

  searchText = signal('');
  campusFilter = signal('');
  buildingFilter = signal('');
  roomTypeFilter = signal('');
  filtersOpen = signal(false);

  sortCol = signal<SortColumn>('building');
  sortDir = signal<SortDir>('asc');

  showNewRoom = signal(false);
  newCampus = signal('');
  newBuilding = signal('');
  newRoom = signal('');
  newIp = signal('');
  newTemplateId = signal('');
  templates = signal<TemplateDoc[]>([]);
  newRoomSaving = signal(false);
  newRoomError = signal<string | null>(null);

  get newRoomFormValid(): boolean {
    return !!this.newCampus().trim() && !!this.newBuilding().trim() && !!this.newRoom().trim() && !!this.newIp().trim();
  }

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

  filteredSortedRooms = computed(() => {
    const q = this.norm(this.searchText());
    const campus = this.norm(this.campusFilter());
    const building = this.norm(this.buildingFilter());
    const roomType = this.norm(this.roomTypeFilter());
    const col = this.sortCol();
    const dir = this.sortDir();
    const states = this.mqtt.roomStates();

    const filtered = this.rooms().filter((r) => {
      const cfg = r?.config ?? {};
      const c = this.norm(cfg.campus);
      const b = this.norm(cfg.building);
      const room = this.norm(cfg.room);
      const ip = this.norm(cfg.ip);
      const t = this.norm(cfg.roomType);

      if (campus && c !== campus) return false;
      if (building && b !== building) return false;
      if (roomType && t !== roomType) return false;
      if (!q) return true;

      return `${c} ${b} ${room} ${ip} ${t}`.includes(q);
    });

    return filtered.slice().sort((a, b) => {
      const sa = states[a._id];
      const sb = states[b._id];
      let av: string | number | boolean = '';
      let bv: string | number | boolean = '';

      switch (col) {
        case 'building':  av = this.norm(a.config?.building);  bv = this.norm(b.config?.building);  break;
        case 'room':      av = this.norm(a.config?.room);      bv = this.norm(b.config?.room);      break;
        case 'campus':    av = this.norm(a.config?.campus);    bv = this.norm(b.config?.campus);    break;
        case 'roomType':  av = this.norm(a.config?.roomType);  bv = this.norm(b.config?.roomType);  break;
        case 'ip':        av = this.norm(a.config?.ip);        bv = this.norm(b.config?.ip);        break;
        case 'systemOn':  av = sa?.systemOn  ? 1 : 0;         bv = sb?.systemOn  ? 1 : 0;         break;
        case 'occupied':  av = sa?.occupied  ? 1 : 0;         bv = sb?.occupied  ? 1 : 0;         break;
        case 'online':    av = sa != null    ? 1 : 0;         bv = sb != null    ? 1 : 0;         break;
        case 'temp':      av = sa?.temp      ?? -1;           bv = sb?.temp      ?? -1;           break;
        case 'lampHours': av = sa?.lampHours ?? 0;            bv = sb?.lampHours ?? 0;            break;
      }

      if (av < bv) return dir === 'asc' ? -1 : 1;
      if (av > bv) return dir === 'asc' ? 1 : -1;
      return 0;
    });
  });

  constructor(
    private http: HttpClient,
    public auth: AuthService,
    private router: Router,
    public mqtt: MqttService,
  ) {}

  ngOnInit(): void {
    this.loadRooms();
  }

  loadRooms(): void {
    const token = this.auth.token();
    if (!token) {
      this.errorMessage.set('Not logged in.');
      return;
    }
    this.isLoading.set(true);
    this.http.get<RoomDoc[]>(`${this.apiBase}/rooms`, {
      headers: { Authorization: `Bearer ${token}` }
    }).subscribe({
      next: (data) => { this.rooms.set(data); this.isLoading.set(false); },
      error: () => { this.errorMessage.set('Failed to load rooms.'); this.isLoading.set(false); }
    });
  }

  sort(col: SortColumn): void {
    if (this.sortCol() === col) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortCol.set(col);
      this.sortDir.set('asc');
    }
  }

  sortIcon(col: SortColumn): string {
    if (this.sortCol() !== col) return 'unfold_more';
    return this.sortDir() === 'asc' ? 'arrow_upward' : 'arrow_downward';
  }

  lampColor(hours: number): string {
    if (hours >= 15000) return '#e53935';
    if (hours >= 10000) return '#f9a825';
    return '#43a047';
  }

  viewMode = signal<'table' | 'cards'>('table');
  controlRoom = signal<RoomDoc | null>(null);

  goToRoom(id: string): void {
    this.router.navigate(['/edit', id]);
  }

  openControlModal(room: RoomDoc): void {
    this.controlRoom.set(room);
  }

  closeControlModal(): void {
    this.controlRoom.set(null);
  }

  goToControl(mode: 'inroom' | 'advanced'): void {
    const room = this.controlRoom();
    if (!room) return;
    const ip = room.config?.ip ?? '';
    this.router.navigate(['/control', room._id, ip], {
      queryParams: { building: room.config?.building, room: room.config?.room, mode }
    });
  }

  openNewRoom(): void {
    this.newCampus.set('');
    this.newBuilding.set('');
    this.newRoom.set('');
    this.newIp.set('');
    this.newTemplateId.set('');
    this.newRoomError.set(null);
    this.showNewRoom.set(true);
    this.http.get<TemplateDoc[]>(`${this.apiBase}/templates`, {
      headers: { Authorization: `Bearer ${this.auth.token()}` }
    }).subscribe({ next: (data) => this.templates.set(data), error: () => {} });
  }

  closeNewRoom(): void {
    this.showNewRoom.set(false);
  }

  private buildNewRoomConfig(templateConfig: any = {}): any {
    return {
      ...templateConfig,
      campus: this.newCampus().trim(),
      building: this.newBuilding().trim(),
      room: this.newRoom().trim(),
      ip: this.newIp().trim(),
    };
  }

  private withTemplate(fn: (config: any) => void): void {
    const templateId = this.newTemplateId();
    if (templateId) {
      this.http.get<any>(`${this.apiBase}/templates/${templateId}`, {
        headers: { Authorization: `Bearer ${this.auth.token()}` }
      }).subscribe({
        next: (tmpl) => fn(tmpl.config ?? {}),
        error: () => { this.newRoomSaving.set(false); this.newRoomError.set('Failed to load template.'); }
      });
    } else {
      fn({});
    }
  }

  createRoom(): void {
    if (!this.newRoomFormValid || this.newRoomSaving()) return;
    this.newRoomSaving.set(true);
    this.newRoomError.set(null);
    this.withTemplate((tmplConfig) => {
      const config = this.buildNewRoomConfig(tmplConfig);
      this.http.post<{ roomId: string }>(`${this.apiBase}/rooms`, config, {
        headers: { Authorization: `Bearer ${this.auth.token()}` }
      }).subscribe({
        next: () => { this.newRoomSaving.set(false); this.showNewRoom.set(false); this.loadRooms(); },
        error: (err) => { this.newRoomSaving.set(false); this.newRoomError.set(err?.error?.error || 'Failed to create room.'); }
      });
    });
  }

  customizeRoom(): void {
    if (!this.newRoomFormValid || this.newRoomSaving()) return;
    this.newRoomSaving.set(true);
    this.newRoomError.set(null);
    this.withTemplate((tmplConfig) => {
      const config = this.buildNewRoomConfig(tmplConfig);
      this.http.post<{ roomId: string }>(`${this.apiBase}/rooms`, config, {
        headers: { Authorization: `Bearer ${this.auth.token()}` }
      }).subscribe({
        next: (res) => { this.newRoomSaving.set(false); this.showNewRoom.set(false); this.router.navigate(['/edit', res.roomId]); },
        error: (err) => { this.newRoomSaving.set(false); this.newRoomError.set(err?.error?.error || 'Failed to create room.'); }
      });
    });
  }
}
