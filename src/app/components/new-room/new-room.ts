import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../services/auth-service';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { DragDropModule, CdkDragDrop } from '@angular/cdk/drag-drop';

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
  selector: 'app-new-room',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    DragDropModule,
  ],
  templateUrl: './new-room.html',
  styleUrl: './new-room.scss',
})
export class NewRoom {
  saving = signal(false);
  errorMessage = signal<string | null>(null);
  showTemplateModal = signal(false);
  templates = signal<{ _id: string; name: string; icon: string; createdby: string; created: string; permission: string }[]>([]);
  templatesLoading = signal(false);
  templatesError = signal<string | null>(null);

  roomTypes = signal<string[]>([
    'Classroom',
    'Large Classroom',
    'Conference Room',
    'Lecture Hall',
    'Seminar room',
    'All-In-One Conference Room',
  ]);

  readonly ctx = signal<EditorContext>({
    allDevices: [],
    pageIds: [],
    layerIds: [],
    transitions: ['None', 'Fade', 'Slide'],
    gainIds: [],
  });

  selectedDevices = signal<Record<string, string>>({});
  expandedDevices = signal<Set<number>>(new Set());
  expandedGains = signal<Set<number>>(new Set());

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

  readonly interfaceOptions = ['switcher', 'display', 'encoder', 'decoder', 'camera', 'capture', 'wireless', 'network'];
  readonly controlTypeOptions = ['ip', 'qsys', 'rs232', 'cec'];

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
          const deviceId = group?.get('device')?.value;
          if (!deviceId) return [];
          const selected = ctx.allDevices.find((d) => d.id === deviceId);
          if (!selected) return [];

          const interfaces = (selected.interfaces ?? []).map((i) => i.toLowerCase());
          const isDecoder = interfaces.some((i) => i.includes('decoder'));
          const options: Option[] = [];

          if (Array.isArray(selected.inputs) && selected.inputs.length) {
            selected.inputs.forEach((inp) =>
              options.push({ value: inp.Value, label: inp.Name })
            );
          }

          if (isDecoder) {
            ctx.allDevices
              .filter((d) =>
                (d.interfaces ?? []).some((i) => i.toLowerCase().includes('encoder'))
              )
              .forEach((enc) => {
                if (Array.isArray(enc.inputs) && enc.inputs.length) {
                  enc.inputs.forEach((inp) =>
                    options.push({
                      value: inp.Value,
                      label: `[${enc.friendlyName ?? enc.id}] ${inp.Name}`,
                    })
                  );
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
          const deviceId = group?.get('device')?.value;
          if (!deviceId) return [];
          const selected = ctx.allDevices.find((d) => d.id === deviceId);
          if (!selected || !Array.isArray(selected.outputs) || !selected.outputs.length) return [];
          return selected.outputs.map((out) => ({ value: out.Value, label: out.Name }));
        },
      },
    ],
    TogglePage: [
      {
        key: 'page', label: 'Page', kind: 'select', required: true,
        options: (c) => c.pageIds.map((p) => ({ value: p, label: p })),
      },
      { key: 'layer', label: 'Layer', kind: 'text' },
      {
        key: 'transition', label: 'Transition', kind: 'select',
        options: (c) => c.transitions.map((t) => ({ value: t, label: t })),
      },
    ],
    ShowPage: [
      {
        key: 'page', label: 'Page', kind: 'select', required: true,
        options: (c) => c.pageIds.map((p) => ({ value: p, label: p })),
      },
      { key: 'layer', label: 'Layer', kind: 'text' },
      {
        key: 'transition', label: 'Transition', kind: 'select',
        options: (c) => c.transitions.map((t) => ({ value: t, label: t })),
      },
    ],
    HidePage: [
      {
        key: 'page', label: 'Page', kind: 'select', required: true,
        options: (c) => c.pageIds.map((p) => ({ value: p, label: p })),
      },
      { key: 'layer', label: 'Layer', kind: 'text' },
      {
        key: 'transition', label: 'Transition', kind: 'select',
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

  form!: FormGroup;

  constructor(
    private readonly fb: FormBuilder,
    private readonly http: HttpClient,
    private readonly router: Router,
    private readonly auth: AuthService
  ) {
    this.form = this.fb.group({
      campus: ['', Validators.required],
      building: ['', Validators.required],
      room: ['', Validators.required],
      ip: ['', Validators.required],
      roomType: [''],
      version: [1],
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

  get systemOnActions(): FormArray {
    return this.form.get('SystemOnActions') as FormArray;
  }

  get systemOffActions(): FormArray {
    return this.form.get('SystemOffActions') as FormArray;
  }

  get systemOnActionControls(): FormGroup[] {
    return this.systemOnActions.controls as FormGroup[];
  }

  get systemOffActionControls(): FormGroup[] {
    return this.systemOffActions.controls as FormGroup[];
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

  private createActionGroup(): FormGroup {
    const type: ActionType = 'TurnOn';
    const group = this.fb.group({
      action: this.fb.control<ActionType>(type, {
        nonNullable: true,
        validators: [Validators.required],
      }),
      params: this.buildParamsGroup(type),
    });

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

    group.get('action')!.valueChanges.subscribe((newType) => {
      (group as any).removeControl('params');
      const newParams = this.buildParamsGroup(newType);
      group.addControl('params', newParams);
      newParams.updateValueAndValidity({ emitEvent: true });
      wireDeviceChanges(group);
    });

    return group;
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

  get devices(): FormArray { return this.form.get('Devices') as FormArray; }
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

  getActionTypeAt(arr: FormArray, index: number): ActionType {
    return (arr.at(index) as FormGroup).get('action')?.value as ActionType;
  }

  getFieldSpecsFor(arr: FormArray, index: number): FieldSpec[] {
    return this.actionSpecs[this.getActionTypeAt(arr, index)] ?? [];
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

    const devicesObject = (Array.isArray(raw.Devices) ? raw.Devices : []).reduce((acc: any, d: any) => {
      const key = d.key; if (!key) return acc;
      const { key: _, Interfaces, ...rest } = d;
      acc[key] = { ...rest, Interfaces: Object.entries(Interfaces ?? {}).filter(([, v]) => v).map(([k]) => k) };
      return acc;
    }, {});

    const gainsObject = (Array.isArray(raw.Gains) ? raw.Gains : []).reduce((acc: any, g: any) => {
      const key = g.key; if (!key) return acc;
      const { key: _, ...rest } = g; acc[key] = rest; return acc;
    }, {});

    const configToSave = {
      ...raw,
      SystemOnActions: flattenActions(raw.SystemOnActions),
      SystemOffActions: flattenActions(raw.SystemOffActions),
      Devices: devicesObject,
      Gains: gainsObject,
    };

    const apiBase = (window as any).API_BASE_URL || 'http://192.168.1.225:8080';

    this.http.post(`${apiBase}/rooms`, { config: configToSave }).subscribe({
      next: () => {
        this.saving.set(false);
        this.router.navigate(['/monitor']);
      },
      error: (err) => {
        this.saving.set(false);
        this.errorMessage.set(err?.error?.error || err?.message || 'Save failed.');
      },
    });
  }

  scrollTo(id: string): void {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  }

  loadTemplate(): void {
    this.showTemplateModal.set(true);
    this.templatesLoading.set(true);
    this.templatesError.set(null);

    const apiBase = (window as any).API_BASE_URL || 'http://192.168.1.225:8080';
    const token = this.auth.token();
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

    this.http.get<{ _id: string; name: string; icon: string; createdby: string; created: string; permission: string }[]>(`${apiBase}/templates`, { headers }).subscribe({
      next: (data) => {
        this.templates.set(data);
        this.templatesLoading.set(false);
      },
      error: (err) => {
        this.templatesError.set(err?.error?.error || err?.message || 'Failed to load templates.');
        this.templatesLoading.set(false);
      },
    });
  }

  applyTemplate(template: { _id: string; name: string }): void {
    this.showTemplateModal.set(false);

    const apiBase = (window as any).API_BASE_URL || 'http://192.168.1.225:8080';
    const token = this.auth.token();
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

    this.http.get<{ _id: string; name: string; config: any }>(`${apiBase}/templates/${template._id}`, { headers }).subscribe({
      next: (doc) => {
        const config = doc.config;
        if (!config) return;

        this.form.patchValue({
          campus: config.campus ?? '',
          building: config.building ?? '',
          room: config.room ?? '',
          ip: config.ip ?? '',
          roomType: config.roomType ?? '',
          version: config.version ?? 1,
        });

        this.systemOnActions.clear();
        (config.SystemOnActions ?? []).forEach((a: any) => this.addActionFromConfig(this.systemOnActions, a));

        this.systemOffActions.clear();
        (config.SystemOffActions ?? []).forEach((a: any) => this.addActionFromConfig(this.systemOffActions, a));

        this.devices.clear();
        this.expandedDevices.set(new Set());
        Object.entries(config.Devices ?? {}).forEach(([key, d]) => this.devices.push(this.buildDeviceGroup(key, d)));
        this.syncCtxDevices();

        this.gains.clear();
        this.expandedGains.set(new Set());
        Object.entries(config.Gains ?? {}).forEach(([key, g]) => this.gains.push(this.buildGainGroup(key, g)));
        this.syncCtxGains();
      },
    });
  }

  private addActionFromConfig(arr: any, a: any): void {
    const { action, ...params } = a;
    const actionType = action as ActionType;
    const fields = this.actionSpecs[actionType] ?? [];
    const paramsGroup = this.fb.group(
      Object.fromEntries(fields.map((f) => [f.key, [params[f.key] ?? null]]))
    );
    arr.push(this.fb.group({ action: [actionType], params: paramsGroup }));
  }

  closeTemplateModal(): void {
    this.showTemplateModal.set(false);
  }

  saveTemplate(): void {
    // TODO: implement template saving
  }
}
