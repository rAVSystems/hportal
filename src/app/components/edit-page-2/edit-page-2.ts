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
import { MatCheckboxModule } from '@angular/material/checkbox';
import { DragDropModule, CdkDragDrop } from '@angular/cdk/drag-drop';

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
  | 'SetGain';

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
  min?: number;
  max?: number;
  options?: (ctx: EditorContext, group?: FormGroup) => Option[];
};

@Component({
  selector: 'app-edit-page-2',
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
    MatCheckboxModule,
    DragDropModule,],
  templateUrl: './edit-page-2.html',
  styleUrl: './edit-page-2.scss',
})
export class EditPage2 {
/** UI state */
  loading = signal(true);
  loadError = signal<string | null>(null);
  saving = signal(false);
  readonly panelOpenState = signal(false);

  /** Route param */
  roomId: string = '';

  /** Dropdowns */
  roomTypes = signal<string[]>([
    'Classroom',
    'Large Classroom',
    'Conference Room',
    'Lecture Hall',
    'Seminar room',
    'All-In-One Conference Room'
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
        options: (c) =>
          c.allDevices
            .filter((d) =>
              d.interfaces.some((i) =>
                ['display', 'projector'].includes(i.toLowerCase())
              )
            )
            .map((d) => ({ value: d.id, label: d.friendlyName ?? d.id })),
      },
    ],
    TurnOff: [
      {
        key: 'device',
        label: 'Device',
        kind: 'select',
        required: true,
        options: (c) =>
          c.allDevices
            .filter((d) =>
              d.interfaces.some((i) =>
                ['display', 'projector'].includes(i.toLowerCase())
              )
            )
            .map((d) => ({ value: d.id, label: d.friendlyName ?? d.id })),
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
                i.toLowerCase().includes('encoder') ||
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
                enc.inputs.forEach((inp) => {
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
    private readonly router: Router
  ) {
    this.form = this.fb.group({
      campus: ['', Validators.required],
      building: ['', Validators.required],
      room: ['', Validators.required],
      ip: ['', Validators.required],
      roomType: [''],
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
      Sources: this.fb.array([]),
      Devices: this.fb.array([]),
      Gains: this.fb.array([]),
    });

    this.devices.valueChanges.subscribe(() => this.syncCtxDevices());
    this.gains.valueChanges.subscribe(() => this.syncCtxGains());
  }

  private syncCtxDevices(): void {
    const allDevices = this.deviceControls.map((g) => {
      const ifaces = g.get('Interfaces')?.value ?? {};
      return {
        id: g.get('key')?.value ?? '',
        friendlyName: g.get('FriendlyName')?.value ?? '',
        interfaces: Object.entries(ifaces).filter(([, v]) => v).map(([k]) => k),
        inputs: (g.get('Inputs') as FormArray)?.controls.map((c) => ({
          Name: (c as FormGroup).get('Name')?.value ?? '',
          Value: (c as FormGroup).get('Value')?.value ?? '',
        })) ?? [],
        outputs: (g.get('Outputs') as FormArray)?.controls.map((c) => ({
          Name: (c as FormGroup).get('Name')?.value ?? '',
          Value: (c as FormGroup).get('Value')?.value ?? '',
        })) ?? [],
      };
    });
    this.ctx.update(c => ({ ...c, allDevices }));
  }
  readonly interfaceOptions = ['switcher', 'display', 'encoder', 'decoder', 'camera', 'capture', 'wireless', 'network'];
  readonly controlTypeOptions = ['ip', 'qsys', 'rs232', 'cec'];
  expandedDevices = signal<Set<number>>(new Set());
  expandedGains = signal<Set<number>>(new Set());

  get devices(): FormArray {
    return this.form.get('Devices') as FormArray;
  }

  get deviceControls(): FormGroup[] {
    return this.devices.controls as FormGroup[];
  }

  private buildDeviceGroup(key: string = '', d: any = {}): FormGroup {
    return this.fb.group({
      key: [key],
      FriendlyName: [d.FriendlyName ?? ''],
      Make: [d.Make ?? ''],
      Model: [d.Model ?? ''],
      IpAddress: [d.IpAddress ?? ''],
      Description: [d.Description ?? ''],
      DefaultInput: [d.DefaultInput ?? null],
      Username: [d.Username ?? ''],
      Password: [d.Password ?? ''],
      ControlType: [d.ControlType ?? 'ip'],
      Interfaces: this.fb.group(
        Object.fromEntries(this.interfaceOptions.map(i => [i, [(d.Interfaces ?? []).includes(i)]]))
      ),
      Inputs: this.fb.array((d.Inputs ?? []).map((inp: any) => this.fb.group({ Name: [inp.Name ?? ''], Value: [inp.Value ?? ''] }))),
      Outputs: this.fb.array((d.Outputs ?? []).map((out: any) => this.fb.group({ Name: [out.Name ?? ''], Value: [out.Value ?? ''] }))),
    });
  }

  addDevice(): void {
    this.devices.push(this.buildDeviceGroup());
  }

  removeDevice(index: number): void {
    this.devices.removeAt(index);
    this.expandedDevices.update(s => { const n = new Set(s); n.delete(index); return n; });
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

  getInputsArray(deviceIndex: number): FormArray {
    return this.deviceControls[deviceIndex].get('Inputs') as FormArray;
  }

  getOutputsArray(deviceIndex: number): FormArray {
    return this.deviceControls[deviceIndex].get('Outputs') as FormArray;
  }

  addInput(deviceIndex: number): void {
    this.getInputsArray(deviceIndex).push(this.fb.group({ Name: [''], Value: [''] }));
  }

  removeInput(deviceIndex: number, inputIndex: number): void {
    this.getInputsArray(deviceIndex).removeAt(inputIndex);
  }

  addOutput(deviceIndex: number): void {
    this.getOutputsArray(deviceIndex).push(this.fb.group({ Name: [''], Value: [''] }));
  }

  removeOutput(deviceIndex: number, outputIndex: number): void {
    this.getOutputsArray(deviceIndex).removeAt(outputIndex);
  }

  get gains(): FormArray { return this.form.get('Gains') as FormArray; }
  get gainControls(): FormGroup[] { return this.gains.controls as FormGroup[]; }

  private syncCtxGains(): void {
    const gainIds = this.gainControls.map(g => g.get('key')?.value ?? '').filter(Boolean);
    this.ctx.update(c => ({ ...c, gainIds }));
  }

  private buildGainGroup(key: string = '', g: any = {}): FormGroup {
    return this.fb.group({
      key: [key],
      Label: [g.Label ?? ''],
      ControlId: [g.ControlId ?? null],
      IsInvisible: [g.IsInvisible ?? false],
      Min: [g.Min ?? -50],
      Max: [g.Max ?? -10],
      MuteLabel: [g.MuteLabel ?? 'Mute'],
      MuteActiveLabel: [g.MuteActiveLabel ?? 'Muted'],
      SliderStyle: [g.SliderStyle ?? ''],
      MuteStyle: [g.MuteStyle ?? ''],
      MuteActiveStyle: [g.MuteActiveStyle ?? ''],
    });
  }

  addGain(): void { this.gains.push(this.buildGainGroup()); }

  removeGain(index: number): void {
    this.gains.removeAt(index);
    this.expandedGains.update(s => { const n = new Set(s); n.delete(index); return n; });
  }

  toggleGainExpand(index: number): void {
    this.expandedGains.update(s => { const n = new Set(s); n.has(index) ? n.delete(index) : n.add(index); return n; });
  }

  isGainExpanded(index: number): boolean { return this.expandedGains().has(index); }

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
  
    /** Iterable collections for @for in template (FormArray itself is not iterable) */
    get systemOnActionControls(): FormGroup[] {
      return (this.systemOnActions?.controls ?? []) as FormGroup[];
    }
  
    get systemOffActionControls(): FormGroup[] {
      return (this.systemOffActions?.controls ?? []) as FormGroup[];
    }
  
    get sources(): FormArray {
      return this.form.get('Sources') as FormArray;
    }
  
    get sourceControls(): FormGroup[] {
      return (this.sources?.controls ?? []) as FormGroup[];
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
  
      // Wire device changes for every action instance
      const wireDeviceChanges = (g: FormGroup) => {
        const params = g.get('params') as FormGroup;
        if (!params) return;
  
        const deviceCtrl = params.get('device');
        if (!deviceCtrl) return;
  
        deviceCtrl.valueChanges.subscribe(() => {
          const inputCtrl = params.get('input');
          const outputCtrl = params.get('output');

          if (inputCtrl) inputCtrl.setValue(null);
          if (outputCtrl) outputCtrl.setValue(null);
        });
      };
  
      wireDeviceChanges(group);
  
      // When action type changes, always rebuild params group from latest schema
      group.get('action')!.valueChanges.subscribe((newType) => {
        const oldParams = group.get('params');

        // Build a fresh params group from the schema
        const newParams = this.buildParamsGroup(newType);

        // Remove the old params control first to avoid Angular keeping stale references
        if (oldParams) {
          (group as any).removeControl('params');
        }

        // Add the new params group
        group.addControl('params', newParams);

        // Trigger validation / change detection
        newParams.updateValueAndValidity({ emitEvent: true });

        // Re-wire device change logic after params group is rebuilt
        wireDeviceChanges(group);
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
  
        Actions: this.fb.array(
          (Array.isArray(s?.Actions) ? s.Actions : []).map((a: any) =>
            this.createActionGroup(a)
          )
        ),
      });
    }
  
  addSource(): void {
    const nextIndex = this.sources.length + 1;
    const key = `Source_${nextIndex}_Btn`;
    this.sources.push(this.createSourceGroup(key));
  }
  
  removeSource(index: number): void {
    this.sources.removeAt(index);
  }
  
  getSourceActionControls(sourceIndex: number): FormGroup[] {
    const arr = this.sources.at(sourceIndex)?.get('Actions') as FormArray;
    return (arr?.controls ?? []) as FormGroup[];
  }
  
  addSourceAction(sourceIndex: number): void {
    const arr = this.sources.at(sourceIndex)?.get('Actions') as FormArray;
    arr?.push(this.createActionGroup());
  }
  
  removeSourceAction(sourceIndex: number, actionIndex: number): void {
    const arr = this.sources.at(sourceIndex)?.get('Actions') as FormArray;
    arr?.removeAt(actionIndex);
  }

  /** Table helpers for Sources table */

  getSourceLabel(index: number): string {
    const g = this.sources.at(index) as FormGroup;
    return g?.get('Label')?.value ?? '';
  }

  getSourceOrder(index: number): number {
    const g = this.sources.at(index) as FormGroup;
    return g?.get('Order')?.value ?? 0;
  }

  getSourceAutoStart(index: number): boolean {
    const g = this.sources.at(index) as FormGroup;
    return !!g?.get('AutoStart')?.value;
  }

  getSourceActionCount(index: number): number {
    const arr = this.sources.at(index)?.get('Actions') as FormArray;
    return arr?.length ?? 0;
  }

  /** Placeholder for future dialog editor */
  editSource(index: number): void {
    const g = this.sources.at(index) as FormGroup;
    console.log('Edit source', g?.value);
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

      return field.options(this.ctx(), fakeGroup);
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

    dropAction(arr: FormArray, event: CdkDragDrop<any[]>): void {
      if (event.previousIndex === event.currentIndex) return;
      const control = arr.at(event.previousIndex);
      arr.removeAt(event.previousIndex, { emitEvent: false });
      arr.insert(event.currentIndex, control, { emitEvent: false });
    }

    scrollTo(id: string): void {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
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
  
      const flattenSource = (s: any) => ({
        ...s,
        Actions: flattenActions(s?.Actions),
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

      const configToSave = {
        ...raw,
        roomId: this.roomId,
        updatedAt: this.toIsoOrNull(raw.updatedAt),
        slaExpireAt: this.toIsoOrNull(raw.slaExpireAt),
        SystemOnActions: flattenActions(raw.SystemOnActions),
        SystemOffActions: flattenActions(raw.SystemOffActions),
        Sources: sourcesObject,
        Devices: devicesObject,
        Gains: (Array.isArray(raw.Gains) ? raw.Gains : []).reduce((acc: any, g: any) => {
          const key = g.key; if (!key) return acc;
          const { key: _, ...rest } = g;
          acc[key] = rest; return acc;
        }, {}),
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


