import { Component, computed, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatRippleModule } from '@angular/material/core';

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
    return {
      ...DEFAULT_CONFIG,
      ...(r?.config ?? {}),
    };
  });

  private router = inject(Router);

  showGuiModal = signal(false);

  goToControl() {
    const id = this.room()._id;
    const cfg = this.cfg();
    this.router.navigate(['/control', id, cfg.ip], {
      queryParams: { building: cfg.building, room: cfg.room }
    });
  }

  readonly occupied = true;
  readonly systemActive = true;
  readonly recording = true;
  readonly lampHours = 4598;
  readonly lampMax = 20000;
  readonly lampRadius = 16;
  readonly lampCircumference = 2 * Math.PI * this.lampRadius;

  get lampDashOffset(): number {
    const pct = Math.min(this.lampHours / this.lampMax, 1);
    return this.lampCircumference * (1 - pct);
  }

  get lampColor(): string {
    if (this.lampHours >= 15000) return '#e53935';
    if (this.lampHours >= 10000) return '#fdd835';
    return '#43a047';
  }

  cardTypeClasses() {
    const type = this.cfg().roomType ?? '';

    return {
      'type-classroom': type === 'Classroom' || 'Large Classroom',
      'type-conference': type === 'Conference Room',
      'type-lecture': type === 'Lecture Hall',
      'type-seminar': type === 'Seminar Room'
    };
  }
}
