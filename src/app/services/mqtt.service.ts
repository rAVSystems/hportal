import { Injectable, OnDestroy, signal } from '@angular/core';
import mqtt, { MqttClient } from 'mqtt';
import { environment } from '../../environments/environment';

export interface RoomState {
  roomId: string;
  updatedAt?: string;
  systemOn?: boolean;
  recording?: boolean;
  source?: string;
  temp?: number;
  lampHours?: number;
  occupied?: boolean;
  online?: boolean;
  [key: string]: unknown;
}

@Injectable({ providedIn: 'root' })
export class MqttService implements OnDestroy {
  private client: MqttClient | null = null;

  readonly roomStates = signal<Record<string, RoomState>>({});
  readonly connected = signal(false);

  private readonly BROKER_URL = `ws://${window.location.hostname}:9001`;
  private readonly API_BASE = environment.apiUrl;
  private readonly TOPIC = 'av/rooms/+/state';

  constructor() {
    this.loadInitialState();
    this.connect();
  }

  private loadInitialState(): void {
    fetch(`${this.API_BASE}/rooms/states`)
      .then(r => r.json())
      .then((docs: RoomState[]) => {
        if (!Array.isArray(docs)) return;
        const map: Record<string, RoomState> = {};
        for (const doc of docs) {
          const roomId = (doc as any)._id ?? doc.roomId;
          if (roomId) map[roomId] = { ...doc, roomId };
        }
        // Merge with any MQTT updates already received
        this.roomStates.update(current => ({ ...map, ...current }));
      })
      .catch(() => {});
  }

  private connect(): void {
    this.client = mqtt.connect(this.BROKER_URL, {
      reconnectPeriod: 5000,
      connectTimeout: 10000,
      keepalive: 10,
      clientId: `av-portal-${Math.random().toString(16).slice(2, 10)}`,
    });

    this.client.on('connect', () => {
      this.connected.set(true);
      this.client!.subscribe(this.TOPIC, { qos: 0 });
    });

    this.client.on('disconnect', () => this.connected.set(false));
    this.client.on('offline', () => this.connected.set(false));
    this.client.on('error', () => this.connected.set(false));

    this.client.on('message', (topic: string, payload: Buffer) => {
      try {
        const state: RoomState = JSON.parse(payload.toString());
        const roomId = state.roomId ?? topic.split('/')[2];
        if (!roomId) return;
        this.roomStates.update(map => ({ ...map, [roomId]: { ...state, roomId, online: true } }));
      } catch {
        // malformed payload — ignore
      }
    });
  }

  getState(roomId: string): RoomState | undefined {
    return this.roomStates()[roomId];
  }

  ngOnDestroy(): void {
    this.client?.end();
  }
}
