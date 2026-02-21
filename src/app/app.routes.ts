import { Routes } from '@angular/router';
import { LoginPage } from './components/login-page/login-page';
import { NewUserPage } from './components/new-user-page/new-user-page';
import { MonitorPage } from './components/monitor-page/monitor-page';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginPage },
  { path: 'register', component: NewUserPage },
  { path: 'monitor', component: MonitorPage }
];
