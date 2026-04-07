import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-control-page',
  imports: [CommonModule, MatIconModule, MatButtonModule],
  templateUrl: './control-page.html',
  styleUrl: './control-page.scss',
})
export class ControlPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private sanitizer = inject(DomSanitizer);

  roomId = signal('');
  ip = signal('');
  roomName = signal('');
  iframeSrc = signal<SafeResourceUrl>('');
  advanced = signal(false);

  private readonly INROOM_PORT = 3000;
  private readonly ADVANCED_PORT = 3001;

  ngOnInit() {
    const roomId = this.route.snapshot.paramMap.get('roomId') ?? '';
    const ip = this.route.snapshot.paramMap.get('ip') ?? '';
    const building = this.route.snapshot.queryParamMap.get('building') ?? '';
    const room = this.route.snapshot.queryParamMap.get('room') ?? '';
    const mode = this.route.snapshot.queryParamMap.get('mode') ?? 'inroom';
    const isAdvanced = mode === 'advanced';
    this.advanced.set(isAdvanced);
    this.roomId.set(roomId);
    this.ip.set(ip);
    this.roomName.set(building && room ? `${building} · ${room}` : building || room);
    const piHost = window.location.hostname;
    const port = isAdvanced ? this.ADVANCED_PORT : this.INROOM_PORT;
    const url = `http://${piHost}:${port}/?ip=${ip}`;
    this.iframeSrc.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));
  }

  goBack() {
    this.router.navigate(['/monitor']);
  }

  openFullscreen() {
    const piHost = window.location.hostname;
    const port = this.advanced() ? this.ADVANCED_PORT : this.INROOM_PORT;
    const url = `http://${piHost}:${port}/?ip=${this.ip()}`;
    window.open(url, '_blank');
  }
}
