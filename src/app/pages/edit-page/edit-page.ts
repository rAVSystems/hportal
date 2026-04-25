import { CommonModule } from '@angular/common';
import { Component, OnDestroy, signal } from '@angular/core';
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
import { DragDropModule, CdkDragDrop } from '@angular/cdk/drag-drop';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { IconPickerComponent } from '../../components/icon-picker/icon-picker';
import { AuthService } from '../../services/auth-service';
import { NavigationGuardService } from '../../services/navigation-guard.service';

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
  | 'StartAutoshutdown'
  | 'SetGain'
  | 'MuteGain'
  | 'UnmuteGain'
  | 'ToggleMuteGain'
  | 'SetCameraPreset'
  | 'RecallCameraPreset'
  | 'RecallSnapshot';

type Option = { value: string; label: string };

type EditorContext = {
  allDevices: {
    id: string;
    friendlyName?: string;
    interfaces: string[];
    inputs?: { Name: string; Value: string }[];
    outputs?: { Name: string; Value: string }[];
  }[];
  pageIds: string[];
  layerIds: string[];
  transitions: string[];
  gainIds: string[];
};

type FieldSpec = {
  key: string;
  label: string;
  kind: 'text' | 'number' | 'select';
  required?: boolean;
  default?: any;
  min?: number;
  max?: number;
  options?: (ctx: EditorContext, group?: FormGroup) => Option[];
};

@Component({
  selector: 'app-edit-page',
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
    DragDropModule,
    MatCheckboxModule,
    IconPickerComponent,],
  templateUrl: './edit-page.html',
  styleUrl: './edit-page.scss',
})
export class EditPage implements OnDestroy {
/** UI state */
  loading = signal(true);
  loadError = signal<string | null>(null);
  saving = signal(false);
  showSaveModal = signal(false);
  /** TODO: wire to a live status endpoint — true when system is on or room is recording */
  roomInUse = signal(false);
  saveError = signal<string | null>(null);
  showCancelConfirm = signal(false);
  showDeleteConfirm = signal(false);
  deleteConfirmBuilding = signal('');
  deleting = signal(false);
  deleteError = signal<string | null>(null);
  showTemplateModal = signal(false);
  templatesLoading = signal(false);
  templatesError = signal<string | null>(null);
  templates = signal<{ _id: string; name: string; icon: string; createdby: string; created: string; permission: string }[]>([]);
  showSaveTemplateModal = signal(false);
  templateName = signal('');
  savingTemplate = signal(false);
  saveTemplateError = signal<string | null>(null);
  readonly panelOpenState = signal(false);
  activeSection = signal<string>('section-system-settings');
  private sectionObserver?: IntersectionObserver;


  /** Route param */
  roomId: string = '';

  /** Template editing mode */
  templateMode = signal(false);
  templateId: string = '';
  editingTemplateName = signal('');

  /** Dropdowns */
  roomTypes = signal<string[]>([
    'Classroom',
    'Large Classroom',
    'Conference Room',
    'Lecture Hall',
    'Seminar Room',
    'All-In-One Conference Room',
    'Science Lab',
    'Dining Hall'
  ]);

  /** Maps "arrayName-index" -> selected deviceId, so template can react to device selection */
  selectedDevices = signal<Record<string, string>>({});

  // Options used by select fields (populated from loaded config)
  readonly ctx = signal<EditorContext>({
    allDevices: [],
    pageIds: [],
    layerIds: [],
    transitions: ['None'],
    gainIds: [],
  });

  /** Action schema registry */
  readonly actionSpecs: Record<ActionType, FieldSpec[]> = {
    TurnOn: [
      {
        key: 'device',
        label: 'Device',
        kind: 'select',
        required: true,
        options: (c) => [
          { value: 'System', label: 'System' },
          ...c.allDevices
            .filter((d) =>
              d.interfaces.some((i) =>
                ['display', 'projector'].includes(i.toLowerCase())
              )
            )
            .map((d) => ({ value: d.id, label: d.friendlyName ?? d.id })),
        ],
      },
    ],
    TurnOff: [
      {
        key: 'device',
        label: 'Device',
        kind: 'select',
        required: true,
        options: (c) => [
          { value: 'System', label: 'System' },
          ...c.allDevices
            .filter((d) =>
              d.interfaces.some((i) =>
                ['display', 'projector'].includes(i.toLowerCase())
              )
            )
            .map((d) => ({ value: d.id, label: d.friendlyName ?? d.id })),
        ],
      },
    ],
    RouteVideo: [
      {
        key: 'device',
        label: 'Device',
        kind: 'select',
        required: true,
        options: (c) =>
          c.allDevices
            .filter((d) =>
              d.interfaces.some((i) =>
                i.toLowerCase().includes('switcher') ||
                i.toLowerCase().includes('decoder')
              )
            )
            .map((d) => ({ value: d.id, label: d.friendlyName ?? d.id })),
      },
      {
        key: 'input',
        label: 'Input',
        kind: 'select',
        required: true,
        options: (ctx, group) => {
          const deviceId =
            group?.get('device')?.value ??
            group?.get('params.device')?.value ??
            group?.get('params')?.get('device')?.value;

          if (!deviceId) return [];

          const selected = ctx.allDevices.find((d) => d.id === deviceId);
          if (!selected) return [];

          const interfaces = (selected.interfaces ?? []).map((i) => i.toLowerCase());
          const isDecoder = interfaces.some((i) => i.includes('decoder'));

          const options: Option[] = [];

          // 1) Always include the device's own inputs (if any)
          if (Array.isArray(selected.inputs) && selected.inputs.length) {
            selected.inputs.forEach((inp) => {
              options.push({
                value: inp.Value,
                label: inp.Name,
              });
            });
          }

          // 2) If this is a decoder, also include ALL encoder inputs
          if (isDecoder) {
            const encoders = ctx.allDevices.filter((d) =>
              (d.interfaces ?? []).some((i) => i.toLowerCase().includes('encoder'))
            );

            encoders.forEach((enc) => {
              if (Array.isArray(enc.inputs) && enc.inputs.length) {
                enc.inputs
                  .filter((inp) => inp.Name !== 'Clear')
                  .forEach((inp) => {
                    options.push({
                      value: inp.Value,
                      label: `[${enc.friendlyName ?? enc.id}] ${inp.Name}`,
                    });
                  });
              }
            });
          }

          return options;
        },
      },
      {
        key: 'output',
        label: 'Output',
        kind: 'select',
        required: true,
        options: (ctx, group) => {
          const deviceId =
            group?.get('device')?.value ??
            group?.get('params.device')?.value ??
            group?.get('params')?.get('device')?.value;

          if (!deviceId) return [];

          const selected = ctx.allDevices.find((d) => d.id === deviceId);
          if (!selected) return [];

          // Always return physical outputs for the selected device (e.g., HDMI 1)
          if (!Array.isArray(selected.outputs) || !selected.outputs.length) {
            return [];
          }

          return selected.outputs.map((out) => ({
            value: out.Value,
            label: out.Name,
          }));
        },
      },
    ],
    TogglePage: [
      { key: 'page', label: 'UI', kind: 'select', required: true, options: () => [{ value: 'In-Room', label: 'In-Room' }, { value: 'Advanced', label: 'Advanced' }] },
      {
        key: 'layer',
        label: 'Page',
        kind: 'select',
        options: (c) => c.pageIds.map((p) => ({ value: p, label: p })),
      },
      {
        key: 'transition',
        label: 'Transition',
        kind: 'select',
        options: (c) => c.transitions.map((t) => ({ value: t, label: t })),
      },
    ],
    ShowPage: [
      { key: 'page', label: 'UI', kind: 'select', required: true, default: 'In-Room', options: () => [{ value: 'In-Room', label: 'In-Room' }, { value: 'Advanced', label: 'Advanced' }] },
      {
        key: 'layer',
        label: 'Page',
        kind: 'select',
        options: (c) => c.pageIds.map((p) => ({ value: p, label: p })),
      },
      {
        key: 'transition',
        label: 'Transition',
        kind: 'select',
        options: (c) => c.transitions.map((t) => ({ value: t, label: t })),
      },
    ],
    HidePage: [
      { key: 'page', label: 'UI', kind: 'select', required: true, default: 'In-Room', options: () => [{ value: 'In-Room', label: 'In-Room' }, { value: 'Advanced', label: 'Advanced' }] },
      {
        key: 'layer',
        label: 'Page',
        kind: 'select',
        options: (c) => c.pageIds.map((p) => ({ value: p, label: p })),
      },
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
    SetGain: [
      {
        key: 'gain',
        label: 'Gain',
        kind: 'select',
        required: true,
        options: (c) => c.gainIds.map((g) => ({ value: g, label: g })),
      },
      { key: 'level', label: 'Level', kind: 'number', required: true, min: 0, max: 100 },
    ],
    SetCameraPreset: [
      {
        key: 'camera', label: 'Camera', kind: 'select', required: true,
        options: (c) => [
          { value: 'selected', label: 'Selected Camera' },
          ...c.allDevices
            .filter(d => d.interfaces.some(i => i.toLowerCase() === 'camera'))
            .map(d => ({ value: d.id, label: d.friendlyName || d.id })),
        ],
      },
      { key: 'preset', label: 'Preset', kind: 'text', required: true },
    ],
    RecallCameraPreset: [
      {
        key: 'camera', label: 'Camera', kind: 'select', required: true,
        options: (c) => [
          { value: 'selected', label: 'Selected Camera' },
          ...c.allDevices
            .filter(d => d.interfaces.some(i => i.toLowerCase() === 'camera'))
            .map(d => ({ value: d.id, label: d.friendlyName || d.id })),
        ],
      },
      { key: 'preset', label: 'Preset', kind: 'text', required: true },
    ],
    RecallSnapshot: [
      { key: 'snapshot', label: 'Snapshot', kind: 'text', required: true },
    ],
    MuteGain: [
      {
        key: 'gain',
        label: 'Gain',
        kind: 'select',
        required: true,
        options: (c) => c.gainIds.map((g) => ({ value: g, label: g })),
      },
    ],
    UnmuteGain: [
      {
        key: 'gain',
        label: 'Gain',
        kind: 'select',
        required: true,
        options: (c) => c.gainIds.map((g) => ({ value: g, label: g })),
      },
    ],
    ToggleMuteGain: [
      {
        key: 'gain',
        label: 'Gain',
        kind: 'select',
        required: true,
        options: (c) => c.gainIds.map((g) => ({ value: g, label: g })),
      },
    ],
  };

  readonly actionTypes = signal<ActionType[]>(
    Object.keys(this.actionSpecs) as ActionType[]
  );

  /** Form */
  form!: FormGroup;

  constructor(
    private readonly fb: FormBuilder,
    private readonly http: HttpClient,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    readonly auth: AuthService,
    private readonly navGuard: NavigationGuardService
  ) {
    this.form = this.fb.group({
      campus: ['', Validators.required],
      building: ['', Validators.required],
      room: ['', Validators.required],
      ip: ['', Validators.required],
      roomType: [''],
      version: [{ value: 1, disabled: true }],
      updatedBy: [''],

      // These are bound to mat-datepicker -> Date | null
      updatedAt: [null as Date | null],

      // SLA fields
      sla: [''],
      slaExpireAt: [null as Date | null],

      // Arrays
      SystemOnActions: this.fb.array([]),
      SystemOffActions: this.fb.array([]),
      ScheduledActions: this.fb.array([]),
      Sources: this.fb.array([]),
      Devices: this.fb.array([]),
      Gains: this.fb.array([]),
      Pages: this.fb.array([]),
    });

    this.devices.valueChanges.subscribe(() => this.syncCtxDevices());
    this.gains.valueChanges.subscribe(() => this.syncCtxGains());
  }

  private syncCtxDevices(): void {
    const allDevices = this.deviceControls.map((g) => {
      const raw = g.getRawValue();
      const ifaces = raw.Interfaces ?? {};
      return {
        id: raw.key ?? '',
        friendlyName: raw.FriendlyName ?? '',
        interfaces: Object.entries(ifaces).filter(([, v]) => v).map(([k]) => k),
        inputs: (raw.Inputs ?? []).map((c: any) => ({ Name: c.Name ?? '', Value: c.Value ?? '' })),
        outputs: (raw.Outputs ?? []).map((c: any) => ({ Name: c.Name ?? '', Value: c.Value ?? '' })),
      };
    });
    this.ctx.update(c => ({ ...c, allDevices }));
  }
  readonly interfaceOptions = ['switcher', 'display', 'encoder', 'decoder', 'camera', 'capture', 'wireless', 'network'];
  readonly controlTypeOptions = ['ip', 'qsys', 'rs232', 'cec'];
  expandedDevices = signal<Set<number>>(new Set());
  expandedGains = signal<Set<number>>(new Set());
  expandedSources = signal<Set<number>>(new Set());
  expandedScheduled = signal<Set<number>>(new Set());

  get devices(): FormArray {
    return this.form.get('Devices') as FormArray;
  }

  get canEditDeviceAdmin(): boolean {
    return this.auth.hasRole('admin');
  }

  get canEditDeviceCredentials(): boolean {
    return this.auth.hasRole('admin') || this.auth.hasRole('editor');
  }

  /** Admins only: add/remove pages, components, gains; edit keys */
  get canEditStructure(): boolean {
    return this.auth.hasRole('admin');
  }

  get deviceControls(): FormGroup[] {
    return this.devices.controls as FormGroup[];
  }

  private buildDeviceGroup(key: string = '', d: any = {}): FormGroup {
    const isAdmin = this.canEditDeviceAdmin;
    const adminState = (v: any) => isAdmin ? [v] : [{ value: v, disabled: true }];
    return this.fb.group({
      key: adminState(key),
      FriendlyName: adminState(d.FriendlyName ?? ''),
      Make: adminState(d.Make ?? ''),
      Model: adminState(d.Model ?? ''),
      IpAddress: [d.IpAddress ?? ''],
      Description: adminState(d.Description ?? ''),
      DefaultInput: adminState(d.DefaultInput ?? null),
      Username: [d.Username ?? ''],
      Password: [d.Password ?? ''],
      ControlType: adminState(d.ControlType ?? 'ip'),
      Interfaces: this.fb.group(
        Object.fromEntries(this.interfaceOptions.map(i => [i, isAdmin ? [(d.Interfaces ?? []).includes(i)] : [{ value: (d.Interfaces ?? []).includes(i), disabled: true }]]))
      ),
      Inputs: this.fb.array((d.Inputs ?? []).map((inp: any) => this.fb.group({ Name: adminState(inp.Name ?? ''), Value: adminState(inp.Value ?? '') }))),
      Outputs: this.fb.array((d.Outputs ?? []).map((out: any) => this.fb.group({ Name: adminState(out.Name ?? ''), Value: adminState(out.Value ?? '') }))),
    });
  }

  addDevice(): void {
    this.devices.push(this.buildDeviceGroup());
    this.markDirty();
  }

  removeDevice(index: number): void {
    this.devices.removeAt(index);
    this.expandedDevices.update(s => { const n = new Set(s); n.delete(index); return n; });
    this.markDirty();
  }

  toggleDeviceExpand(index: number): void {
    this.expandedDevices.update(s => {
      const n = new Set(s);
      n.has(index) ? n.delete(index) : n.add(index);
      return n;
    });
  }

  isDeviceExpanded(index: number): boolean {
    return this.expandedDevices().has(index);
  }

  dropDevice(event: CdkDragDrop<any[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const control = this.devices.at(event.previousIndex);
    this.devices.removeAt(event.previousIndex, { emitEvent: false });
    this.devices.insert(event.currentIndex, control, { emitEvent: false });
    this.markDirty();
  }

  getInputsArray(deviceIndex: number): FormArray {
    return this.deviceControls[deviceIndex].get('Inputs') as FormArray;
  }

  getOutputsArray(deviceIndex: number): FormArray {
    return this.deviceControls[deviceIndex].get('Outputs') as FormArray;
  }

  addInput(deviceIndex: number): void {
    this.getInputsArray(deviceIndex).push(this.fb.group({ Name: [''], Value: [''] }));
    this.markDirty();
  }

  removeInput(deviceIndex: number, inputIndex: number): void {
    this.getInputsArray(deviceIndex).removeAt(inputIndex);
    this.markDirty();
  }

  addOutput(deviceIndex: number): void {
    this.getOutputsArray(deviceIndex).push(this.fb.group({ Name: [''], Value: [''] }));
    this.markDirty();
  }

  removeOutput(deviceIndex: number, outputIndex: number): void {
    this.getOutputsArray(deviceIndex).removeAt(outputIndex);
    this.markDirty();
  }

  get gains(): FormArray { return this.form.get('Gains') as FormArray; }
  get gainControls(): FormGroup[] { return this.gains.controls as FormGroup[]; }

  private syncCtxGains(): void {
    const gainIds = this.gainControls.map(g => g.get('key')?.value ?? '').filter(Boolean);
    this.ctx.update(c => ({ ...c, gainIds }));
  }

  private buildGainGroup(key: string = '', g: any = {}): FormGroup {
    const structState = (v: any) => this.canEditStructure ? [v] : [{ value: v, disabled: true }];
    return this.fb.group({
      key: structState(key),
      Label: [g.Label ?? ''],
      ControlId: structState(g.ControlId ?? null),
      IsInvisible: [g.IsInvisible ?? false],
      Phantom48v: [g.Phantom48v ?? false],
      Min: [g.Min ?? -50],
      Max: [g.Max ?? -10],
      MuteLabel: [g.MuteLabel ?? 'Mute'],
      MuteActiveLabel: [g.MuteActiveLabel ?? 'Muted'],
      SliderStyle: [g.SliderStyle ?? ''],
      MuteStyle: [g.MuteStyle ?? ''],
      MuteActiveStyle: [g.MuteActiveStyle ?? ''],
    });
  }

  addGain(): void { this.gains.push(this.buildGainGroup()); this.markDirty(); }

  removeGain(index: number): void {
    this.gains.removeAt(index);
    this.expandedGains.update(s => { const n = new Set(s); n.delete(index); return n; });
    this.markDirty();
  }

  toggleGainExpand(index: number): void {
    this.expandedGains.update(s => { const n = new Set(s); n.has(index) ? n.delete(index) : n.add(index); return n; });
  }

  isGainExpanded(index: number): boolean { return this.expandedGains().has(index); }

  dropGain(event: CdkDragDrop<any[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const control = this.gains.at(event.previousIndex);
    this.gains.removeAt(event.previousIndex, { emitEvent: false });
    this.gains.insert(event.currentIndex, control, { emitEvent: false });
    this.markDirty();
  }

  ngOnInit(): void {
      const id = this.route.snapshot.paramMap.get('id');
      if (!id) {
        this.loading.set(false);
        this.loadError.set('Missing id in route.');
        return;
      }

      const isTemplate = this.route.snapshot.routeConfig?.path?.startsWith('edit-template');
      if (isTemplate) {
        this.templateMode.set(true);
        this.templateId = id;
        this.fetchTemplate();
      } else {
        this.roomId = id;
        this.fetchRoom();
      }

      this.form.valueChanges.subscribe(() => {
        if (this.form.dirty) this.navGuard.setDirty(true);
      });

      const sectionIds = [
        'section-system-settings', 'section-system-on', 'section-system-off',
        'section-scheduled', 'section-sources', 'section-pages',
        'section-audio', 'section-devices',
      ];

      this.sectionObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          const el = entry.target as HTMLElement;
          el.dataset['visible'] = entry.isIntersecting ? '1' : '0';
        });
        // Pick the first visible section in document order
        const first = sectionIds.find(id => {
          const el = document.getElementById(id);
          return el?.dataset['visible'] === '1';
        });
        if (first) this.activeSection.set(first);
      }, { threshold: 0, rootMargin: '0px 0px -60% 0px' });

      setTimeout(() => {
        sectionIds.forEach(id => {
          const el = document.getElementById(id);
          if (el) this.sectionObserver!.observe(el);
        });
      }, 500);
    }
  
    /** Convenience getters used by the template */
    get systemOnActions(): FormArray {
      return this.form.get('SystemOnActions') as FormArray;
    }
  
    get systemOffActions(): FormArray {
      return this.form.get('SystemOffActions') as FormArray;
    }
  
    /** Iterable collections for @for in template (FormArray itself is not iterable) */
    get systemOnActionControls(): FormGroup[] {
      return (this.systemOnActions?.controls ?? []) as FormGroup[];
    }
  
    get systemOffActionControls(): FormGroup[] {
      return (this.systemOffActions?.controls ?? []) as FormGroup[];
    }

    get scheduledActions(): FormArray {
      return this.form.get('ScheduledActions') as FormArray;
    }

    get scheduledActionControls(): FormGroup[] {
      return (this.scheduledActions?.controls ?? []) as FormGroup[];
    }

    getScheduledActionActionsArray(index: number): FormArray {
      return this.scheduledActionControls[index].get('actions') as FormArray;
    }

    getScheduledActionActionsControls(index: number): FormGroup[] {
      return (this.getScheduledActionActionsArray(index)?.controls ?? []) as FormGroup[];
    }

    get sources(): FormArray {
      return this.form.get('Sources') as FormArray;
    }
  
    get sourceControls(): FormGroup[] {
      return (this.sources?.controls ?? []) as FormGroup[];
    }
  
    /** API base (keep simple for now; you can move this to environment.ts later) */
    private apiBase(): string {
      return (window as any).API_BASE_URL || 'http://localhost:8080';
    }
  
    private fetchTemplate(): void {
      this.loading.set(true);
      this.loadError.set(null);

      this.http
        .get<any>(`${this.apiBase()}/templates/${this.templateId}`, { headers: { Authorization: `Bearer ${this.auth.token()}` } })
        .pipe(finalize(() => this.loading.set(false)))
        .subscribe({
          next: (doc) => {
            try {
              this.editingTemplateName.set(doc.name ?? '');
              this.applyConfigToForm(doc.config ?? {});
            } catch (e: any) {
              this.loadError.set(e?.message || 'Failed to apply template config to form.');
            }
          },
          error: (err: HttpErrorResponse) => {
            this.loadError.set(err?.error?.error || err?.message || 'Failed to load template.');
          },
        });
    }

    private fetchRoom(): void {
      this.loading.set(true);
      this.loadError.set(null);
  
      const url = `${this.apiBase()}/rooms/${this.roomId}`;
  
      this.http
        .get<RoomConfigDoc>(url, { headers: { Authorization: `Bearer ${this.auth.token()}` } })
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
      const allDevices = Object.entries(cfg?.Devices ?? {}).map(
        ([id, device]: any) => ({
          id,
          friendlyName: device?.FriendlyName ?? id,
          interfaces: Array.isArray(device?.Interfaces)
            ? device.Interfaces
            : [],
          inputs: Array.isArray(device?.Inputs) ? device.Inputs : [],
          outputs: Array.isArray(device?.Outputs) ? device.Outputs : [],
        })
      );
      const pageIds = Array.isArray(cfg?.Pages)
        ? cfg.Pages.map((p: any) => p?.Id).filter(Boolean)
        : [];
      const transitions = ['None', 'Fade', 'Slide'];
      const gainIds = Object.keys(cfg?.Gains ?? {});

      this.ctx.set({
        allDevices,
        pageIds,
        layerIds: [],
        transitions,
        gainIds,
      });
  
      // Rebuild action arrays
      this.resetActionsArray(this.systemOnActions, cfg.SystemOnActions);
      this.resetActionsArray(this.systemOffActions, cfg.SystemOffActions);

      // Rebuild ScheduledActions
      this.scheduledActions.clear();
      (Array.isArray(cfg?.ScheduledActions) ? cfg.ScheduledActions : []).forEach((s: any) => {
        this.scheduledActions.push(this.buildScheduledActionGroup(s));
      });
  
      // Rebuild Sources (object → FormArray)
      this.sources.clear();
      const sourcesObj = cfg?.Sources ?? {};
      Object.keys(sourcesObj).forEach((key) => {
        this.sources.push(this.createSourceGroup(key, sourcesObj[key]));
      });

      // Rebuild Devices (object → FormArray)
      this.devices.clear();
      const devicesObj = cfg?.Devices ?? {};
      Object.keys(devicesObj).forEach((key) => {
        this.devices.push(this.buildDeviceGroup(key, devicesObj[key]));
      });

      // Rebuild Gains (object → FormArray)
      this.gains.clear();
      const gainsObj = cfg?.Gains ?? {};
      Object.keys(gainsObj).forEach((key) => {
        this.gains.push(this.buildGainGroup(key, gainsObj[key]));
      });

      // Rebuild Pages (array) — each page contains its own Components
      this.pages.clear();
      this.expandedPages.set(new Set());
      (Array.isArray(cfg?.Pages) ? cfg.Pages : []).forEach((p: any) => {
        this.pages.push(this.buildPageGroup(p));
      });
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
        const v = s[f.key] ?? f.default ?? (f.kind === 'number' ? null : '');
        controls[f.key] = [v];
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
  
      // Auto-fill select fields that have exactly one option
      const autoFill = (g: FormGroup, actionType: ActionType) => {
        const params = g.get('params') as FormGroup;
        if (!params) return;
        const specs = this.actionSpecs[actionType] ?? [];
        for (const spec of specs) {
          if (spec.kind !== 'select' || !spec.options) continue;
          const ctrl = params.get(spec.key);
          if (!ctrl || ctrl.value) continue;
          // Build a proxy group so options fn can read already-filled sibling values
          const proxy = { get: (k: string) => params.get(k) } as any;
          const opts = spec.options(this.ctx(), proxy);
          if (opts.length === 1) {
            ctrl.setValue(opts[0].value, { emitEvent: true });
          }
        }
      };

      // Subscribe to params value changes to ensure form is marked dirty
      const subscribeParamsDirty = (params: FormGroup) => {
        params.valueChanges.subscribe(() => {
          this.form.markAsDirty();
        });
      };

      // Wire device changes for every action instance
      const wireDeviceChanges = (g: FormGroup) => {
        const params = g.get('params') as FormGroup;
        if (!params) return;

        subscribeParamsDirty(params);

        const deviceCtrl = params.get('device');
        if (!deviceCtrl) return;

        deviceCtrl.valueChanges.subscribe(() => {
          const inputCtrl = params.get('input');
          const outputCtrl = params.get('output');

          if (inputCtrl) inputCtrl.setValue(null);
          if (outputCtrl) outputCtrl.setValue(null);

          // After device selected, auto-fill input/output if only one option
          const currentType = g.get('action')?.value as ActionType;
          if (currentType) setTimeout(() => autoFill(g, currentType));
        });
      };

      wireDeviceChanges(group);

      // Auto-fill on initial creation (ctx is populated before createActionGroup is called)
      autoFill(group, type);

      // When action type changes, patch params in-place (never replace the group instance)
      group.get('action')!.valueChanges.subscribe((newType) => {
        const params = group.get('params') as FormGroup;
        if (!params) return;

        const newFields = this.actionSpecs[newType] ?? [];
        const newKeys = new Set(newFields.map((f) => f.key));

        // Remove controls that don't belong to the new action type
        Object.keys(params.controls).forEach((key) => {
          if (!newKeys.has(key)) params.removeControl(key, { emitEvent: false });
        });

        // Add controls that are missing
        newFields.forEach((f) => {
          if (!params.contains(f.key)) {
            const v = f.kind === 'number' ? null : '';
            params.addControl(f.key, this.fb.control(v), { emitEvent: false });
          }
        });

        params.updateValueAndValidity({ emitEvent: true });
        this.form.markAsDirty();

        wireDeviceChanges(group);
        autoFill(group, newType);
      });
  
      return group;
    }
  
    private createSourceGroup(key: string, seed?: any): FormGroup {
      const s = seed ?? {};
  
      return this.fb.group({
        Key: [key],
  
        // Keep legacy "name" for template compatibility
        name: [s.Control ?? key],
  
        Control: [s.Control ?? key],
        IsInvisible: [s.IsInvisible ?? false],
        Label: [s.Label ?? ''],
        Icon: [s.Icon ?? ''],
        IconSelected: [s.IconSelected ?? ''],
        AutoStart: [s.AutoStart ?? false],
        AutoShutdown: [s.AutoShutdown ?? false],
        Order: [s.Order ?? 0],
        Group: [s.Group ?? 'Sources'],
  
        HasActions: [Array.isArray(s?.Actions) && s.Actions.length > 0],
        Actions: this.fb.array(
          (Array.isArray(s?.Actions) ? s.Actions : []).map((a: any) =>
            this.createActionGroup(a)
          )
        ),
        HasHoldActions: [Array.isArray(s?.HoldActions) && s.HoldActions.length > 0],
        HoldActions: this.fb.array(
          (Array.isArray(s?.HoldActions) ? s.HoldActions : []).map((a: any) =>
            this.createActionGroup(a)
          )
        ),
      });
    }

  addSource(): void {
    const nextIndex = this.sources.length + 1;
    const key = `Source_${nextIndex}_Btn`;
    this.sources.push(this.createSourceGroup(key));
    this.markDirty();
  }

  removeSource(index: number): void {
    this.sources.removeAt(index);
    this.markDirty();
  }

  getSourceActionControls(sourceIndex: number): FormGroup[] {
    const arr = this.sources.at(sourceIndex)?.get('Actions') as FormArray;
    return (arr?.controls ?? []) as FormGroup[];
  }

  addSourceAction(sourceIndex: number): void {
    const arr = this.sources.at(sourceIndex)?.get('Actions') as FormArray;
    arr?.push(this.createActionGroup());
    this.markDirty();
  }

  removeSourceAction(sourceIndex: number, actionIndex: number): void {
    const arr = this.sources.at(sourceIndex)?.get('Actions') as FormArray;
    arr?.removeAt(actionIndex);
    this.markDirty();
  }

  dropSource(event: CdkDragDrop<any[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const control = this.sources.at(event.previousIndex);
    this.sources.removeAt(event.previousIndex, { emitEvent: false });
    this.sources.insert(event.currentIndex, control, { emitEvent: false });
    this.markDirty();
  }

  toggleSourceExpand(index: number): void {
    this.expandedSources.update(s => {
      const n = new Set(s);
      n.has(index) ? n.delete(index) : n.add(index);
      return n;
    });
  }

  isSourceExpanded(index: number): boolean {
    return this.expandedSources().has(index);
  }

  getSourceActionsArray(sourceIndex: number): FormArray {
    return this.sources.at(sourceIndex)?.get('Actions') as FormArray;
  }

  getSourceHoldActionsArray(sourceIndex: number): FormArray {
    return this.sources.at(sourceIndex)?.get('HoldActions') as FormArray;
  }

  addSourceHoldAction(sourceIndex: number): void {
    this.getSourceHoldActionsArray(sourceIndex)?.push(this.createActionGroup());
    this.markDirty();
  }

  removeSourceHoldAction(sourceIndex: number, actionIndex: number): void {
    this.getSourceHoldActionsArray(sourceIndex)?.removeAt(actionIndex);
    this.markDirty();
  }

  dropSourceAction(sourceIndex: number, event: CdkDragDrop<any[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const arr = this.getSourceActionsArray(sourceIndex);
    const control = arr.at(event.previousIndex);
    arr.removeAt(event.previousIndex, { emitEvent: false });
    arr.insert(event.currentIndex, control, { emitEvent: false });
    this.markDirty();
  }

  dropSourceHoldAction(sourceIndex: number, event: CdkDragDrop<any[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const arr = this.getSourceHoldActionsArray(sourceIndex);
    const control = arr.at(event.previousIndex);
    arr.removeAt(event.previousIndex, { emitEvent: false });
    arr.insert(event.currentIndex, control, { emitEvent: false });
    this.markDirty();
  }
  
  getSourceActionFieldSpecs(sourceIndex: number, actionIndex: number): FieldSpec[] {
    const arr = this.sources.at(sourceIndex)?.get('Actions') as FormArray;
    if (!arr) return [];
    return this.getFieldSpecsFor(arr, actionIndex);
  }
  
  getSourceFieldSpecs(sourceIndex: number): {
    key: string;
    label: string;
    kind: 'boolean' | 'text' | 'number';
  }[] {
    const group = this.sources.at(sourceIndex) as FormGroup;
    if (!group) return [];
  
    return Object.keys(group.controls)
      .filter((k) => k !== 'name' && k !== 'Actions')
      .map((key) => {
        const value = group.get(key)?.value;
  
        const kind =
          typeof value === 'boolean'
            ? 'boolean'
            : typeof value === 'number'
            ? 'number'
            : 'text';
  
        return {
          key,
          label: key,
          kind,
        };
      });
  }
  
  // ── Pages ──────────────────────────────────────────────────────────────

  expandedPages = signal<Set<number>>(new Set());

  get pages(): FormArray { return this.form.get('Pages') as FormArray; }
  get pageControls(): FormGroup[] { return this.pages.controls as FormGroup[]; }

  private buildPageGroup(seed: any = {}): FormGroup {
    const componentsObj = (seed.Components && typeof seed.Components === 'object' && !Array.isArray(seed.Components))
      ? seed.Components : {};
    const structState = (v: any) => this.canEditStructure ? [v] : [{ value: v, disabled: true }];
    return this.fb.group({
      Id:          structState(seed.Id ?? ''),
      Title:       [seed.Title ?? ''],
      Subtitle:    [seed.Subtitle ?? ''],
      Description: [seed.Description ?? ''],
      Text:        [seed.Text ?? ''],
      Image:       [seed.Image ?? ''],
      HasActions:  [Array.isArray(seed.Actions) && seed.Actions.length > 0],
      Actions: this.fb.array(
        (Array.isArray(seed.Actions) ? seed.Actions : []).map((a: any) => this.createActionGroup(a))
      ),
      Components: this.fb.array(
        Object.entries(componentsObj).map(([key, c]) => this.buildComponentGroup(key, c))
      ),
    });
  }

  addPage(): void { this.pages.push(this.buildPageGroup()); this.markDirty(); }

  removePage(index: number): void {
    this.pages.removeAt(index);
    this.expandedPages.update(s => { const n = new Set(s); n.delete(index); return n; });
    this.markDirty();
  }

  togglePageExpand(index: number): void {
    this.expandedPages.update(s => {
      const n = new Set(s);
      n.has(index) ? n.delete(index) : n.add(index);
      return n;
    });
  }

  isPageExpanded(index: number): boolean { return this.expandedPages().has(index); }

  getPageActionsArray(pageIndex: number): FormArray {
    return this.pages.at(pageIndex)?.get('Actions') as FormArray;
  }

  addPageAction(pageIndex: number): void {
    this.getPageActionsArray(pageIndex)?.push(this.createActionGroup());
    this.markDirty();
  }

  removePageAction(pageIndex: number, actionIndex: number): void {
    this.getPageActionsArray(pageIndex)?.removeAt(actionIndex);
    this.markDirty();
  }

  getPageActionFieldSpecs(pageIndex: number, actionIndex: number): FieldSpec[] {
    const arr = this.getPageActionsArray(pageIndex);
    if (!arr) return [];
    return this.getFieldSpecsFor(arr, actionIndex);
  }

  dropPage(event: CdkDragDrop<any[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const control = this.pages.at(event.previousIndex);
    this.pages.removeAt(event.previousIndex, { emitEvent: false });
    this.pages.insert(event.currentIndex, control, { emitEvent: false });
    this.markDirty();
  }

  dropPageAction(pageIndex: number, event: CdkDragDrop<any[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const arr = this.getPageActionsArray(pageIndex);
    const control = arr.at(event.previousIndex);
    arr.removeAt(event.previousIndex, { emitEvent: false });
    arr.insert(event.currentIndex, control, { emitEvent: false });
    this.markDirty();
  }

  // ── Components (scoped per page) ────────────────────────────────────────

  // expandedComponents is keyed as `pageIndex-compIndex`
  expandedComponents = signal<Set<string>>(new Set());

  private buildComponentGroup(key: string, seed: any = {}): FormGroup {
    const propsObj = seed.Properties ?? {};
    const structState = (v: any) => this.canEditStructure ? [v] : [{ value: v, disabled: true }];
    return this.fb.group({
      Key:         structState(key),
      IsInvisible: [seed.IsInvisible ?? false],
      Properties:  this.fb.array(
        Object.entries(propsObj).map(([k, v]) =>
          this.fb.group({ key: structState(k), value: [v] })
        )
      ),
      HasActions:    [Array.isArray(seed.Actions) && seed.Actions.length > 0],
      Actions: this.fb.array(
        (Array.isArray(seed.Actions) ? seed.Actions : []).map((a: any) => this.createActionGroup(a))
      ),
      HasHoldActions: [Array.isArray(seed.HoldActions) && seed.HoldActions.length > 0],
      HoldActions: this.fb.array(
        (Array.isArray(seed.HoldActions) ? seed.HoldActions : []).map((a: any) => this.createActionGroup(a))
      ),
      HasToggleActions: [Array.isArray(seed.ToggleActions) && seed.ToggleActions.length > 0],
      ToggleActions: this.fb.array(
        (Array.isArray(seed.ToggleActions) ? seed.ToggleActions : []).map((a: any) => this.createActionGroup(a))
      ),
    });
  }

  getPageComponentsArray(pageIndex: number): FormArray {
    return this.pages.at(pageIndex)?.get('Components') as FormArray;
  }

  getPageComponentControls(pageIndex: number): FormGroup[] {
    return (this.getPageComponentsArray(pageIndex)?.controls ?? []) as FormGroup[];
  }

  addComponent(pageIndex: number): void {
    const arr = this.getPageComponentsArray(pageIndex);
    arr?.push(this.buildComponentGroup(`Component_${arr.length + 1}`));
    this.markDirty();
  }

  removeComponent(pageIndex: number, compIndex: number): void {
    this.getPageComponentsArray(pageIndex)?.removeAt(compIndex);
    const key = `${pageIndex}-${compIndex}`;
    this.expandedComponents.update(s => { const n = new Set(s); n.delete(key); return n; });
    this.markDirty();
  }

  toggleComponentExpand(pageIndex: number, compIndex: number): void {
    const key = `${pageIndex}-${compIndex}`;
    this.expandedComponents.update(s => {
      const n = new Set(s);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  }

  isComponentExpanded(pageIndex: number, compIndex: number): boolean {
    return this.expandedComponents().has(`${pageIndex}-${compIndex}`);
  }

  getComponentActionsArray(pageIndex: number, compIndex: number): FormArray {
    return this.getPageComponentsArray(pageIndex)?.at(compIndex)?.get('Actions') as FormArray;
  }

  getComponentHoldActionsArray(pageIndex: number, compIndex: number): FormArray {
    return this.getPageComponentsArray(pageIndex)?.at(compIndex)?.get('HoldActions') as FormArray;
  }

  addComponentHoldAction(pageIndex: number, compIndex: number): void {
    this.getComponentHoldActionsArray(pageIndex, compIndex)?.push(this.createActionGroup());
    this.markDirty();
  }

  removeComponentHoldAction(pageIndex: number, compIndex: number, actionIndex: number): void {
    this.getComponentHoldActionsArray(pageIndex, compIndex)?.removeAt(actionIndex);
    this.markDirty();
  }

  dropComponentHoldAction(pageIndex: number, compIndex: number, event: CdkDragDrop<any[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const arr = this.getComponentHoldActionsArray(pageIndex, compIndex);
    const control = arr.at(event.previousIndex);
    arr.removeAt(event.previousIndex, { emitEvent: false });
    arr.insert(event.currentIndex, control, { emitEvent: false });
    this.markDirty();
  }

  getComponentToggleActionsArray(pageIndex: number, compIndex: number): FormArray {
    return this.getPageComponentsArray(pageIndex)?.at(compIndex)?.get('ToggleActions') as FormArray;
  }

  addComponentToggleAction(pageIndex: number, compIndex: number): void {
    this.getComponentToggleActionsArray(pageIndex, compIndex)?.push(this.createActionGroup());
    this.markDirty();
  }

  removeComponentToggleAction(pageIndex: number, compIndex: number, actionIndex: number): void {
    this.getComponentToggleActionsArray(pageIndex, compIndex)?.removeAt(actionIndex);
    this.markDirty();
  }

  dropComponentToggleAction(pageIndex: number, compIndex: number, event: CdkDragDrop<any[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const arr = this.getComponentToggleActionsArray(pageIndex, compIndex);
    const control = arr.at(event.previousIndex);
    arr.removeAt(event.previousIndex, { emitEvent: false });
    arr.insert(event.currentIndex, control, { emitEvent: false });
    this.markDirty();
  }

  getComponentPropertiesArray(pageIndex: number, compIndex: number): FormArray {
    return this.getPageComponentsArray(pageIndex)?.at(compIndex)?.get('Properties') as FormArray;
  }

  addComponentAction(pageIndex: number, compIndex: number): void {
    this.getComponentActionsArray(pageIndex, compIndex)?.push(this.createActionGroup());
    this.markDirty();
  }

  removeComponentAction(pageIndex: number, compIndex: number, actionIndex: number): void {
    this.getComponentActionsArray(pageIndex, compIndex)?.removeAt(actionIndex);
    this.markDirty();
  }

  getComponentActionFieldSpecs(pageIndex: number, compIndex: number, actionIndex: number): FieldSpec[] {
    const arr = this.getComponentActionsArray(pageIndex, compIndex);
    if (!arr) return [];
    return this.getFieldSpecsFor(arr, actionIndex);
  }

  getComponentToggleActionFieldSpecs(pageIndex: number, compIndex: number, actionIndex: number): FieldSpec[] {
    const arr = this.getComponentToggleActionsArray(pageIndex, compIndex);
    if (!arr) return [];
    return this.getFieldSpecsFor(arr, actionIndex);
  }

  addComponentProperty(pageIndex: number, compIndex: number): void {
    this.getComponentPropertiesArray(pageIndex, compIndex)?.push(this.fb.group({ key: [''], value: [''] }));
    this.markDirty();
  }

  removeComponentProperty(pageIndex: number, compIndex: number, propIndex: number): void {
    this.getComponentPropertiesArray(pageIndex, compIndex)?.removeAt(propIndex);
    this.markDirty();
  }

  dropComponent(pageIndex: number, event: CdkDragDrop<any[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const arr = this.getPageComponentsArray(pageIndex);
    const control = arr.at(event.previousIndex);
    arr.removeAt(event.previousIndex, { emitEvent: false });
    arr.insert(event.currentIndex, control, { emitEvent: false });
    this.markDirty();
  }

  dropComponentAction(pageIndex: number, compIndex: number, event: CdkDragDrop<any[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const arr = this.getComponentActionsArray(pageIndex, compIndex);
    const control = arr.at(event.previousIndex);
    arr.removeAt(event.previousIndex, { emitEvent: false });
    arr.insert(event.currentIndex, control, { emitEvent: false });
    this.markDirty();
  }

  // Template helpers for dynamic action rendering
    getActionTypeAt(arr: FormArray, index: number): ActionType {
      return (arr.at(index) as FormGroup).get('action')?.value as ActionType;
    }
  
    getFieldSpecsFor(arr: FormArray, index: number): FieldSpec[] {
      const t = this.getActionTypeAt(arr, index);
      return this.actionSpecs[t] ?? [];
    }
  
    onDeviceChange(arrName: string, index: number, deviceId: string): void {
      this.selectedDevices.update(map => ({ ...map, [`${arrName}-${index}`]: deviceId }));
    }

    getOptionsForField(field: FieldSpec, arrName: string, arr: FormArray, index: number): Option[] {
      if (!field?.options) return [];

      const deviceId = this.selectedDevices()[`${arrName}-${index}`]
        ?? (arr.at(index) as FormGroup)?.get('params')?.get('device')?.value
        ?? '';

      const fakeGroup = { get: (key: string) => key === 'device' ? { value: deviceId } : null } as any;

      const options = field.options(this.ctx(), fakeGroup);

      // Exclude "System" from System On/Off Actions to avoid loops
      if (arrName.toLowerCase().startsWith('system')) {
        return options.filter((o) => o.value !== 'System');
      }

      return options;
    }
  
    markDirty(): void {
      this.form.markAsDirty();
      this.navGuard.setDirty(true);
    }

    ngOnDestroy(): void {
      this.navGuard.setDirty(false);
      this.sectionObserver?.disconnect();
    }

    addSystemOnAction(): void {
      this.systemOnActions.push(this.createActionGroup());
      this.markDirty();
    }

    removeSystemOnAction(index: number): void {
      this.systemOnActions.removeAt(index);
      this.markDirty();
    }

    addSystemOffAction(): void {
      this.systemOffActions.push(this.createActionGroup());
      this.markDirty();
    }

    removeSystemOffAction(index: number): void {
      this.systemOffActions.removeAt(index);
      this.markDirty();
    }

    readonly daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

    private buildScheduledActionGroup(seed: any = {}): FormGroup {
      const isRecurring = seed.type === 'recurring';
      const days = seed.days ?? {};
      return this.fb.group({
        name: [seed.name ?? ''],
        type: [isRecurring ? 'recurring' : 'onetime'],
        date: [seed.date ?? ''],
        time: [seed.time ?? ''],
        days: this.fb.group({
          Mon: [days['Mon'] ?? false],
          Tue: [days['Tue'] ?? false],
          Wed: [days['Wed'] ?? false],
          Thu: [days['Thu'] ?? false],
          Fri: [days['Fri'] ?? false],
          Sat: [days['Sat'] ?? false],
          Sun: [days['Sun'] ?? false],
        }),
        actions: this.fb.array(
          (Array.isArray(seed.actions) ? seed.actions : []).map((a: any) => this.createActionGroup(a))
        ),
      });
    }

    addScheduledAction(): void {
      this.scheduledActions.push(this.buildScheduledActionGroup());
      this.expandedScheduled.update(s => { const n = new Set(s); n.add(this.scheduledActions.length - 1); return n; });
      this.markDirty();
    }

    removeScheduledAction(index: number): void {
      this.scheduledActions.removeAt(index);
      this.expandedScheduled.update(s => { const n = new Set(s); n.delete(index); return n; });
      this.markDirty();
    }

    toggleScheduledExpand(index: number): void {
      this.expandedScheduled.update(s => {
        const n = new Set(s);
        n.has(index) ? n.delete(index) : n.add(index);
        return n;
      });
    }

    isScheduledExpanded(index: number): boolean { return this.expandedScheduled().has(index); }

    dropScheduledAction(event: CdkDragDrop<any[]>): void {
      if (event.previousIndex === event.currentIndex) return;
      const control = this.scheduledActions.at(event.previousIndex);
      this.scheduledActions.removeAt(event.previousIndex, { emitEvent: false });
      this.scheduledActions.insert(event.currentIndex, control, { emitEvent: false });
      this.markDirty();
    }

    addScheduledActionAction(schedIndex: number): void {
      this.getScheduledActionActionsArray(schedIndex).push(this.createActionGroup());
      this.markDirty();
    }

    removeScheduledActionAction(schedIndex: number, actionIndex: number): void {
      this.getScheduledActionActionsArray(schedIndex).removeAt(actionIndex);
      this.markDirty();
    }

    dropAction(arr: FormArray, event: CdkDragDrop<any[]>): void {
      if (event.previousIndex === event.currentIndex) return;
      const control = arr.at(event.previousIndex);
      arr.removeAt(event.previousIndex, { emitEvent: false });
      arr.insert(event.currentIndex, control, { emitEvent: false });
      this.markDirty();
    }

    scrollTo(id: string): void {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    }

    goBack(): void {
      if (this.templateMode()) {
        const isAdmin = this.auth.user()?.roles?.includes('admin');
        this.router.navigate([isAdmin ? '/admin/templates' : '/profile']);
      } else {
        this.router.navigate(['/monitor']);
      }
    }

    confirmDelete(): void {
      const building = this.form.get('building')?.value ?? '';
      const room = this.form.get('room')?.value ?? '';
      const expected = `${building} ${room}`.trim();
      if (this.deleteConfirmBuilding().trim() !== expected) {
        this.deleteError.set('Name does not match. Please try again.');
        return;
      }
      this.deleting.set(true);
      this.deleteError.set(null);
      this.http.delete(
        `${this.apiBase()}/rooms/${this.roomId}`,
        { headers: { Authorization: `Bearer ${this.auth.token()}` } }
      ).subscribe({
        next: () => this.router.navigate(['/monitor']),
        error: () => {
          this.deleteError.set('Failed to delete room. Please try again.');
          this.deleting.set(false);
        },
      });
    }

    saveAsTemplate(): void {
      this.showSaveTemplateModal.set(true);
      this.templateName.set('');
      this.saveTemplateError.set(null);
    }

    confirmSaveTemplate(): void {
      const name = this.templateName().trim();
      if (!name) { this.saveTemplateError.set('Template name is required.'); return; }

      this.savingTemplate.set(true);
      this.saveTemplateError.set(null);

      const raw = this.form.getRawValue() as any;

      const flattenActions = (list: any[]) =>
        (Array.isArray(list) ? list : []).map((row: any) => ({ action: row?.action, ...(row?.params ?? {}) }));

      const flattenSource = (s: any) => ({
        ...s,
        Actions: flattenActions(s?.Actions),
        HoldActions: flattenActions(s?.HoldActions),
      });

      const serializeComponents = (compsArray: any[]) =>
        (Array.isArray(compsArray) ? compsArray : []).reduce((acc: any, c: any) => {
          const key = c.Key; if (!key) return acc;
          const props = (Array.isArray(c.Properties) ? c.Properties : []).reduce((pa: any, p: any) => { if (p.key) pa[p.key] = p.value; return pa; }, {});
          acc[key] = { IsInvisible: c.IsInvisible, Properties: props, Actions: flattenActions(c.Actions), HoldActions: flattenActions(c.HoldActions), ToggleActions: flattenActions(c.ToggleActions), Control: {} };
          return acc;
        }, {});

      const config = {
        ...raw,
        SystemOnActions: flattenActions(raw.SystemOnActions),
        SystemOffActions: flattenActions(raw.SystemOffActions),
        Sources: (Array.isArray(raw.Sources) ? raw.Sources : []).reduce((acc: any, s: any) => {
          const key = s.Key || s.Control; if (!key) return acc;
          const { Key, ...rest } = flattenSource(s); acc[key] = rest; return acc;
        }, {}),
        Devices: (Array.isArray(raw.Devices) ? raw.Devices : []).reduce((acc: any, d: any) => {
          const key = d.key; if (!key) return acc;
          const { key: _, Interfaces, ...rest } = d;
          acc[key] = { ...rest, Interfaces: Object.entries(Interfaces ?? {}).filter(([, v]) => v).map(([k]) => k) }; return acc;
        }, {}),
        Gains: (Array.isArray(raw.Gains) ? raw.Gains : []).reduce((acc: any, g: any) => {
          const key = g.key; if (!key) return acc; const { key: _, ...rest } = g; acc[key] = rest; return acc;
        }, {}),
        Pages: (Array.isArray(raw.Pages) ? raw.Pages : []).map((p: any) => ({
          Id: p.Id, Title: p.Title, Subtitle: p.Subtitle, Description: p.Description,
          Text: p.Text, Image: p.Image, Actions: flattenActions(p.Actions), Components: serializeComponents(p.Components),
        })),
      };

      this.http.post(`${this.apiBase()}/templates`, { name, permission: 'user', config }, { headers: { Authorization: `Bearer ${this.auth.token()}` } }).subscribe({
        next: () => {
          this.savingTemplate.set(false);
          this.showSaveTemplateModal.set(false);
        },
        error: (err: any) => {
          this.savingTemplate.set(false);
          this.saveTemplateError.set(err?.error?.error || err?.message || 'Failed to save template.');
        },
      });
    }

    loadTemplate(): void {
      this.showTemplateModal.set(true);
      this.templatesLoading.set(true);
      this.templatesError.set(null);
      this.http.get<{ _id: string; name: string; icon: string; createdby: string; created: string; permission: string }[]>(
        `${this.apiBase()}/templates`,
        { headers: { Authorization: `Bearer ${this.auth.token()}` } }
      ).subscribe({
        next: (data) => { this.templates.set(data); this.templatesLoading.set(false); },
        error: (err: any) => {
          this.templatesError.set(err?.error?.error || err?.message || 'Failed to load templates.');
          this.templatesLoading.set(false);
        },
      });
    }

    closeTemplateModal(): void {
      this.showTemplateModal.set(false);
    }

    applyTemplate(template: { _id: string; name: string }): void {
      this.showTemplateModal.set(false);
      this.http.get<{ _id: string; name: string; config: any }>(
        `${this.apiBase()}/templates/${template._id}`,
        { headers: { Authorization: `Bearer ${this.auth.token()}` } }
      ).subscribe({
        next: (doc) => {
          const config = doc.config;
          if (!config) return;
          // Preserve building/room/campus/ip — only load non-identity fields from template
          this.systemOnActions.clear();
          (config.SystemOnActions ?? []).forEach((a: any) => this.addActionFromConfig(this.systemOnActions, a));
          this.systemOffActions.clear();
          (config.SystemOffActions ?? []).forEach((a: any) => this.addActionFromConfig(this.systemOffActions, a));
          this.sources.clear();
          this.expandedSources.set(new Set());
          Object.entries(config.Sources ?? {}).forEach(([key, s]) => this.sources.push(this.createSourceGroup(key, s)));
          this.devices.clear();
          this.expandedDevices.set(new Set());
          Object.entries(config.Devices ?? {}).forEach(([key, d]) => this.devices.push(this.buildDeviceGroup(key, d)));
          this.syncCtxDevices();
          this.gains.clear();
          this.expandedGains.set(new Set());
          Object.entries(config.Gains ?? {}).forEach(([key, g]: [string, any]) => this.gains.push(this.buildGainGroup(key, g)));
          this.syncCtxGains();
          this.pages.clear();
          this.expandedPages.set(new Set());
          this.expandedComponents.set(new Set());
          (Array.isArray(config.Pages) ? config.Pages : []).forEach((p: any) => this.pages.push(this.buildPageGroup(p)));
          this.form.markAsDirty();
        },
      });
    }

    private addActionFromConfig(arr: any, a: any): void {
      const { action, ...params } = a;
      const fields = this.actionSpecs[action as ActionType] ?? [];
      const paramsGroup = this.fb.group(
        Object.fromEntries(fields.map((f: any) => [f.key, [params[f.key] ?? null]]))
      );
      arr.push(this.fb.group({ action: [action], params: paramsGroup }));
    }

    syncToCore(): void {
      this.showSaveModal.set(false);
      this.http.post(
        `${this.apiBase()}/rooms/${this.roomId}/sync`,
        {},
        { headers: { Authorization: `Bearer ${this.auth.token()}` } }
      ).subscribe({
        error: () => this.saveError.set('Sync request failed.'),
      });
    }
  
    private validateActionParams(): string | null {
      const checkArray = (actions: any[], label: string): string | null => {
        for (let i = 0; i < actions.length; i++) {
          const row = actions[i];
          const actionType = row?.action as ActionType;
          if (!actionType) continue;
          const specs = this.actionSpecs[actionType] ?? [];
          for (const spec of specs) {
            if (!spec.required) continue;
            const val = row?.params?.[spec.key];
            if (val === null || val === '' || val === undefined) {
              return `${label} action ${i + 1}: "${spec.label}" is required.`;
            }
          }
        }
        return null;
      };

      const raw = this.form.getRawValue() as any;

return (
        checkArray(raw.SystemOnActions ?? [], 'System On') ??
        checkArray(raw.SystemOffActions ?? [], 'System Off') ??
        (() => {
          for (let si = 0; si < (raw.Sources ?? []).length; si++) {
            const err = checkArray(raw.Sources[si]?.Actions ?? [], `Source ${si + 1}`) ??
                        checkArray(raw.Sources[si]?.HoldActions ?? [], `Source ${si + 1} Hold`);
            if (err) return err;
          }
          return null;
        })() ??
        (() => {
          for (let pi = 0; pi < (raw.Pages ?? []).length; pi++) {
            const err = checkArray(raw.Pages[pi]?.Actions ?? [], `Page ${pi + 1}`);
            if (err) return err;
            for (let ci = 0; ci < (raw.Pages[pi]?.Components ?? []).length; ci++) {
              const err2 = checkArray(raw.Pages[pi].Components[ci]?.Actions ?? [], `Page ${pi + 1} Component ${ci + 1}`) ??
                           checkArray(raw.Pages[pi].Components[ci]?.HoldActions ?? [], `Page ${pi + 1} Component ${ci + 1} Hold`);
              if (err2) return err2;
            }
          }
          return null;
        })()
      );
    }

    onSave(): void {
      if (this.saving()) return;

      if (!this.templateMode() && this.form.invalid) {
        this.saveError.set('Please fill in all required fields (Campus, Building, Room, IP).');
        return;
      }

      const paramError = this.validateActionParams();
      if (paramError) {
        this.saveError.set(paramError);
        return;
      }

      this.saveError.set(null);
  
      this.saving.set(true);
  
      const raw = this.form.getRawValue() as any;
  
      const flattenActions = (list: any[]) =>
        (Array.isArray(list) ? list : []).map((row) => ({
          action: row?.action,
          ...(row?.params ?? {}),
        }));
  
      const flattenSource = (s: any) => ({
        ...s,
        Actions: flattenActions(s?.Actions),
        HoldActions: flattenActions(s?.HoldActions),
      });
  
      const sourcesArray = Array.isArray(raw.Sources) ? raw.Sources : [];
  
      const sourcesObject = sourcesArray.reduce((acc: any, s: any) => {
        const key = s.Key || s.Control;
        const { Key, ...rest } = flattenSource(s);
        acc[key] = rest;
        return acc;
      }, {});
  
      const devicesArray = Array.isArray(raw.Devices) ? raw.Devices : [];
      const devicesObject = devicesArray.reduce((acc: any, d: any) => {
        const key = d.key;
        if (!key) return acc;
        const { key: _, Interfaces, ...rest } = d;
        const ifaceList = Object.entries(Interfaces ?? {})
          .filter(([, v]) => v)
          .map(([k]) => k);
        acc[key] = { ...rest, Interfaces: ifaceList };
        return acc;
      }, {});

      const serializeComponents = (compsArray: any[]) =>
        (Array.isArray(compsArray) ? compsArray : []).reduce((acc: any, c: any) => {
          const key = c.Key;
          if (!key) return acc;
          const props = (Array.isArray(c.Properties) ? c.Properties : []).reduce((pa: any, p: any) => {
            if (p.key) pa[p.key] = p.value;
            return pa;
          }, {});
          acc[key] = {
            IsInvisible: c.IsInvisible,
            Properties: props,
            Actions: flattenActions(c.Actions),
            HoldActions: flattenActions(c.HoldActions),
            ToggleActions: flattenActions(c.ToggleActions),
            Control: {},
          };
          return acc;
        }, {});

      const pagesArray = (Array.isArray(raw.Pages) ? raw.Pages : []).map((p: any) => ({
        Id: p.Id,
        Title: p.Title,
        Subtitle: p.Subtitle,
        Description: p.Description,
        Text: p.Text,
        Image: p.Image,
        Actions: flattenActions(p.Actions),
        Components: serializeComponents(p.Components),
      }));

      const serializeScheduledActions = (list: any[]) =>
        (Array.isArray(list) ? list : []).map((s: any) => ({
          name: s.name ?? '',
          type: s.type,
          date: s.date ?? '',
          time: s.time ?? '',
          days: s.days ?? {},
          actions: flattenActions(s.actions),
        }));

      const configToSave = {
        ...raw,
        roomId: this.roomId,
        updatedAt: this.toIsoOrNull(raw.updatedAt),
        slaExpireAt: this.toIsoOrNull(raw.slaExpireAt),
        SystemOnActions: flattenActions(raw.SystemOnActions),
        SystemOffActions: flattenActions(raw.SystemOffActions),
        ScheduledActions: serializeScheduledActions(raw.ScheduledActions),
        Sources: sourcesObject,
        Devices: devicesObject,
        Pages: pagesArray,
        Gains: (Array.isArray(raw.Gains) ? raw.Gains : []).reduce((acc: any, g: any) => {
          const key = g.key; if (!key) return acc;
          const { key: _, ...rest } = g;
          acc[key] = rest; return acc;
        }, {}),
      };
  
      if (this.templateMode()) {
        this.http.patch(
          `${this.apiBase()}/templates/${this.templateId}`,
          { config: configToSave },
          { headers: { Authorization: `Bearer ${this.auth.token()}`, 'Content-Type': 'application/json' } }
        ).subscribe({
          next: () => {
            this.saving.set(false);
            this.saveError.set(null);
            this.form.markAsPristine();
            this.navGuard.setDirty(false);
            this.showSaveModal.set(true);
          },
          error: (err: HttpErrorResponse) => {
            this.saving.set(false);
            this.saveError.set(err?.error?.error || err?.message || 'Save failed.');
          },
        });
        return;
      }

      const url = `${this.apiBase()}/rooms/${this.roomId}`;

      this.http.put(url, configToSave, { headers: { Authorization: `Bearer ${this.auth.token()}` } }).subscribe({
        next: () => {
          this.saving.set(false);
          this.saveError.set(null);
          this.form.markAsPristine();
          this.navGuard.setDirty(false);
          this.showSaveModal.set(true);
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


