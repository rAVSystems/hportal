import { Routes } from '@angular/router';
import { LoginPage } from './components/login-page/login-page';
import { NewUserPage } from './components/new-user-page/new-user-page';
import { MonitorPage } from './components/monitor-page/monitor-page';
import { EditPage } from './components/edit-page/edit-page';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginPage },
  { path: 'register', component: NewUserPage },
  { path: 'monitor', component: MonitorPage },
  { path: 'edit/:id', component: EditPage }
];
