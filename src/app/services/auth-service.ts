import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

export type Role = 'admin' | 'editor' | 'viewer';

export interface AuthUser {
  username: string;
  roles: Role[];
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private http = inject(HttpClient);

  // Raspberry Pi API base URL
  private apiBase = 'http://192.168.1.225:8080';

  private readonly tokenKey = 'avportal_token';
  private readonly userKey = 'avportal_user';

  private readonly tokenSig = signal<string | null>(localStorage.getItem(this.tokenKey));
  private readonly userSig = signal<AuthUser | null>(this.readUserFromStorage());

  // Read-only signals for components
  readonly token = this.tokenSig.asReadonly();
  readonly user = this.userSig.asReadonly();
  readonly isLoggedIn = computed(() => !!this.tokenSig());

  private readUserFromStorage(): AuthUser | null {
    const raw = localStorage.getItem(this.userKey);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  }

  private saveAuth(auth: AuthResponse) {
    this.tokenSig.set(auth.token);
    this.userSig.set(auth.user);
    localStorage.setItem(this.tokenKey, auth.token);
    localStorage.setItem(this.userKey, JSON.stringify(auth.user));
  }

  logout() {
    this.tokenSig.set(null);
    this.userSig.set(null);
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
  }

  hasRole(role: Role): boolean {
    const u = this.userSig();
    if (!u) return false;
    return (u.roles || []).includes(role);
  }

  register(username: string, password: string, role: 'viewer' | 'editor' = 'editor'): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.apiBase}/auth/register`, { username, password, role })
      .pipe(
        tap((auth) => this.saveAuth(auth))
      );
  }

  login(username: string, password: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.apiBase}/auth/login`, { username, password })
      .pipe(
        tap((auth) => this.saveAuth(auth))
      );
  }
}