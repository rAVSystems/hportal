import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { AuthService, AuthResponse } from '../../services/auth-service';
import { environment } from '../../../environments/environment';


interface ChannelConfig {
  name: string;
  token: string;
  tokenSet?: boolean;
}


const ALL_CHANNELS: { value: string; label: string }[] = [
  { value: 'discord', label: 'Discord' },
  { value: 'slack', label: 'Slack' },
  { value: 'imessage', label: 'iMessage' },
  { value: 'teams', label: 'Microsoft Teams' },
];

interface TemplateDoc {
  _id: string;
  name: string;
  icon: string;
  createdby: string;
  created: string;
  permission: string;
}

interface TemplateEditState {
  editingName: boolean;
  pendingName: string;
  saving: boolean;
}

@Component({
  selector: 'app-user-profile-page',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatIconModule, MatInputModule, MatFormFieldModule, MatSelectModule],
  templateUrl: './user-profile-page.html',
  styleUrl: './user-profile-page.scss',
})
export class UserProfilePage implements OnInit, OnDestroy {
  private readonly apiBase = environment.apiUrl;

  // ── Username ──────────────────────────────────────────────────────────────
  newUsername = signal('');
  savingUsername = signal(false);
  usernameSuccess = signal(false);
  usernameError = signal<string | null>(null);

  // ── Password ──────────────────────────────────────────────────────────────
  newPassword = signal('');
  confirmPassword = signal('');
  savingPassword = signal(false);
  passwordSuccess = signal(false);
  passwordError = signal<string | null>(null);

  // ── Templates ─────────────────────────────────────────────────────────────
  templates = signal<TemplateDoc[]>([]);
  templatesLoading = signal(false);
  templatesError = signal<string | null>(null);
  editState = new Map<string, TemplateEditState>();
  private stateVersion = signal(0);

  // ── rAV Agent ─────────────────────────────────────────────────────────────
  readonly MASKED_KEY = '••••••••••••••••';

  readonly LLM_MODELS = [
    { value: 'openai/gpt-4o', label: 'GPT-4o' },
    { value: 'openai/gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'openai/gpt-4.1', label: 'GPT-4.1' },
    { value: 'openai/gpt-4.1-mini', label: 'GPT-4.1 Mini' },
  ];

  openaiKey = signal('');
  openaiKeySet = signal(false);
  openaiBaseUrl = signal('');
  llmKeySaving = signal(false);
  llmKeySavingProvider = signal<string | null>(null);
  llmKeySaveError = signal<string | null>(null);

  llmError = signal<string | null>(null);
  llmErrorMsg = signal<string | null>(null);
  pendingActiveModel = signal('');
  activeModelSaving = signal(false);

  // kept for channels/skills/status
  openclawSaving = signal(false);
  openclawSuccess = signal<string | null>(null);
  openclawError = signal<string | null>(null);
  openclawRunning = signal<boolean | null>(null);
  openclawActionBusy = signal(false);

  channels = signal<ChannelConfig[]>([]);
  channelsSaving = signal(false);
  channelsSuccess = signal<string | null>(null);
  channelsError = signal<string | null>(null);
  pairingRequests = signal<any[]>([]);
  approvedUsers = signal<{ channel: string; id: string; name: string }[]>([]);
  approvingCode = signal<string | null>(null);
  revokingUser = signal<string | null>(null);
  enabledSkills = signal<Set<string>>(new Set());
  allSkills = signal<{ id: string; label: string; description: string; kind: 'skill' | 'scheduled'; builtin?: boolean }[]>([]);
  skillsSaving = signal(false);
  skillsSuccess = signal<string | null>(null);
  skillsError = signal<string | null>(null);

  sectionsCollapsed = signal<{ custom: boolean; scheduled: boolean; builtin: boolean }>({ custom: false, scheduled: false, builtin: true });

  workspaceSkills = computed(() => this.allSkills().filter(s => s.kind === 'skill'));
  scheduledSkills = computed(() => this.allSkills().filter(s => s.kind === 'scheduled'));

  toggleSection(section: 'custom' | 'scheduled' | 'builtin') {
    this.sectionsCollapsed.update(s => ({ ...s, [section]: !s[section] }));
  }

  pendingFallbackModel = signal('');
  fallbackModelSaving = signal(false);

  setActiveModel(value: string): void {
    this.pendingActiveModel.set(value);
  }

  setFallbackModel(value: string): void {
    this.pendingFallbackModel.set(value);
  }

  saveLlmKey(provider: string): void {
    const key = this.openaiKey();
    if (!key || key === this.MASKED_KEY) return;
    this.llmKeySaving.set(true);
    this.llmKeySavingProvider.set(provider);
    this.llmKeySaveError.set(null);
    this.http.post(`${this.apiBase}/openclaw/configure-llm`, {
      llmProvider: provider, apiKey: key, baseUrl: this.openaiBaseUrl() || null,
    }, { headers: this.authHeaders() }).subscribe({
      next: () => {
        this.llmKeySaving.set(false);
        this.llmKeySavingProvider.set(null);
        this.openaiKey.set(this.MASKED_KEY);
        this.openaiKeySet.set(true);
      },
      error: (err) => {
        this.llmKeySaving.set(false);
        this.llmKeySavingProvider.set(null);
        this.llmKeySaveError.set(err?.error?.error || 'Failed to save.');
      },
    });
  }

  saveLlmSettings(): void {
    const key = this.openaiKey();
    const model = this.pendingActiveModel();
    const hasNewKey = !!(key && key !== this.MASKED_KEY);
    this.llmKeySaving.set(true);
    this.llmKeySavingProvider.set('openai');
    this.llmKeySaveError.set(null);
    this.llmError.set(null);
    this.http.post(`${this.apiBase}/openclaw/configure-llm`, {
      llmProvider: 'openai',
      apiKey: hasNewKey ? key : undefined,
      baseUrl: this.openaiBaseUrl() || null,
      model: model || undefined,
    }, { headers: this.authHeaders() }).subscribe({
      next: () => {
        this.llmKeySaving.set(false);
        this.llmKeySavingProvider.set(null);
        if (hasNewKey) { this.openaiKey.set(this.MASKED_KEY); this.openaiKeySet.set(true); }
      },
      error: (err) => {
        this.llmKeySaving.set(false);
        this.llmKeySavingProvider.set(null);
        this.llmKeySaveError.set(err?.error?.error || 'Failed to save.');
      },
    });
  }

  saveActiveModel(): void {
    const model = this.pendingActiveModel();
    if (!model) return;
    this.activeModelSaving.set(true);
    this.llmError.set(null);
    this.http.post(`${this.apiBase}/openclaw/configure-llm`, {
      llmProvider: 'openai', model,
    }, { headers: this.authHeaders() }).subscribe({
      next: () => {
        this.activeModelSaving.set(false);
      },
      error: (err) => {
        this.activeModelSaving.set(false);
        this.llmError.set('active');
        this.llmErrorMsg.set(err?.error?.error || 'Failed to apply model.');
      },
    });
  }

  readonly allChannels = ALL_CHANNELS;

  isChannelEnabled(name: string): boolean {
    return this.channels().some(c => c.name === name);
  }

  tokenFor(name: string): string {
    return this.channels().find(c => c.name === name)?.token ?? '';
  }

  tokenSetFor(name: string): boolean {
    return this.channels().find(c => c.name === name)?.tokenSet ?? false;
  }

  toggleChannel(name: string): void {
    this.channels.update(list => {
      if (list.some(c => c.name === name)) {
        return list.filter(c => c.name !== name);
      }
      return [...list, { name, token: '' }];
    });
  }

  setChannelToken(name: string, token: string): void {
    this.channels.update(list =>
      list.map(c => c.name === name ? { ...c, token } : c)
    );
  }



  // ── API credentials ───────────────────────────────────────────────────────
  apiUsername = signal('');
  apiPassword = signal('');
  apiSaving = signal(false);
  apiSuccess = signal(false);
  apiError = signal<string | null>(null);

  // ── MQTT credentials ──────────────────────────────────────────────────────
  mqttUsername = signal('');
  mqttPassword = signal('');
  mqttSaving = signal(false);
  mqttSuccess = signal(false);
  mqttError = signal<string | null>(null);

  mongoPassword = signal('');
  mongoSaving = signal(false);
  mongoSuccess = signal(false);
  mongoError = signal<string | null>(null);

  // ── Delete confirmation ───────────────────────────────────────────────────
  pendingDeleteId = signal<string | null>(null);
  deleteConfirmInput = signal('');
  deleteError = signal<string | null>(null);
  deleting = signal(false);

  get pendingDeleteTemplate(): TemplateDoc | null {
    const id = this.pendingDeleteId();
    return id ? (this.templates().find(t => t._id === id) ?? null) : null;
  }

  constructor(
    private http: HttpClient,
    public auth: AuthService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.newUsername.set(this.auth.user()?.username ?? '');
    this.loadTemplates();
    if (this.auth.hasRole('admin')) {
      this.loadSettings();
      this.pollOpenclawStatus();
    }
  }

  ngOnDestroy(): void {}

  private pollOpenclawStatus(): void {
    this.http.get<{ running: boolean }>(`${this.apiBase}/openclaw/status`, { headers: this.authHeaders() }).subscribe({
      next: (res) => {
        this.openclawRunning.set(res.running);
        if (res.running) {
          this.fetchModels();
          this.fetchPairingRequests();
          this.fetchSkills();
        } else {
          this.pairingRequests.set([]);
        }
      },
      error: () => this.openclawRunning.set(false),
    });
  }

  startOpenclaw(): void {
    if (this.openclawActionBusy()) return;
    this.openclawActionBusy.set(true);
    this.http.post(`${this.apiBase}/openclaw/start`, {}, { headers: this.authHeaders() }).subscribe({
      next: () => { setTimeout(() => { this.pollOpenclawStatus(); this.openclawActionBusy.set(false); }, 4000); },
      error: () => this.openclawActionBusy.set(false),
    });
  }

  stopOpenclaw(): void {
    if (this.openclawActionBusy()) return;
    this.openclawActionBusy.set(true);
    this.http.post(`${this.apiBase}/openclaw/stop`, {}, { headers: this.authHeaders() }).subscribe({
      next: () => { this.openclawRunning.set(false); this.openclawActionBusy.set(false); },
      error: () => this.openclawActionBusy.set(false),
    });
  }

  private authHeaders(): Record<string, string> {
    const token = this.auth.token();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  // ── Username ──────────────────────────────────────────────────────────────

  saveUsername(): void {
    const username = this.newUsername().trim();
    if (!username || username === this.auth.user()?.username) return;
    this.savingUsername.set(true);
    this.usernameError.set(null);
    this.http.patch<AuthResponse>(`${this.apiBase}/auth/me/username`, { username }, { headers: this.authHeaders() }).subscribe({
      next: (res) => {
        this.auth.updateAuth(res);
        this.savingUsername.set(false);
        this.usernameSuccess.set(true);
        setTimeout(() => this.usernameSuccess.set(false), 2000);
      },
      error: (err) => {
        this.usernameError.set(err?.error?.error || 'Failed to update username.');
        this.savingUsername.set(false);
      },
    });
  }

  // ── Password ──────────────────────────────────────────────────────────────

  savePassword(): void {
    const password = this.newPassword();
    if (!password) return;
    if (password !== this.confirmPassword()) {
      this.passwordError.set('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      this.passwordError.set('Password must be at least 8 characters.');
      return;
    }
    this.savingPassword.set(true);
    this.passwordError.set(null);
    this.http.patch(`${this.apiBase}/auth/me/password`, { password }, { headers: this.authHeaders() }).subscribe({
      next: () => {
        this.savingPassword.set(false);
        this.passwordSuccess.set(true);
        this.newPassword.set('');
        this.confirmPassword.set('');
        setTimeout(() => this.passwordSuccess.set(false), 2000);
      },
      error: (err) => {
        this.passwordError.set(err?.error?.error || 'Failed to update password.');
        this.savingPassword.set(false);
      },
    });
  }

  // ── Templates ─────────────────────────────────────────────────────────────

  loadTemplates(): void {
    this.templatesLoading.set(true);
    this.templatesError.set(null);
    this.http.get<TemplateDoc[]>(`${this.apiBase}/templates/mine`, { headers: this.authHeaders() }).subscribe({
      next: (data) => {
        this.templates.set(data);
        this.templatesLoading.set(false);
      },
      error: (err) => {
        this.templatesError.set(err?.error?.error || 'Failed to load templates.');
        this.templatesLoading.set(false);
      },
    });
  }

  stateFor(id: string): TemplateEditState {
    if (!this.editState.has(id)) {
      this.editState.set(id, { editingName: false, pendingName: '', saving: false });
    }
    return this.editState.get(id)!;
  }

  startEditName(id: string, currentName: string): void {
    const s = this.stateFor(id);
    s.editingName = true;
    s.pendingName = currentName;
    this.stateVersion.update(v => v + 1);
  }

  cancelEditName(id: string): void {
    this.stateFor(id).editingName = false;
    this.stateVersion.update(v => v + 1);
  }

  saveName(id: string): void {
    const s = this.stateFor(id);
    const name = s.pendingName.trim();
    if (!name) return;
    s.saving = true;
    this.http.patch(`${this.apiBase}/templates/${id}`, { name }, { headers: this.authHeaders() }).subscribe({
      next: () => {
        this.templates.update(list => list.map(t => t._id === id ? { ...t, name } : t));
        s.editingName = false;
        s.saving = false;
        this.stateVersion.update(v => v + 1);
      },
      error: (err) => {
        this.templatesError.set(err?.error?.error || 'Failed to rename template.');
        s.saving = false;
        this.stateVersion.update(v => v + 1);
      },
    });
  }

  promptDelete(id: string): void {
    this.pendingDeleteId.set(id);
    this.deleteConfirmInput.set('');
    this.deleteError.set(null);
  }

  cancelDelete(): void {
    this.pendingDeleteId.set(null);
    this.deleteError.set(null);
  }

  confirmDelete(): void {
    const template = this.pendingDeleteTemplate;
    if (!template) return;
    if (this.deleteConfirmInput().trim() !== template.name.trim()) {
      this.deleteError.set('Name does not match. Please try again.');
      return;
    }
    this.deleting.set(true);
    this.deleteError.set(null);
    this.http.delete(`${this.apiBase}/templates/${template._id}`, { headers: this.authHeaders() }).subscribe({
      next: () => {
        this.templates.update(list => list.filter(t => t._id !== template._id));
        this.pendingDeleteId.set(null);
        this.deleting.set(false);
      },
      error: (err) => {
        this.deleteError.set(err?.error?.error || 'Failed to delete template.');
        this.deleting.set(false);
      },
    });
  }

  // ── Settings load ─────────────────────────────────────────────────────────

  private loadSettings(): void {
    this.http.get<any>(`${this.apiBase}/settings`, { headers: this.authHeaders() }).subscribe({
      next: (s) => {
        const mqttUser = s.mqttCredentials?.username;
        if (mqttUser && mqttUser !== 'not-configured') this.mqttUsername.set(mqttUser);
        const apiUser = s.apiCredentials?.username;
        if (apiUser && apiUser !== 'not-configured') this.apiUsername.set(apiUser);
        if (Array.isArray(s.openclawChannels)) {
          this.channels.set(s.openclawChannels.map((c: any) => ({
            name: c.name,
            token: c.tokenSet ? '••••••••••••••••' : '',
            tokenSet: !!c.tokenSet,
          })));
        }
        if (s.openclawLlmKeySet) {
          this.openaiKeySet.set(true); this.openaiKey.set(this.MASKED_KEY);
        }
        if (s.openclawBaseUrl) {
          this.openaiBaseUrl.set(s.openclawBaseUrl);
        }
      },
      error: () => {},
    });

    this.http.get<{ model: string }>(`${this.apiBase}/openclaw/active-model`, { headers: this.authHeaders() }).subscribe({
      next: (res) => {
        if (res.model) this.pendingActiveModel.set(res.model);
      },
      error: () => {},
    });
  }

  private fetchPairingRequests(): void {
    this.http.get<any[]>(`${this.apiBase}/openclaw/pairing`, { headers: this.authHeaders() }).subscribe({
      next: (reqs) => this.pairingRequests.set(reqs),
      error: () => {},
    });
    this.http.get<{ channel: string; id: string; name: string }[]>(`${this.apiBase}/openclaw/pairing/approved`, { headers: this.authHeaders() }).subscribe({
      next: (users) => this.approvedUsers.set(users),
      error: () => {},
    });
  }

  revokeUser(channel: string, id: string): void {
    this.revokingUser.set(id);
    this.http.post(`${this.apiBase}/openclaw/pairing/revoke`, { channel, id }, { headers: this.authHeaders() }).subscribe({
      next: () => {
        this.approvedUsers.update(users => users.filter(u => u.id !== id));
        this.revokingUser.set(null);
      },
      error: () => this.revokingUser.set(null),
    });
  }

  approvePairing(code: string, channel = 'discord', id?: string): void {
    this.approvingCode.set(code);
    this.http.post(`${this.apiBase}/openclaw/pairing/approve`, { code, channel }, { headers: this.authHeaders() }).subscribe({
      next: () => {
        this.pairingRequests.update(reqs => reqs.filter(r => r.code !== code));
        this.approvingCode.set(null);
        this.fetchPairingRequests();
      },
      error: () => this.approvingCode.set(null),
    });
  }

  private fetchModels(): void { /* no-op: models are now hardcoded per provider */ }

  // ── OpenClaw ──────────────────────────────────────────────────────────────

  saveOpenClaw(): void { /* no-op */ }


  saveChannels(): void {
    if (this.channelsSaving()) return;
    this.channelsSaving.set(true);
    this.channelsError.set(null);
    this.channelsSuccess.set(null);

    const MASKED = '••••••••••••••••';
    const newTokens = this.channels().filter(c => c.token && c.token !== MASKED);

    if (newTokens.length === 0) {
      this.channelsSaving.set(false);
      this.channelsSuccess.set('Saved.');
      setTimeout(() => this.channelsSuccess.set(null), 2000);
      return;
    }

    let done = 0;
    let failed = false;
    for (const ch of newTokens) {
      this.http.post(`${this.apiBase}/openclaw/configure-channel`, {
        channel: ch.name, token: ch.token,
      }, { headers: this.authHeaders() }).subscribe({
        next: () => {
          done++;
          this.channels.update(list => list.map(c =>
            c.name === ch.name ? { ...c, token: MASKED, tokenSet: true } : c
          ));
          if (done === newTokens.length && !failed) {
            this.channelsSaving.set(false);
            this.channelsSuccess.set('Channel settings saved.');
            setTimeout(() => this.channelsSuccess.set(null), 3000);
          }
        },
        error: (err) => {
          if (!failed) {
            failed = true;
            this.channelsSaving.set(false);
            this.channelsError.set(err?.error?.error || 'Failed to configure channel.');
          }
        },
      });
    }
  }

  private fetchSkills(): void {
    const skills$ = this.http.get<{ id: string; label: string; enabled: boolean }[]>(
      `${this.apiBase}/openclaw/skills`, { headers: this.authHeaders() }
    );
    const jobs$ = this.http.get<{ jobs: { name: string; script: string; cron: string; enabled?: boolean }[] }>(
      `${this.apiBase}/scheduler/jobs`, { headers: this.authHeaders() }
    );

    skills$.subscribe({
      next: (res: any) => {
        const rawSkills: { name: string; description: string; enabled: boolean }[] = Array.isArray(res) ? res : (res?.skills ?? []);
        const scheduled = this.allSkills().filter(s => s.kind === 'scheduled');
        const skillItems = rawSkills.map(s => ({
          id: s.name,
          label: s.name.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
          description: s.description || '',
          kind: 'skill' as const,
          builtin: true,
        }));
        this.allSkills.set([...skillItems, ...scheduled]);
        const enabled = new Set(this.enabledSkills());
        rawSkills.forEach(s => s.enabled ? enabled.add(s.name) : enabled.delete(s.name));
        this.enabledSkills.set(enabled);
      },
      error: () => {},
    });

    jobs$.subscribe({
      next: ({ jobs }) => {
        const existing = this.allSkills().filter(s => s.kind === 'skill');
        const scheduledItems = (jobs || []).map(j => ({
          id: `scheduled:${j.name}`,
          label: j.name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          description: this.describeCron(j.cron),
          kind: 'scheduled' as const,
        }));
        this.allSkills.set([...existing, ...scheduledItems]);
        const enabled = new Set(this.enabledSkills());
        (jobs || []).forEach(j => {
          const id = `scheduled:${j.name}`;
          j.enabled !== false ? enabled.add(id) : enabled.delete(id);
        });
        this.enabledSkills.set(enabled);
      },
      error: () => {},
    });
  }

  isSkillEnabled(id: string): boolean {
    return this.enabledSkills().has(id);
  }

  toggleSkill(id: string): void {
    this.enabledSkills.update(set => {
      const next = new Set(set);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  saveSkills(): void {
    if (this.skillsSaving()) return;
    this.skillsSaving.set(true);
    this.skillsError.set(null);
    this.skillsSuccess.set(null);

    const allItems = this.allSkills();
    const enabled = this.enabledSkills();

    const enabledSkillIds = allItems
      .filter(s => s.kind === 'skill' && enabled.has(s.id))
      .map(s => s.id);

    const scheduledChanges = allItems
      .filter(s => s.kind === 'scheduled')
      .map(s => ({ name: s.id.replace('scheduled:', ''), enabled: enabled.has(s.id) }));

    let pending = 1 + scheduledChanges.length;
    let failed = false;

    const done = (err?: string) => {
      if (err) { failed = true; this.skillsError.set(err); }
      if (--pending === 0) {
        this.skillsSaving.set(false);
        if (!failed) {
          this.skillsSuccess.set('Skills saved.');
          setTimeout(() => this.skillsSuccess.set(null), 2000);
        }
      }
    };

    this.http.put(`${this.apiBase}/openclaw/skills`, { enabled: enabledSkillIds }, { headers: this.authHeaders() })
      .subscribe({ next: () => done(), error: (err) => done(err?.error?.error || 'Failed to save skills.') });

    for (const { name, enabled: isEnabled } of scheduledChanges) {
      this.http.patch(`${this.apiBase}/scheduler/jobs/${name}`, { enabled: isEnabled }, { headers: this.authHeaders() })
        .subscribe({ next: () => done(), error: (err) => done(err?.error?.error || `Failed to update ${name}.`) });
    }
  }

  // ── API credentials ───────────────────────────────────────────────────────

  saveApiCredentials(): void {
    if (this.apiSaving() || !this.apiUsername().trim() || !this.apiPassword().trim()) return;
    this.apiSaving.set(true);
    this.apiError.set(null);
    this.http.post(`${this.apiBase}/openclaw/configure-db-credentials`, {
      username: this.apiUsername().trim(),
      password: this.apiPassword(),
    }, { headers: this.authHeaders() }).subscribe({
      next: () => {
        this.apiSaving.set(false);
        this.apiPassword.set('');
        this.apiSuccess.set(true);
        setTimeout(() => this.apiSuccess.set(false), 3000);
      },
      error: (err) => {
        this.apiSaving.set(false);
        this.apiError.set(err?.error?.error || 'Failed to save.');
      },
    });
  }

  // ── MQTT credentials ──────────────────────────────────────────────────────

  saveMqttCredentials(): void {
    if (this.mqttSaving() || !this.mqttUsername().trim()) return;
    this.mqttSaving.set(true);
    this.mqttError.set(null);
    this.http.put(`${this.apiBase}/settings`, {
      mqttCredentials: { username: this.mqttUsername().trim(), password: this.mqttPassword() },
    }, { headers: this.authHeaders() }).subscribe({
      next: () => {
        this.mqttSaving.set(false);
        this.mqttPassword.set('');
        this.mqttSuccess.set(true);
        setTimeout(() => this.mqttSuccess.set(false), 2000);
      },
      error: (err) => {
        this.mqttSaving.set(false);
        this.mqttError.set(err?.error?.error || 'Failed to save.');
      },
    });
  }

  resetMongoPassword(): void {
    if (this.mongoSaving() || !this.mongoPassword().trim()) return;
    this.mongoSaving.set(true);
    this.mongoError.set(null);
    this.http.post(`${this.apiBase}/settings/reset-mongo-password`, { password: this.mongoPassword() }, { headers: this.authHeaders() }).subscribe({
      next: () => {
        this.mongoSaving.set(false);
        this.mongoPassword.set('');
        this.mongoSuccess.set(true);
        setTimeout(() => this.mongoSuccess.set(false), 3000);
      },
      error: (err) => {
        this.mongoSaving.set(false);
        this.mongoError.set(err?.error?.error || 'Failed to reset password.');
      },
    });
  }

  formatDate(iso: string): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString();
  }

  describeCron(cron: string): string {
    const parts = cron.replace(/#.*$/, '').trim().split(/\s+/);
    if (parts.length !== 5) return cron;
    const [min, hour, dom, month, dow] = parts;
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    const fmtTime = (h: string, m: string) => {
      const hNum = parseInt(h), mNum = parseInt(m);
      if (isNaN(hNum) || isNaN(mNum)) return `${m}m ${h}h UTC`;
      const suffix = hNum >= 12 ? 'PM' : 'AM';
      const h12 = hNum % 12 || 12;
      return `${h12}:${mNum.toString().padStart(2,'0')} ${suffix} UTC`;
    };

    if (min === '*' && hour === '*' && dom === '*' && month === '*' && dow === '*') return 'Every minute';
    if (hour === '*' && dom === '*' && month === '*' && dow === '*') {
      if (min.startsWith('*/')) return `Every ${min.slice(2)} minutes`;
    }
    if (dom === '*' && month === '*' && dow === '*') {
      if (hour.startsWith('*/')) return `Every ${hour.slice(2)} hours`;
      return `Daily at ${fmtTime(hour, min)}`;
    }
    if (dom === '*' && month === '*' && dow !== '*') {
      const dayName = days[parseInt(dow)] ?? dow;
      return `Every ${dayName} at ${fmtTime(hour, min)}`;
    }
    if (dow === '*' && month === '*' && dom !== '*') {
      return `Monthly on day ${dom} at ${fmtTime(hour, min)}`;
    }
    return cron;
  }

  editTemplate(id: string): void {
    this.router.navigate(['/edit-template', id]);
  }

  scrollTo(id: string): void {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  goBack(): void {
    this.router.navigate(['/monitor']);
  }
}
