import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
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
  imports: [CommonModule, RoomCard],
  templateUrl: './monitor-page.html',
  styleUrls: ['./monitor-page.scss'],
})
export class MonitorPage implements OnInit {
  // Keep this consistent with AuthService/api setup
  private readonly apiBase = 'http://192.168.1.225:8080';

  rooms = signal<RoomDoc[]>([]);
  isLoading = signal(false);
  errorMessage = signal<string>('');

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
