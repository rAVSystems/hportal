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

type LlmProvider = 'chatgpt' | 'gemini' | 'claude' | '';

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
  private readonly apiBase: string = (window as any).API_BASE_URL || 'http://localhost:8080';

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

  // ── OpenClaw ──────────────────────────────────────────────────────────────
  llmProvider = signal<LlmProvider>('');
  llmModel = signal('');
  llmApiKey = signal('');
  llmKeyIsSet = signal(false);
  readonly MASKED_KEY = '••••••••••••••••';
  allModels = signal<string[]>([]);
  channels = signal<ChannelConfig[]>([]);
  channelsSaving = signal(false);
  channelsSuccess = signal<string | null>(null);
  channelsError = signal<string | null>(null);
  pairingRequests = signal<any[]>([]);
  approvingCode = signal<string | null>(null);
  enabledSkills = signal<Set<string>>(new Set());
  allSkills = signal<{ id: string; label: string; description: string }[]>([]);
  skillsSaving = signal(false);
  skillsSuccess = signal<string | null>(null);
  skillsError = signal<string | null>(null);
  openclawSaving = signal(false);
  openclawSuccess = signal<string | null>(null);
  openclawError = signal<string | null>(null);
  openclawRunning = signal<boolean | null>(null); // null = unknown
  openclawActionBusy = signal(false);
  openclawDashboardUrl = signal<string | null>(null);
private statusPollTimer: any = null;

  readonly llmOptions: { value: LlmProvider; label: string }[] = [
    { value: 'claude', label: 'Claude (Anthropic)' },
    { value: 'chatgpt', label: 'ChatGPT (OpenAI)' },
    { value: 'gemini', label: 'Gemini (Google)' },
  ];

  readonly providerPrefix: Record<string, string> = {
    claude: 'anthropic/',
    chatgpt: 'openai/',
    gemini: 'google/',
  };

  filteredModels = computed(() => {
    const prefix = this.providerPrefix[this.llmProvider()];
    if (!prefix) return [];
    return this.allModels().filter(m => m.startsWith(prefix));
  });

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
      this.statusPollTimer = setInterval(() => this.pollOpenclawStatus(), 10000);
    }
  }

  ngOnDestroy(): void {
    if (this.statusPollTimer) clearInterval(this.statusPollTimer);
  }

  private pollOpenclawStatus(): void {
    this.http.get<{ running: boolean }>(`${this.apiBase}/openclaw/status`, { headers: this.authHeaders() }).subscribe({
      next: (res) => {
        this.openclawRunning.set(res.running);
        if (res.running) {
          this.fetchDashboardUrl();
          this.fetchModels();
          this.fetchPairingRequests();
          this.fetchSkills();
        } else {
          this.openclawDashboardUrl.set(null);
          this.pairingRequests.set([]);
        }
      },
      error: () => this.openclawRunning.set(false),
    });
  }

  private fetchDashboardUrl(): void {
    this.http.get<{ url: string }>(`${this.apiBase}/openclaw/dashboard-url`, { headers: this.authHeaders() }).subscribe({
      next: (res) => this.openclawDashboardUrl.set(res.url),
      error: () => this.openclawDashboardUrl.set(null),
    });
  }


  startOpenclaw(): void {
    if (this.openclawActionBusy()) return;
    this.openclawActionBusy.set(true);
    this.http.post(`${this.apiBase}/openclaw/start`, {}, { headers: this.authHeaders() }).subscribe({
      next: () => { setTimeout(() => { this.pollOpenclawStatus(); this.openclawActionBusy.set(false); }, 3000); },
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
        if (s.openclawLlmProvider) this.llmProvider.set(s.openclawLlmProvider);
        this.llmKeyIsSet.set(!!s.openclawLlmKeySet);
        if (s.openclawLlmKeySet) this.llmApiKey.set(this.MASKED_KEY);
        // Skills are loaded live from openclaw in fetchSkills() once status is known
        if (Array.isArray(s.openclawChannels)) {
          this.channels.set(s.openclawChannels.map((c: any) => ({
            name: c.name,
            token: c.tokenSet ? '••••••••••••••••' : '',
            tokenSet: !!c.tokenSet,
          })));
        }
        if (Array.isArray(s.openclawModelCache) && s.openclawModelCache.length > 0) {
          this.allModels.set(s.openclawModelCache);
          if (s.openclawLlmModel) this.llmModel.set(s.openclawLlmModel);
        } else {
          // No cache yet — fetch live from openclaw
          this.fetchModels(s.openclawLlmModel ?? '');
        }
      },
      error: () => {},
    });
  }

  private fetchPairingRequests(): void {
    this.http.get<any[]>(`${this.apiBase}/openclaw/pairing`, { headers: this.authHeaders() }).subscribe({
      next: (reqs) => this.pairingRequests.set(reqs),
      error: () => {},
    });
  }

  approvePairing(code: string, channel = 'discord'): void {
    this.approvingCode.set(code);
    this.http.post(`${this.apiBase}/openclaw/pairing/approve`, { code, channel }, { headers: this.authHeaders() }).subscribe({
      next: () => {
        this.pairingRequests.update(reqs => reqs.filter(r => r.code !== code));
        this.approvingCode.set(null);
      },
      error: () => this.approvingCode.set(null),
    });
  }

  private fetchModels(selectModel = ''): void {
    this.http.get<string[]>(`${this.apiBase}/openclaw/models`, { headers: this.authHeaders() }).subscribe({
      next: (models) => {
        this.allModels.set(models);
        const toSelect = selectModel || this.llmModel();
        if (toSelect) this.llmModel.set(toSelect);
      },
      error: () => {},
    });
  }

  onProviderChange(provider: string): void {
    this.llmProvider.set(provider as LlmProvider);
    this.llmModel.set(''); // reset model when provider changes
  }

  // ── OpenClaw ──────────────────────────────────────────────────────────────

  saveOpenClaw(): void {
    if (this.openclawSaving()) return;
    const rawKey = this.llmApiKey().trim();
    const hasKey = this.llmKeyIsSet() || (rawKey && rawKey !== this.MASKED_KEY);
    if (this.llmProvider() && !hasKey) {
      this.openclawError.set('An API key is required to configure the LLM provider.');
      return;
    }
    this.openclawSaving.set(true);
    this.openclawError.set(null);
    this.openclawSuccess.set(null);

    const settingsBody: any = {
      openclawLlmProvider: this.llmProvider(),
      openclawLlmModel: this.llmModel(),
      openclawChannels: this.channels(),
    };

    // Save to DB first
    this.http.put(`${this.apiBase}/settings`, settingsBody, { headers: this.authHeaders() }).subscribe({
      next: () => {
        const apiKey = rawKey === this.MASKED_KEY ? '' : rawKey;
        const provider = this.llmProvider();
        if (provider) {
          // Always call configure-llm when a provider is set so model changes take effect.
          // apiKey is optional — if empty, only the model is switched (no restart).
          this.http.post<{ model: string }>(`${this.apiBase}/openclaw/configure-llm`, {
            llmProvider: provider,
            apiKey,
            model: this.llmModel(),
          }, { headers: this.authHeaders() }).subscribe({
            next: (res) => {
              if (apiKey) this.llmKeyIsSet.set(true);
              this.llmApiKey.set(this.llmKeyIsSet() ? this.MASKED_KEY : '');
              this.openclawSaving.set(false);
              this.openclawSuccess.set(`Saved. Model set to ${res.model}.`);
              setTimeout(() => this.openclawSuccess.set(null), 4000);
            },
            error: (err) => {
              this.openclawSaving.set(false);
              this.openclawError.set(err?.error?.error || 'Settings saved but failed to configure OpenClaw.');
            },
          });
        } else {
          this.llmApiKey.set('');
          this.openclawSaving.set(false);
          this.openclawSuccess.set('Saved.');
          setTimeout(() => this.openclawSuccess.set(null), 2000);
        }
      },
      error: (err) => {
        this.openclawSaving.set(false);
        this.openclawError.set(err?.error?.error || 'Failed to save.');
      },
    });
  }

  saveChannels(): void {
    if (this.channelsSaving()) return;
    this.channelsSaving.set(true);
    this.channelsError.set(null);
    this.channelsSuccess.set(null);

    const MASKED = '••••••••••••••••';
    const calls = this.channels()
      .filter(c => c.token && c.token !== MASKED)
      .map(c => ({ name: c.name, obs: this.http.post(`${this.apiBase}/openclaw/configure-channel`, { channel: c.name, token: c.token }, { headers: this.authHeaders() }) }));

    if (calls.length === 0) {
      this.channelsSaving.set(false);
      this.channelsSuccess.set('Saved.');
      setTimeout(() => this.channelsSuccess.set(null), 2000);
      return;
    }

    let done = 0;
    let failed = false;
    for (const { name, obs } of calls) {
      obs.subscribe({
        next: () => {
          done++;
          this.channels.update(list => list.map(c =>
            c.name === name ? { ...c, token: MASKED, tokenSet: true } : c
          ));
          if (done === calls.length && !failed) {
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
    this.http.get<{ skills: { name: string; description: string; eligible: boolean; enabled: boolean }[] }>(
      `${this.apiBase}/openclaw/skills`, { headers: this.authHeaders() }
    ).subscribe({
      next: (res) => {
        this.allSkills.set(res.skills.map(s => ({
          id: s.name,
          label: s.name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          description: s.description,
        })));
        this.enabledSkills.set(new Set(res.skills.filter(s => s.enabled).map(s => s.name)));
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
    const skills = Array.from(this.enabledSkills());
    this.http.put(`${this.apiBase}/openclaw/skills`, { enabled: skills }, { headers: this.authHeaders() }).subscribe({
      next: () => {
        this.skillsSaving.set(false);
        this.skillsSuccess.set('Skills saved.');
        setTimeout(() => this.skillsSuccess.set(null), 2000);
      },
      error: (err) => {
        this.skillsSaving.set(false);
        this.skillsError.set(err?.error?.error || 'Failed to save skills.');
      },
    });
  }

  // ── API credentials ───────────────────────────────────────────────────────

  saveApiCredentials(): void {
    if (this.apiSaving() || !this.apiUsername().trim() || !this.apiPassword().trim()) return;
    this.apiSaving.set(true);
    this.apiError.set(null);
    this.http.put(`${this.apiBase}/settings`, {
      apiCredentials: { username: this.apiUsername().trim(), password: this.apiPassword() },
    }, { headers: this.authHeaders() }).subscribe({
      next: () => {
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
            this.apiError.set(err?.error?.error || 'Saved but failed to update OpenClaw container.');
          },
        });
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

  formatDate(iso: string): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString();
  }

  editTemplate(id: string): void {
    this.router.navigate(['/edit-template', id]);
  }

  goBack(): void {
    this.router.navigate(['/monitor']);
  }
}
