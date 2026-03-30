import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../services/auth-service';

type Message = { role: 'user' | 'assistant'; content: string };

export type RickToolCall = { name: string; input: Record<string, any> };

@Component({
  selector: 'app-rick',
  imports: [FormsModule, MatIconModule],
  templateUrl: './rick.html',
  styleUrl: './rick.scss',
})
export class Rick {
  @ViewChild('messagesContainer') messagesContainer!: ElementRef<HTMLElement>;

  @Input() config: any = null;
  @Output() toolCall = new EventEmitter<RickToolCall>();

  messages: Message[] = [
    { role: 'assistant', content: 'Hi! I\'m Rick. What do you want to do?' },
  ];
  inputText = '';
  thinking = false;

  constructor(
    private readonly http: HttpClient,
    private readonly auth: AuthService,
  ) {}

  private apiBase(): string {
    return (window as any).API_BASE_URL || 'http://localhost:8080';
  }

  send(): void {
    const text = this.inputText.trim();
    if (!text || this.thinking) return;

    this.messages.push({ role: 'user', content: text });
    this.inputText = '';
    this.thinking = true;

    setTimeout(() => this.scrollToBottom(), 0);

    const token = this.auth.token();
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });

    // Build message history for API (exclude initial greeting)
    const history = this.messages.map(m => ({ role: m.role, content: m.content }));

    this.http.post<{ text: string; toolCalls: RickToolCall[] }>(
      `${this.apiBase()}/rick/chat`,
      { messages: history, config: this.config },
      { headers }
    ).subscribe({
      next: (res) => {
        this.thinking = false;
        if (res.text) {
          this.messages.push({ role: 'assistant', content: res.text });
        }
        for (const tc of res.toolCalls ?? []) {
          this.toolCall.emit(tc);
        }
        setTimeout(() => this.scrollToBottom(), 0);
      },
      error: () => {
        this.thinking = false;
        this.messages.push({ role: 'assistant', content: 'Sorry, I ran into an error. Please try again.' });
        setTimeout(() => this.scrollToBottom(), 0);
      },
    });
  }

  private scrollToBottom(): void {
    const el = this.messagesContainer?.nativeElement;
    if (el) el.scrollTop = el.scrollHeight;
  }
}
