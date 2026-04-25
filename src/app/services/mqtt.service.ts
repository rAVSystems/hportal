import { Injectable, OnDestroy, signal } from '@angular/core';
import mqtt, { MqttClient } from 'mqtt';

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

  /** Map of roomId → latest state from MQTT */
  readonly roomStates = signal<Record<string, RoomState>>({});

  /** Connection status */
  readonly connected = signal(false);

  private readonly BROKER_URL = `ws://${window.location.hostname}:9001`;
  private readonly TOPIC = 'av/rooms/+/state';

  constructor() {
    this.connect();
  }

  private connect(): void {
    this.client = mqtt.connect(this.BROKER_URL, {
      reconnectPeriod: 5000,
      connectTimeout: 10000,
      keepalive: 10,  // send ping every 10s — detects disconnect within ~10-15s
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

  /** Get latest state for a specific room (undefined if not yet received) */
  getState(roomId: string): RoomState | undefined {
    return this.roomStates()[roomId];
  }

  ngOnDestroy(): void {
    this.client?.end();
  }
}
