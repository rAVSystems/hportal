import { Routes } from '@angular/router';
import { LoginPage } from './components/login-page/login-page';
import { NewUserPage } from './components/new-user-page/new-user-page';
import { MonitorPage } from './components/monitor-page/monitor-page';
import { EditPage } from './components/edit-page/edit-page';
import { EditPage2 } from './components/edit-page-2/edit-page-2';
import { NewRoom } from './components/new-room/new-room';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginPage },
  { path: 'register', component: NewUserPage },
  { path: 'monitor', component: MonitorPage },
  { path: 'edit/:id', component: EditPage2 },
  { path: 'newroom', component: NewRoom },
];
