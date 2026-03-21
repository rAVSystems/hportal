import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-control',
  imports: [CommonModule, MatIconModule, MatButtonModule],
  templateUrl: './control.html',
  styleUrl: './control.scss',
})
export class Control implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private sanitizer = inject(DomSanitizer);

  roomId = signal('');
  ip = signal('');
  roomName = signal('');
  iframeSrc = signal<SafeResourceUrl>('');

  // Port the touch panel app runs on the Pi
  private readonly GUI_PORT = 3000;

  ngOnInit() {
    const roomId = this.route.snapshot.paramMap.get('roomId') ?? '';
    const ip = this.route.snapshot.paramMap.get('ip') ?? '';
    const building = this.route.snapshot.queryParamMap.get('building') ?? '';
    const room = this.route.snapshot.queryParamMap.get('room') ?? '';
    this.roomId.set(roomId);
    this.ip.set(ip);
    this.roomName.set(building && room ? `${building} · ${room}` : building || room);
    const piHost = window.location.hostname;
    const url = `http://${piHost}:${this.GUI_PORT}/?ip=${ip}`;
    this.iframeSrc.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));
  }

  goBack() {
    this.router.navigate(['/monitor']);
  }
}
