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
    });

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

    const configToSave = {
      ...raw,
      SystemOnActions: flattenActions(raw.SystemOnActions),
      SystemOffActions: flattenActions(raw.SystemOffActions),
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
