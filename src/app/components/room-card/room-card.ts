import { Component, computed, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatRippleModule } from '@angular/material/core';
import { MqttService } from '../../services/mqtt.service';

export type RoomDoc = {
  _id: string;
  config?: {
    campus?: string;
    building?: string;
    room?: string;
    roomType?: string;
    version?: string;
    sla?: string;
    slaExpiredAt?: string;
    [key: string]: unknown;
  };
};

const DEFAULT_CONFIG = {
  campus: '',
  building: '',
  room: '',
  roomType: '',
  version: '',
  sla: '',
  slaExpiredAt: '',
  ip: '',
} as const;

@Component({
  selector: 'app-room-card',
  standalone: true,
  imports: [CommonModule, RouterModule, MatCardModule, MatButtonModule, MatIconModule, MatRippleModule],
  templateUrl: './room-card.html',
  styleUrl: './room-card.scss',
})
export class RoomCard {
  readonly room = input.required<RoomDoc>();

  readonly cfg = computed(() => {
    const r = this.room();
    return { ...DEFAULT_CONFIG, ...(r?.config ?? {}) };
  });

  private router = inject(Router);
  private mqtt = inject(MqttService);

  showGuiModal = signal(false);
  showAdvancedPanel = signal(false);

  /** Live state from MQTT for this room */
  readonly state = computed(() => this.mqtt.roomStates()[this.room()._id]);

  readonly occupied    = computed(() => this.state()?.occupied    ?? false);
  readonly systemOn    = computed(() => this.state()?.systemOn    ?? false);
  readonly recording   = computed(() => this.state()?.recording   ?? false);
  readonly online      = computed(() => this.state() != null);
  readonly temp        = computed(() => this.state()?.temp        ?? null);
  readonly lampHours   = computed(() => this.state()?.lampHours   ?? 0);

  readonly lampMax = 20000;
  readonly lampRadius = 16;
  readonly lampCircumference = 2 * Math.PI * this.lampRadius;

  readonly lampDashOffset = computed(() => {
    const pct = Math.min(this.lampHours() / this.lampMax, 1);
    return this.lampCircumference * (1 - pct);
  });

  readonly lampColor = computed(() => {
    const h = this.lampHours();
    if (h >= 15000) return '#e53935';
    if (h >= 10000) return '#f9a825';
    return '#43a047';
  });

  readonly tempHigh = computed(() => {
    const t = this.temp();
    return t != null && t > 40;
  });

  goToControl(mode: 'inroom' | 'advanced' = 'inroom') {
    const id = this.room()._id;
    const cfg = this.cfg();
    this.router.navigate(['/control', id, cfg.ip], {
      queryParams: { building: cfg.building, room: cfg.room, mode }
    });
  }

  cardTypeClasses() {
    const type = this.cfg().roomType ?? '';
    return {
      'type-classroom': type === 'Classroom' || type === 'Large Classroom',
      'type-conference': type === 'Conference Room',
      'type-lecture': type === 'Lecture Hall',
      'type-seminar': type === 'Seminar Room'
    };
  }
}
