import { CommonModule } from '@angular/common';
import { Component, OnDestroy, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../services/auth-service';
import { NavigationGuardService } from '../../services/navigation-guard.service';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  FormsModule,
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
import { MatCheckboxModule } from '@angular/material/checkbox';
import { IconPickerComponent } from '../../components/icon-picker/icon-picker';
import { Rick } from '../../components/rick/rick';

type ActionType =
  | 'TurnOn'
  | 'TurnOff'
  | 'RouteVideo'
  | 'TogglePage'
  | 'ShowPage'
  | 'HidePage'
  | 'StartAutoshutdown'
  | 'SetGain'
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
  selector: 'app-new-room-page',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    DragDropModule,
    MatCheckboxModule,
    IconPickerComponent,
    Rick,
  ],
  templateUrl: './new-room-page.html',
  styleUrl: './new-room-page.scss',
})
export class NewRoomPage implements OnDestroy {
  saving = signal(false);
  errorMessage = signal<string | null>(null);
  showTemplateModal = signal(false);
  showCancelConfirm = signal(false);
  showSaveTemplateModal = signal(false);
  templateName = '';
  savingTemplate = signal(false);
  saveTemplateError = signal<string | null>(null);
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
  expandedSources = signal<Set<number>>(new Set());

  get gains(): FormArray { return this.form.get('Gains') as FormArray; }
  get gainControls(): FormGroup[] { return this.gains.controls as FormGroup[]; }

  private syncCtxGains(): void {
    const gainIds = this.gainControls.map(g => g.get('key')?.value ?? '').filter(Boolean);
    this.ctx.update(c => ({ ...c, gainIds }));
  }

  private syncCtxPages(): void {
    const pageIds = this.pageControls.map(g => g.get('Id')?.value ?? '').filter(Boolean);
    this.ctx.update(c => ({ ...c, pageIds }));
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

  dropGain(event: CdkDragDrop<any[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const control = this.gains.at(event.previousIndex);
    this.gains.removeAt(event.previousIndex, { emitEvent: false });
    this.gains.insert(event.currentIndex, control, { emitEvent: false });
  }

  readonly interfaceOptions = ['switcher', 'display', 'encoder', 'decoder', 'camera', 'capture', 'wireless', 'network'];
  readonly controlTypeOptions = ['ip', 'qsys', 'rs232', 'cec'];

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
                  enc.inputs
                    .filter((inp) => inp.Name !== 'Clear')
                    .forEach((inp) =>
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
      { key: 'page', label: 'UI', kind: 'select', required: true, default: 'In-Room', options: () => [{ value: 'In-Room', label: 'In-Room' }, { value: 'Advanced', label: 'Advanced' }] },
      {
        key: 'layer', label: 'Page', kind: 'select',
        options: (c) => c.pageIds.map((p) => ({ value: p, label: p })),
      },
      {
        key: 'transition', label: 'Transition', kind: 'select',
        options: (c) => c.transitions.map((t) => ({ value: t, label: t })),
      },
    ],
    ShowPage: [
      { key: 'page', label: 'UI', kind: 'select', required: true, default: 'In-Room', options: () => [{ value: 'In-Room', label: 'In-Room' }, { value: 'Advanced', label: 'Advanced' }] },
      {
        key: 'layer', label: 'Page', kind: 'select',
        options: (c) => c.pageIds.map((p) => ({ value: p, label: p })),
      },
      {
        key: 'transition', label: 'Transition', kind: 'select',
        options: (c) => c.transitions.map((t) => ({ value: t, label: t })),
      },
    ],
    HidePage: [
      { key: 'page', label: 'UI', kind: 'select', required: true, default: 'In-Room', options: () => [{ value: 'In-Room', label: 'In-Room' }, { value: 'Advanced', label: 'Advanced' }] },
      {
        key: 'layer', label: 'Page', kind: 'select',
        options: (c) => c.pageIds.map((p) => ({ value: p, label: p })),
      },
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
  };

  readonly actionTypes = signal<ActionType[]>(
    Object.keys(this.actionSpecs) as ActionType[]
  );

  form!: FormGroup;

  constructor(
    private readonly fb: FormBuilder,
    private readonly http: HttpClient,
    private readonly router: Router,
    private readonly auth: AuthService,
    private readonly navGuard: NavigationGuardService
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
      Pages: this.fb.array([]),
    });

    this.devices.valueChanges.subscribe(() => this.syncCtxDevices());
    this.gains.valueChanges.subscribe(() => this.syncCtxGains());
    this.pages.valueChanges.subscribe(() => this.syncCtxPages());
    this.form.valueChanges.subscribe(() => {
      if (this.form.dirty) this.navGuard.setDirty(true);
    });
  }

  ngOnDestroy(): void {
    this.navGuard.setDirty(false);
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
      const v = s[f.key] ?? f.default ?? (f.kind === 'number' ? null : '');
      controls[f.key] = f.required ? [v, Validators.required] : [v];
    }
    return this.fb.group(controls);
  }

  private createActionGroup(seed?: any): FormGroup {
    const s = seed ?? {};
    const type = (s.action || 'TurnOn') as ActionType;
    const { action, ...seedWithoutAction } = s;

    const group = this.fb.group({
      action: this.fb.control<ActionType>(type, {
        nonNullable: true,
        validators: [Validators.required],
      }),
      params: this.buildParamsGroup(type, seedWithoutAction),
    });

    const autoFill = (g: FormGroup, actionType: ActionType) => {
      const params = g.get('params') as FormGroup;
      if (!params) return;
      const specs = this.actionSpecs[actionType] ?? [];
      for (const spec of specs) {
        if (spec.kind !== 'select' || !spec.options) continue;
        const ctrl = params.get(spec.key);
        if (!ctrl || ctrl.value) continue;
        const proxy = { get: (k: string) => params.get(k) } as any;
        const opts = spec.options(this.ctx(), proxy);
        if (opts.length === 1) ctrl.setValue(opts[0].value, { emitEvent: true });
      }
    };

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
        const currentType = g.get('action')?.value as ActionType;
        if (currentType) setTimeout(() => autoFill(g, currentType));
      });
    };

    wireDeviceChanges(group);
    autoFill(group, type);

    group.get('action')!.valueChanges.subscribe((newType) => {
      const params = group.get('params') as FormGroup;
      if (!params) return;

      const newFields = this.actionSpecs[newType] ?? [];
      const newKeys = new Set(newFields.map((f) => f.key));

      Object.keys(params.controls).forEach((key) => {
        if (!newKeys.has(key)) params.removeControl(key, { emitEvent: false });
      });

      newFields.forEach((f) => {
        if (!params.contains(f.key)) {
          const v = f.default ?? (f.kind === 'number' ? null : '');
          params.addControl(f.key, this.fb.control(v), { emitEvent: false });
        }
      });

      params.updateValueAndValidity({ emitEvent: true });
      wireDeviceChanges(group);
      autoFill(group, newType);
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

  get sources(): FormArray {
    return this.form.get('Sources') as FormArray;
  }

  get sourceControls(): FormGroup[] {
    return this.sources.controls as FormGroup[];
  }

  private createSourceGroup(key: string, seed?: any): FormGroup {
    const s = seed ?? {};
    return this.fb.group({
      Key: [key],
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
  }

  removeSource(index: number): void {
    this.sources.removeAt(index);
    this.expandedSources.update(s => { const n = new Set(s); n.delete(index); return n; });
  }

  dropSource(event: CdkDragDrop<any[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const control = this.sources.at(event.previousIndex);
    this.sources.removeAt(event.previousIndex, { emitEvent: false });
    this.sources.insert(event.currentIndex, control, { emitEvent: false });
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

  getSourceActionControls(sourceIndex: number): FormGroup[] {
    return (this.getSourceActionsArray(sourceIndex)?.controls ?? []) as FormGroup[];
  }

  addSourceAction(sourceIndex: number): void {
    this.getSourceActionsArray(sourceIndex)?.push(this.createActionGroup());
  }

  removeSourceAction(sourceIndex: number, actionIndex: number): void {
    this.getSourceActionsArray(sourceIndex)?.removeAt(actionIndex);
  }

  dropSourceAction(sourceIndex: number, event: CdkDragDrop<any[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const arr = this.getSourceActionsArray(sourceIndex);
    const control = arr.at(event.previousIndex);
    arr.removeAt(event.previousIndex, { emitEvent: false });
    arr.insert(event.currentIndex, control, { emitEvent: false });
  }

  addSourceHoldAction(sourceIndex: number): void {
    this.getSourceHoldActionsArray(sourceIndex)?.push(this.createActionGroup());
  }

  removeSourceHoldAction(sourceIndex: number, actionIndex: number): void {
    this.getSourceHoldActionsArray(sourceIndex)?.removeAt(actionIndex);
  }

  dropSourceHoldAction(sourceIndex: number, event: CdkDragDrop<any[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const arr = this.getSourceHoldActionsArray(sourceIndex);
    const control = arr.at(event.previousIndex);
    arr.removeAt(event.previousIndex, { emitEvent: false });
    arr.insert(event.currentIndex, control, { emitEvent: false });
  }

  getSourceActionFieldSpecs(sourceIndex: number, actionIndex: number): FieldSpec[] {
    const arr = this.getSourceActionsArray(sourceIndex);
    if (!arr) return [];
    return this.getFieldSpecsFor(arr, actionIndex);
  }

  // ── Pages ──────────────────────────────────────────────────────────────

  expandedPages = signal<Set<number>>(new Set());

  get pages(): FormArray { return this.form.get('Pages') as FormArray; }
  get pageControls(): FormGroup[] { return this.pages.controls as FormGroup[]; }

  private buildPageGroup(seed: any = {}): FormGroup {
    const componentsObj = (seed.Components && typeof seed.Components === 'object' && !Array.isArray(seed.Components))
      ? seed.Components : {};
    return this.fb.group({
      Id:          [seed.Id ?? ''],
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

  addPage(): void { this.pages.push(this.buildPageGroup()); }

  removePage(index: number): void {
    this.pages.removeAt(index);
    this.expandedPages.update(s => { const n = new Set(s); n.delete(index); return n; });
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
  }

  removePageAction(pageIndex: number, actionIndex: number): void {
    this.getPageActionsArray(pageIndex)?.removeAt(actionIndex);
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
  }

  dropPageAction(pageIndex: number, event: CdkDragDrop<any[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const arr = this.getPageActionsArray(pageIndex);
    const control = arr.at(event.previousIndex);
    arr.removeAt(event.previousIndex, { emitEvent: false });
    arr.insert(event.currentIndex, control, { emitEvent: false });
  }

  // ── Components (scoped per page) ────────────────────────────────────────

  // expandedComponents is keyed as `pageIndex-compIndex`
  expandedComponents = signal<Set<string>>(new Set());

  private buildComponentGroup(key: string, seed: any = {}): FormGroup {
    const propsObj = seed.Properties ?? {};
    return this.fb.group({
      Key:         [key],
      IsInvisible: [seed.IsInvisible ?? false],
      Properties:  this.fb.array(
        Object.entries(propsObj).map(([k, v]) =>
          this.fb.group({ key: [k], value: [v] })
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
  }

  removeComponent(pageIndex: number, compIndex: number): void {
    this.getPageComponentsArray(pageIndex)?.removeAt(compIndex);
    const key = `${pageIndex}-${compIndex}`;
    this.expandedComponents.update(s => { const n = new Set(s); n.delete(key); return n; });
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

  getComponentToggleActionsArray(pageIndex: number, compIndex: number): FormArray {
    return this.getPageComponentsArray(pageIndex)?.at(compIndex)?.get('ToggleActions') as FormArray;
  }

  addComponentHoldAction(pageIndex: number, compIndex: number): void {
    this.getComponentHoldActionsArray(pageIndex, compIndex)?.push(this.createActionGroup());
  }

  removeComponentHoldAction(pageIndex: number, compIndex: number, actionIndex: number): void {
    this.getComponentHoldActionsArray(pageIndex, compIndex)?.removeAt(actionIndex);
  }

  dropComponentHoldAction(pageIndex: number, compIndex: number, event: CdkDragDrop<any[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const arr = this.getComponentHoldActionsArray(pageIndex, compIndex);
    const control = arr.at(event.previousIndex);
    arr.removeAt(event.previousIndex, { emitEvent: false });
    arr.insert(event.currentIndex, control, { emitEvent: false });
  }

  addComponentToggleAction(pageIndex: number, compIndex: number): void {
    this.getComponentToggleActionsArray(pageIndex, compIndex)?.push(this.createActionGroup());
  }

  removeComponentToggleAction(pageIndex: number, compIndex: number, actionIndex: number): void {
    this.getComponentToggleActionsArray(pageIndex, compIndex)?.removeAt(actionIndex);
  }

  dropComponentToggleAction(pageIndex: number, compIndex: number, event: CdkDragDrop<any[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const arr = this.getComponentToggleActionsArray(pageIndex, compIndex);
    const control = arr.at(event.previousIndex);
    arr.removeAt(event.previousIndex, { emitEvent: false });
    arr.insert(event.currentIndex, control, { emitEvent: false });
  }

  getComponentActionFieldSpecs(pageIndex: number, compIndex: number, actionIndex: number): FieldSpec[] {
    const arr = this.getComponentActionsArray(pageIndex, compIndex);
    if (!arr) return [];
    return this.getFieldSpecsFor(arr, actionIndex);
  }

  getComponentHoldActionFieldSpecs(pageIndex: number, compIndex: number, actionIndex: number): FieldSpec[] {
    const arr = this.getComponentHoldActionsArray(pageIndex, compIndex);
    if (!arr) return [];
    return this.getFieldSpecsFor(arr, actionIndex);
  }

  getComponentToggleActionFieldSpecs(pageIndex: number, compIndex: number, actionIndex: number): FieldSpec[] {
    const arr = this.getComponentToggleActionsArray(pageIndex, compIndex);
    if (!arr) return [];
    return this.getFieldSpecsFor(arr, actionIndex);
  }

  getComponentPropertiesArray(pageIndex: number, compIndex: number): FormArray {
    return this.getPageComponentsArray(pageIndex)?.at(compIndex)?.get('Properties') as FormArray;
  }

  addComponentAction(pageIndex: number, compIndex: number): void {
    this.getComponentActionsArray(pageIndex, compIndex)?.push(this.createActionGroup());
  }

  removeComponentAction(pageIndex: number, compIndex: number, actionIndex: number): void {
    this.getComponentActionsArray(pageIndex, compIndex)?.removeAt(actionIndex);
  }

  addComponentProperty(pageIndex: number, compIndex: number): void {
    this.getComponentPropertiesArray(pageIndex, compIndex)?.push(this.fb.group({ key: [''], value: [''] }));
  }

  removeComponentProperty(pageIndex: number, compIndex: number, propIndex: number): void {
    this.getComponentPropertiesArray(pageIndex, compIndex)?.removeAt(propIndex);
  }

  dropComponent(pageIndex: number, event: CdkDragDrop<any[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const arr = this.getPageComponentsArray(pageIndex);
    const control = arr.at(event.previousIndex);
    arr.removeAt(event.previousIndex, { emitEvent: false });
    arr.insert(event.currentIndex, control, { emitEvent: false });
  }

  dropComponentAction(pageIndex: number, compIndex: number, event: CdkDragDrop<any[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const arr = this.getComponentActionsArray(pageIndex, compIndex);
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

  dropDevice(event: CdkDragDrop<any[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const control = this.devices.at(event.previousIndex);
    this.devices.removeAt(event.previousIndex, { emitEvent: false });
    this.devices.insert(event.currentIndex, control, { emitEvent: false });
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

    const options = field.options(this.ctx(), fakeGroup);

    // Exclude "System" from System On/Off Actions to avoid loops
    if (arrName.toLowerCase().startsWith('system')) {
      return options.filter((o) => o.value !== 'System');
    }

    return options;
  }

  onCancel(): void {
    this.showCancelConfirm.set(true);
  }

  confirmCancel(): void {
    this.navGuard.setDirty(false);
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

    const sourcesObject = (Array.isArray(raw.Sources) ? raw.Sources : []).reduce((acc: any, s: any) => {
      const key = s.Key || s.Control;
      if (!key) return acc;
      const { Key, ...rest } = s;
      acc[key] = { ...rest, Actions: flattenActions(rest.Actions) };
      return acc;
    }, {});

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

    const configToSave = {
      ...raw,
      SystemOnActions: flattenActions(raw.SystemOnActions),
      SystemOffActions: flattenActions(raw.SystemOffActions),
      Sources: sourcesObject,
      Devices: devicesObject,
      Gains: gainsObject,
      Pages: pagesArray,
    };

    const apiBase = (window as any).API_BASE_URL || 'http://localhost:8080';

    const token = this.auth.token();
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

    this.http.post(`${apiBase}/rooms`, configToSave, { headers }).subscribe({
      next: () => {
        this.saving.set(false);
        this.navGuard.setDirty(false);
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

    const apiBase = (window as any).API_BASE_URL || 'http://localhost:8080';
    const token = this.auth.token();
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

    this.http.get<{ _id: string; name: string; icon: string; createdby: string; created: string; permission: string }[]>(`${apiBase}/templates`, { headers }).subscribe({
      next: (data) => {
        this.templates.set(data);
        this.templatesLoading.set(false);
      },
      error: (err: any) => {
        this.templatesError.set(err?.error?.error || err?.message || 'Failed to load templates.');
        this.templatesLoading.set(false);
      },
    });
  }

  applyTemplate(template: { _id: string; name: string }): void {
    this.showTemplateModal.set(false);

    const apiBase = (window as any).API_BASE_URL || 'http://localhost:8080';
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

        this.sources.clear();
        this.expandedSources.set(new Set());
        Object.entries(config.Sources ?? {}).forEach(([key, s]) => this.sources.push(this.createSourceGroup(key, s)));

        this.devices.clear();
        this.expandedDevices.set(new Set());
        Object.entries(config.Devices ?? {}).forEach(([key, d]) => this.devices.push(this.buildDeviceGroup(key, d)));
        this.syncCtxDevices();

        this.gains.clear();
        this.expandedGains.set(new Set());
        Object.entries(config.Gains ?? {}).forEach(([key, g]) => this.gains.push(this.buildGainGroup(key, g)));
        this.syncCtxGains();

        this.pages.clear();
        this.expandedPages.set(new Set());
        this.expandedComponents.set(new Set());
        (Array.isArray(config.Pages) ? config.Pages : []).forEach((p: any) => this.pages.push(this.buildPageGroup(p)));
        this.syncCtxPages();
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
    this.showSaveTemplateModal.set(true);
    this.templateName = '';
    this.saveTemplateError.set(null);
  }

  confirmSaveTemplate(): void {
    const name = this.templateName.trim();
    if (!name) { this.saveTemplateError.set('Template name is required.'); return; }

    this.savingTemplate.set(true);
    this.saveTemplateError.set(null);

    const raw = this.form.getRawValue() as any;

    const flattenActions = (list: any[]) =>
      (Array.isArray(list) ? list : []).map((row: any) => ({ action: row?.action, ...(row?.params ?? {}) }));

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
        const { Key, ...rest } = s;
        acc[key] = { ...rest, Actions: flattenActions(rest.Actions), HoldActions: flattenActions(rest.HoldActions) };
        return acc;
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

    const apiBase = (window as any).API_BASE_URL || 'http://localhost:8080';
    const token = this.auth.token();
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

    this.http.post(`${apiBase}/templates`, { name, permission: 'user', config }, { headers }).subscribe({
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

  /** Returns current form value serialized as config — passed to Rick for context */
  get currentConfig(): any {
    const raw = this.form.getRawValue() as any;

    const flattenActions = (list: any[]) =>
      (Array.isArray(list) ? list : []).map((row) => ({
        action: row?.action,
        ...(row?.params ?? {}),
      }));

    const serializeComponents = (compsArray: any[]) =>
      (Array.isArray(compsArray) ? compsArray : []).reduce((acc: any, c: any) => {
        const key = c.Key;
        if (!key) return acc;
        const props = (Array.isArray(c.Properties) ? c.Properties : []).reduce((pa: any, p: any) => {
          if (p.key) pa[p.key] = p.value;
          return pa;
        }, {});
        acc[key] = { IsInvisible: c.IsInvisible, Properties: props, Actions: flattenActions(c.Actions), HoldActions: flattenActions(c.HoldActions), ToggleActions: flattenActions(c.ToggleActions), Control: {} };
        return acc;
      }, {});

    const sourcesObject = (Array.isArray(raw.Sources) ? raw.Sources : []).reduce((acc: any, s: any) => {
      const key = s.Key || s.Control;
      const { Key, ...rest } = { ...s, Actions: flattenActions(s?.Actions) };
      acc[key] = rest;
      return acc;
    }, {});

    const devicesObject = (Array.isArray(raw.Devices) ? raw.Devices : []).reduce((acc: any, d: any) => {
      const key = d.key;
      if (!key) return acc;
      const { key: _, Interfaces, ...rest } = d;
      acc[key] = { ...rest, Interfaces: Object.entries(Interfaces ?? {}).filter(([, v]) => v).map(([k]) => k) };
      return acc;
    }, {});

    const pagesArray = (Array.isArray(raw.Pages) ? raw.Pages : []).map((p: any) => ({
      Id: p.Id, Title: p.Title, Subtitle: p.Subtitle, Description: p.Description,
      Text: p.Text, Image: p.Image,
      Actions: flattenActions(p.Actions),
      Components: serializeComponents(p.Components),
    }));

    return {
      ...raw,
      SystemOnActions: flattenActions(raw.SystemOnActions),
      SystemOffActions: flattenActions(raw.SystemOffActions),
      Sources: sourcesObject,
      Devices: devicesObject,
      Pages: pagesArray,
      Gains: (Array.isArray(raw.Gains) ? raw.Gains : []).reduce((acc: any, g: any) => {
        const key = g.key; if (!key) return acc;
        const { key: _, ...rest } = g; acc[key] = rest; return acc;
      }, {}),
    };
  }

  /** Called by Rick when the AI returns tool_use blocks */
  applyToolCall(tc: { name: string; input: Record<string, any> }): void {
    const { name, input } = tc;

    if (name === 'set_system_setting') {
      this.form.get(input['field'])?.setValue(input['value']);
      return;
    }

    if (name === 'set_source_field') {
      const idx = (this.sources.controls as FormGroup[])
        .findIndex(g => g.get('Key')?.value === input['sourceKey'] || g.get('Control')?.value === input['sourceKey']);
      if (idx >= 0) (this.sources.at(idx) as FormGroup).get(input['field'])?.setValue(input['value']);
      return;
    }

    if (name === 'set_device_field') {
      const idx = (this.devices.controls as FormGroup[])
        .findIndex(g => g.get('key')?.value === input['deviceKey']);
      if (idx >= 0) (this.devices.at(idx) as FormGroup).get(input['field'])?.setValue(input['value']);
      return;
    }

    if (name === 'set_gain_field') {
      const gains = this.form.get('Gains') as FormArray;
      const idx = (gains.controls as FormGroup[])
        .findIndex(g => g.get('key')?.value === input['gainKey']);
      if (idx >= 0) (gains.at(idx) as FormGroup).get(input['field'])?.setValue(input['value']);
      return;
    }

    if (name === 'set_page_field') {
      const idx = (this.pages.controls as FormGroup[])
        .findIndex(g => g.get('Id')?.value === input['pageId']);
      if (idx >= 0) (this.pages.at(idx) as FormGroup).get(input['field'])?.setValue(input['value']);
      return;
    }

    if (name === 'set_component_field') {
      const pageIdx = (this.pages.controls as FormGroup[])
        .findIndex(g => g.get('Id')?.value === input['pageId']);
      if (pageIdx < 0) return;
      const comps = this.getPageComponentsArray(pageIdx);
      const compIdx = (comps.controls as FormGroup[])
        .findIndex(g => g.get('Key')?.value === input['componentKey']);
      if (compIdx >= 0) (comps.at(compIdx) as FormGroup).get(input['field'])?.setValue(input['value']);
      return;
    }
  }
}
