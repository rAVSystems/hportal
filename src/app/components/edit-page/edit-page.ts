import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { finalize } from 'rxjs/operators';

type RoomConfigDoc = {
  _id: string;
  config: any;
};

type ActionType =
  | 'TurnOn'
  | 'TurnOff'
  | 'RouteVideo'
  | 'TogglePage'
  | 'ShowPage'
  | 'HidePage'
  | 'StartAutoshutdown';

type Option = { value: string; label: string };

type EditorContext = {
  deviceIds: string[];
  pageIds: string[];
  layerIds: string[];
  transitions: string[];
};

type FieldSpec = {
  key: string;
  label: string;
  kind: 'text' | 'number' | 'select';
  required?: boolean;
  options?: (ctx: EditorContext) => Option[];
};

@Component({
  selector: 'app-edit-page',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    MatDatepickerModule,
    MatNativeDateModule,
  ],
  templateUrl: './edit-page.html',
  styleUrl: './edit-page.scss',
})
export class EditPage implements OnInit {
  /** UI state */
  loading = signal(true);
  loadError = signal<string | null>(null);
  saving = signal(false);

  /** Route param */
  roomId: string = '';

  /** Dropdowns */
  roomTypes: string[] = ['Classroom', 'Conference Room', 'Lecture Hall', 'Other'];

  // Options used by select fields (populated from loaded config)
  readonly ctx = signal<EditorContext>({
    deviceIds: [],
    pageIds: [],
    layerIds: [],
    transitions: ['None'],
  });

  /** Action schema registry */
  readonly actionSpecs: Record<ActionType, FieldSpec[]> = {
    TurnOn: [
      {
        key: 'device',
        label: 'Device',
        kind: 'select',
        required: true,
        options: (c) => c.deviceIds.map((d) => ({ value: d, label: d })),
      },
    ],
    TurnOff: [
      {
        key: 'device',
        label: 'Device',
        kind: 'select',
        required: true,
        options: (c) => c.deviceIds.map((d) => ({ value: d, label: d })),
      },
    ],
    RouteVideo: [
      {
        key: 'device',
        label: 'Device',
        kind: 'select',
        required: true,
        options: (c) => c.deviceIds.map((d) => ({ value: d, label: d })),
      },
      { key: 'input', label: 'Input', kind: 'text', required: true },
      { key: 'output', label: 'Output', kind: 'text', required: true },
    ],
    TogglePage: [
      {
        key: 'page',
        label: 'Page',
        kind: 'select',
        required: true,
        options: (c) => c.pageIds.map((p) => ({ value: p, label: p })),
      },
      { key: 'layer', label: 'Layer', kind: 'text' },
      {
        key: 'transition',
        label: 'Transition',
        kind: 'select',
        options: (c) => c.transitions.map((t) => ({ value: t, label: t })),
      },
    ],
    ShowPage: [
      {
        key: 'page',
        label: 'Page',
        kind: 'select',
        required: true,
        options: (c) => c.pageIds.map((p) => ({ value: p, label: p })),
      },
      { key: 'layer', label: 'Layer', kind: 'text' },
      {
        key: 'transition',
        label: 'Transition',
        kind: 'select',
        options: (c) => c.transitions.map((t) => ({ value: t, label: t })),
      },
    ],
    HidePage: [
      {
        key: 'page',
        label: 'Page',
        kind: 'select',
        required: true,
        options: (c) => c.pageIds.map((p) => ({ value: p, label: p })),
      },
      { key: 'layer', label: 'Layer', kind: 'text' },
      {
        key: 'transition',
        label: 'Transition',
        kind: 'select',
        options: (c) => c.transitions.map((t) => ({ value: t, label: t })),
      },
    ],
    StartAutoshutdown: [
      { key: 'seconds', label: 'Seconds', kind: 'number', required: true },
    ],
  };

  actionTypes: ActionType[] = Object.keys(this.actionSpecs) as ActionType[];

  /** Form */
  form!: FormGroup;

  constructor(
    private readonly fb: FormBuilder,
    private readonly http: HttpClient,
    private readonly route: ActivatedRoute,
    private readonly router: Router
  ) {
    this.form = this.fb.group({
      campus: ['', Validators.required],
      building: ['', Validators.required],
      room: ['', Validators.required],
      ip: ['', Validators.required],
      roomType: ['Other'],
      version: [1],
      updatedBy: [''],

      // These are bound to mat-datepicker -> Date | null
      updatedAt: [null as Date | null],

      // SLA fields
      sla: [''],
      slaExpireAt: [null as Date | null],

      // Arrays
      SystemOnActions: this.fb.array([]),
      SystemOffActions: this.fb.array([]),
    });
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.loading.set(false);
      this.loadError.set('Missing room id in route.');
      return;
    }

    this.roomId = id;
    this.fetchRoom();
  }

  /** Convenience getters used by the template */
  get systemOnActions(): FormArray {
    return this.form.get('SystemOnActions') as FormArray;
  }

  get systemOffActions(): FormArray {
    return this.form.get('SystemOffActions') as FormArray;
  }

  /** API base (keep simple for now; you can move this to environment.ts later) */
  private apiBase(): string {
    return (window as any).API_BASE_URL || 'http://192.168.1.225:8080';
  }

  private fetchRoom(): void {
    this.loading.set(true);
    this.loadError.set(null);

    const url = `${this.apiBase()}/rooms/${this.roomId}`;

    this.http
      .get<RoomConfigDoc>(url)
      .pipe(
        finalize(() => {
          this.loading.set(false);
        })
      )
      .subscribe({
        next: (doc) => {
          try {
            const cfg = doc?.config ?? {};
            this.applyConfigToForm(cfg);
          } catch (e: any) {
            console.error('Failed while applying config to form', e);
            this.loadError.set(
              e?.message || 'Loaded config but failed to apply it to the form.'
            );
          }
        },
        error: (err: HttpErrorResponse) => {
          console.error('Failed to load room config', err);
          this.loadError.set(
            err?.error?.error || err?.message || 'Failed to load room config.'
          );
        },
      });
  }

  private applyConfigToForm(cfg: any): void {
    // Patch simple fields
    this.form.patchValue({
      campus: cfg.campus ?? '',
      building: cfg.building ?? '',
      room: cfg.room ?? '',
      ip: cfg.ip ?? '',
      roomType: cfg.roomType ?? 'Other',
      version: cfg.version ?? 1,
      updatedBy: cfg.updatedBy ?? '',
      updatedAt: this.parseDate(cfg.updatedAt),
      sla: cfg.sla ?? '',
      slaExpireAt: this.parseDate(cfg.slaExpireAt),
    });

    // Populate select options from config
    const deviceIds = Object.keys(cfg?.Devices ?? {});
    const pageIds = Array.isArray(cfg?.Pages)
      ? cfg.Pages.map((p: any) => p?.Id).filter(Boolean)
      : [];
    const transitions = ['None', 'Fade', 'Slide'];

    this.ctx.set({
      deviceIds,
      pageIds,
      layerIds: [],
      transitions,
    });

    // Rebuild action arrays
    this.resetActionsArray(this.systemOnActions, cfg.SystemOnActions);
    this.resetActionsArray(this.systemOffActions, cfg.SystemOffActions);

    // If there are no actions yet, give the user one empty row (optional)
    if (this.systemOnActions.length === 0) this.addSystemOnAction();
    if (this.systemOffActions.length === 0) this.addSystemOffAction();
  }

  private resetActionsArray(arr: FormArray, values: any): void {
    arr.clear();

    const list: any[] = Array.isArray(values) ? values : [];
    for (const a of list) {
      arr.push(this.createActionGroup(a));
    }
  }

  private buildParamsGroup(type: ActionType, seed?: any): FormGroup {
    const fields = this.actionSpecs[type] ?? [];
    const s = seed ?? {};

    const controls: Record<string, any> = {};
    for (const f of fields) {
      const v = s[f.key] ?? (f.kind === 'number' ? null : '');
      controls[f.key] = f.required ? [v, Validators.required] : [v];
    }

    return this.fb.group(controls);
  }

  private createActionGroup(seed?: any): FormGroup {
    const s = seed ?? {};
    const type = (s.action || 'TurnOn') as ActionType;

    // seedWithoutAction is used to pre-fill params from the flat object
    const { action, ...seedWithoutAction } = s;

    const group = this.fb.group({
      action: this.fb.control<ActionType>(type, {
        nonNullable: true,
        validators: [Validators.required],
      }),
      params: this.buildParamsGroup(type, seedWithoutAction),
    });

    // When action type changes, rebuild params group (keep any overlapping values)
    group.get('action')!.valueChanges.subscribe((newType) => {
      const current = (group.get('params') as FormGroup).getRawValue();
      group.setControl('params', this.buildParamsGroup(newType, current));
    });

    return group;
  }

  // Template helpers for dynamic action rendering
  getActionTypeAt(arr: FormArray, index: number): ActionType {
    return (arr.at(index) as FormGroup).get('action')?.value as ActionType;
  }

  getFieldSpecsFor(arr: FormArray, index: number): FieldSpec[] {
    const t = this.getActionTypeAt(arr, index);
    return this.actionSpecs[t] ?? [];
  }

  getOptionsForField(field: FieldSpec): Option[] {
    if (!field?.options) return [];
    return field.options(this.ctx());
  }

  addSystemOnAction(): void {
    this.systemOnActions.push(this.createActionGroup());
  }

  removeSystemOnAction(index: number): void {
    this.systemOnActions.removeAt(index);
  }

  addSystemOffAction(): void {
    this.systemOffActions.push(this.createActionGroup());
  }

  removeSystemOffAction(index: number): void {
    this.systemOffActions.removeAt(index);
  }

  onCancel(): void {
    this.router.navigate(['/monitor']);
  }

  onSave(): void {
    if (this.form.invalid || this.saving()) return;

    this.saving.set(true);

    const raw = this.form.getRawValue() as any;

    const flattenActions = (list: any[]) =>
      (Array.isArray(list) ? list : []).map((row) => ({
        action: row?.action,
        ...(row?.params ?? {}),
      }));

    const configToSave = {
      ...raw,
      roomId: this.roomId,
      updatedAt: this.toIsoOrNull(raw.updatedAt),
      slaExpireAt: this.toIsoOrNull(raw.slaExpireAt),
      SystemOnActions: flattenActions(raw.SystemOnActions),
      SystemOffActions: flattenActions(raw.SystemOffActions),
    };

    const url = `${this.apiBase()}/rooms/${this.roomId}`;

    this.http.put(url, { config: configToSave }).subscribe({
      next: () => {
        this.saving.set(false);
        this.router.navigate(['/monitor']);
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.loadError.set(err?.error?.error || err?.message || 'Save failed.');
      },
    });
  }

  private parseDate(value: any): Date | null {
    if (!value) return null;

    // Already a Date
    if (value instanceof Date) return value;

    // ISO string
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  private toIsoOrNull(value: any): string | null {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
}
