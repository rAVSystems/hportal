import { Component, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatBadge } from '@angular/material/badge';

export type RoomDoc = {
  _id: string;
  config?: {
    campus?: string;
    building?: string;
    room?: string;
    roomType?: string;
    version?: string;
    [key: string]: unknown;
  };
};

const DEFAULT_CONFIG = {
  campus: '',
  building: '',
  room: '',
  roomType: '',
  version: '',
} as const;

@Component({
  selector: 'app-room-card',
  standalone: true,
  imports: [CommonModule, RouterModule, MatCardModule, MatButtonModule, MatBadge],
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

  cardTypeClasses() {
    const type = this.cfg().roomType ?? '';

    return {
      'type-classroom': type === 'Classroom',
      'type-conference': type === 'Conference Room',
      'type-lecture': type === 'Lecture Hall',
    };
  }
}
