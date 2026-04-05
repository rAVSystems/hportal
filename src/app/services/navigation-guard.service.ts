import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class NavigationGuardService {
  private _isDirty = signal(false);

  readonly isDirty = this._isDirty.asReadonly();

  setDirty(dirty: boolean): void {
    this._isDirty.set(dirty);
  }
}
