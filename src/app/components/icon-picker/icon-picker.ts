import {
  Component,
  ElementRef,
  forwardRef,
  HostListener,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

export const SOURCE_ICONS: { value: string; label: string }[] = [
  { value: 'laptop',          label: 'Laptop' },
  { value: 'desktop_windows', label: 'Desktop' },
  { value: 'tv',              label: 'Display / TV' },
  { value: 'cast',            label: 'Wireless Cast' },
  { value: 'videocam',        label: 'Camera' },
  { value: 'mic',             label: 'Microphone' },
  { value: 'tablet',          label: 'Tablet' },
  { value: 'phone_android',   label: 'Phone' },
  { value: 'cable',           label: 'HDMI / Cable' },
  { value: 'screen_share',    label: 'Screen Share' },
];

@Component({
  selector: 'app-icon-picker',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => IconPickerComponent),
      multi: true,
    },
  ],
  template: `
    <div class="ip-host">
      <button type="button" class="ip-trigger" (click)="toggle($event)">
        @if (value()) {
          <mat-icon class="ip-icon">{{ value() }}</mat-icon>
        } @else {
          <span class="ip-empty">—</span>
        }
        <mat-icon class="ip-chevron">{{ open() ? 'expand_less' : 'expand_more' }}</mat-icon>
      </button>

      @if (open()) {
        <div class="ip-dropdown" [style.top.px]="dropdownTop" [style.left.px]="dropdownLeft">
          <div class="ip-option ip-option--none" (click)="select('', $event)">
            <span>—</span>
          </div>
          @for (ico of icons; track ico.value) {
            <div
              class="ip-option"
              [class.ip-option--selected]="value() === ico.value"
              (click)="select(ico.value, $event)"
              [title]="ico.label"
            >
              <mat-icon class="ip-icon">{{ ico.value }}</mat-icon>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: inline-block; }

    .ip-host {
      position: relative;
      display: inline-block;
    }

    .ip-trigger {
      display: flex;
      align-items: center;
      gap: 4px;
      height: 32px;
      padding: 0 6px;
      border: 1px solid #ccc;
      border-radius: 4px;
      background: #fff;
      cursor: pointer;
      color: #333;

      &:hover { border-color: #999; }
    }

    .ip-empty {
      color: #aaa;
      font-size: 14px;
      width: 20px;
      text-align: center;
    }

    .ip-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
      flex-shrink: 0;
    }

    .ip-chevron {
      font-size: 16px;
      width: 16px;
      height: 16px;
      color: #888;
    }

    .ip-dropdown {
      position: fixed;
      z-index: 9999;
      background: #fff;
      border: 1px solid #ccc;
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      display: flex;
      flex-direction: row;
      flex-wrap: wrap;
      width: 220px;
      padding: 4px;
      gap: 2px;
    }

    .ip-option {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border-radius: 4px;
      cursor: pointer;

      &:hover { background: #f0f4ff; }
      &--selected { background: #e8f0fe; }
      &--none {
        font-size: 14px;
        color: #aaa;
      }
    }
  `],
})
export class IconPickerComponent implements ControlValueAccessor {
  readonly icons = SOURCE_ICONS;
  value = signal('');
  open = signal(false);
  disabled = signal(false);
  dropdownTop = 0;
  dropdownLeft = 0;

  private onChange: (v: string) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(private el: ElementRef) {}

  toggle(e: Event): void {
    e.stopPropagation();
    if (this.disabled()) return;
    if (!this.open()) {
      const rect = (this.el.nativeElement as HTMLElement)
        .querySelector('.ip-trigger')!
        .getBoundingClientRect();
      this.dropdownTop = rect.bottom + 4;
      this.dropdownLeft = rect.left;
    }
    this.open.update(v => !v);
  }

  select(val: string, e: Event): void {
    e.stopPropagation();
    this.value.set(val);
    this.open.set(false);
    this.onChange(val);
    this.onTouched();
  }

  @HostListener('document:click')
  onDocClick(): void {
    this.open.set(false);
  }

  writeValue(val: string): void { this.value.set(val ?? ''); }
  registerOnChange(fn: (v: string) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(d: boolean): void { this.disabled.set(d); }
}
