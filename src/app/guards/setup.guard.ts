import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { map, catchError, of } from 'rxjs';
import { environment } from '../../environments/environment';

const API_BASE = environment.apiUrl;

// Redirects to /setup if setupComplete is false
export const requireSetupGuard: CanActivateFn = () => {
  const http = inject(HttpClient);
  const router = inject(Router);

  return http.get<{ setupComplete: boolean }>(`${API_BASE}/settings/status`).pipe(
    map((status) => status.setupComplete ? true : router.createUrlTree(['/setup'])),
    catchError(() => of(true)), // if API is unreachable, don't block
  );
};

// Used on /setup itself — redirect away if already set up
export const setupGuard: CanActivateFn = () => {
  const http = inject(HttpClient);
  const router = inject(Router);

  return http.get<{ setupComplete: boolean }>(`${API_BASE}/settings/status`).pipe(
    map((status) => status.setupComplete ? router.createUrlTree(['/login']) : true),
    catchError(() => of(true)),
  );
};
