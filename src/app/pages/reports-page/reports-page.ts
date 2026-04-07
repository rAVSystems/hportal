import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { RouterModule } from '@angular/router';

export interface ReportRow {
  rank: number;
  room: string;
  building: string;
  value: string;
  raw: number;
}

export interface Report {
  id: string;
  title: string;
  icon: string;
  unit: string;
  color: string;
  rows: ReportRow[];
}

const ROOMS = [
  { room: 'Sever 101', building: 'Sever Hall' },
  { room: 'Sever 102', building: 'Sever Hall' },
  { room: 'Sever 103', building: 'Sever Hall' },
  { room: 'Sever 104', building: 'Sever Hall' },
  { room: 'Sever 105', building: 'Sever Hall' },
  { room: 'Harvard Hall 101', building: 'Harvard Hall' },
  { room: 'Harvard Hall 104', building: 'Harvard Hall' },
  { room: 'Harvard Hall 201', building: 'Harvard Hall' },
  { room: 'Harvard Hall 202', building: 'Harvard Hall' },
  { room: 'Emerson 101', building: 'Emerson Hall' },
  { room: 'Emerson 210', building: 'Emerson Hall' },
  { room: 'Boylston B10', building: 'Boylston Hall' },
  { room: 'Boylston 105', building: 'Boylston Hall' },
  { room: 'Widener 110', building: 'Widener Library' },
  { room: 'Science Ctr A', building: 'Science Center' },
];

function makeRows(values: number[], unit: string, format: (v: number) => string): ReportRow[] {
  return values
    .map((raw, i) => ({ rank: i + 1, room: ROOMS[i].room, building: ROOMS[i].building, value: format(raw), raw }))
    .sort((a, b) => b.raw - a.raw)
    .map((r, i) => ({ ...r, rank: i + 1 }))
    .slice(0, 10);
}

const REPORTS: Report[] = [
  {
    id: 'lamp-hours',
    title: 'Lamp Hours',
    icon: 'lightbulb',
    unit: 'hrs',
    color: '#f59e0b',
    rows: makeRows(
      [4821, 3204, 5510, 2198, 4402, 1887, 3991, 2750, 4105, 980, 3312, 2640, 1450, 3870, 2910],
      'hrs',
      v => `${v.toLocaleString()} hrs`
    ),
  },
  {
    id: 'system-on-time',
    title: 'System On Time',
    icon: 'power_settings_new',
    unit: 'hrs',
    color: '#10b981',
    rows: makeRows(
      [312, 205, 418, 188, 295, 140, 367, 220, 275, 95, 240, 185, 130, 310, 260],
      'hrs',
      v => `${v} hrs`
    ),
  },
  {
    id: 'system-on-count',
    title: 'Power On Count',
    icon: 'toggle_on',
    unit: 'times',
    color: '#6366f1',
    rows: makeRows(
      [842, 610, 915, 488, 720, 305, 780, 540, 660, 210, 590, 470, 380, 705, 630],
      'times',
      v => `${v.toLocaleString()} times`
    ),
  },
  {
    id: 'av-errors',
    title: 'AV Errors',
    icon: 'error_outline',
    unit: 'errors',
    color: '#ef4444',
    rows: makeRows(
      [48, 12, 73, 5, 31, 8, 55, 19, 27, 3, 42, 15, 9, 38, 22],
      'errors',
      v => `${v} errors`
    ),
  },
  {
    id: 'help-requests',
    title: 'Help Desk Requests',
    icon: 'support_agent',
    unit: 'tickets',
    color: '#8b5cf6',
    rows: makeRows(
      [24, 7, 38, 3, 15, 5, 29, 11, 18, 2, 21, 9, 4, 17, 13],
      'tickets',
      v => `${v} tickets`
    ),
  },
  {
    id: 'source-switches',
    title: 'Source Switches',
    icon: 'swap_horiz',
    unit: 'switches',
    color: '#0ea5e9',
    rows: makeRows(
      [1240, 830, 1580, 620, 1050, 440, 1320, 780, 960, 310, 890, 670, 510, 1100, 920],
      'switches',
      v => `${v.toLocaleString()} switches`
    ),
  },
  {
    id: 'display-errors',
    title: 'Display Sync Failures',
    icon: 'monitor',
    unit: 'failures',
    color: '#f97316',
    rows: makeRows(
      [18, 4, 27, 1, 12, 3, 22, 8, 14, 0, 16, 6, 2, 15, 9],
      'failures',
      v => `${v} failures`
    ),
  },
  {
    id: 'avg-session',
    title: 'Avg Session Length',
    icon: 'schedule',
    unit: 'min',
    color: '#14b8a6',
    rows: makeRows(
      [74, 58, 82, 45, 67, 41, 79, 55, 63, 38, 70, 52, 44, 68, 61],
      'min',
      v => `${v} min`
    ),
  },
  {
    id: 'network-drops',
    title: 'Network Drops',
    icon: 'wifi_off',
    unit: 'drops',
    color: '#64748b',
    rows: makeRows(
      [9, 2, 14, 0, 6, 1, 11, 4, 7, 0, 8, 3, 1, 7, 5],
      'drops',
      v => `${v} drops`
    ),
  },
  {
    id: 'audio-complaints',
    title: 'Audio Complaints',
    icon: 'volume_off',
    unit: 'complaints',
    color: '#ec4899',
    rows: makeRows(
      [11, 3, 17, 1, 8, 2, 14, 5, 9, 0, 10, 4, 2, 9, 6],
      'complaints',
      v => `${v} complaints`
    ),
  },
  {
    id: 'camera-usage',
    title: 'Camera Usage',
    icon: 'videocam',
    unit: 'sessions',
    color: '#0284c7',
    rows: makeRows(
      [280, 195, 340, 120, 225, 88, 310, 170, 240, 65, 210, 145, 95, 265, 200],
      'sessions',
      v => `${v.toLocaleString()} sessions`
    ),
  },
  {
    id: 'wireless-connections',
    title: 'Wireless Connections',
    icon: 'cast',
    unit: 'connections',
    color: '#7c3aed',
    rows: makeRows(
      [620, 410, 780, 280, 510, 195, 690, 370, 480, 140, 440, 320, 210, 570, 430],
      'connections',
      v => `${v.toLocaleString()} connections`
    ),
  },
];

@Component({
  selector: 'app-reports-page',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule, RouterModule],
  templateUrl: './reports-page.html',
  styleUrl: './reports-page.scss',
})
export class ReportsPage {
  reports = signal<Report[]>(REPORTS);
  lastUpdated = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
