import { Routes } from '@angular/router';
import { LoginPage } from './pages/login-page/login-page';
import { NewUserPage } from './pages/new-user-page/new-user-page';
import { MonitorPage } from './pages/monitor-page/monitor-page';
import { EditPage } from './pages/edit-page/edit-page';
import { NewRoomPage } from './pages/new-room-page/new-room-page';
import { ControlPage } from './pages/control-page/control-page';
import { AdminUserManagementPage } from './pages/admin-user-management-page/admin-user-management-page';
import { AdminTemplateManagementPage } from './pages/admin-template-management-page/admin-template-management-page';
import { UserProfilePage } from './pages/user-profile-page/user-profile-page';
import { authGuard } from './guards/auth.guard';
import { adminGuard } from './guards/admin.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginPage },
  { path: 'register', component: NewUserPage },
  { path: 'monitor', component: MonitorPage, canActivate: [authGuard] },
  { path: 'edit/:id', component: EditPage, canActivate: [authGuard] },
  { path: 'newroom', component: NewRoomPage, canActivate: [authGuard] },
  { path: 'control/:roomId/:ip', component: ControlPage, canActivate: [authGuard] },
  { path: 'admin/users', component: AdminUserManagementPage, canActivate: [adminGuard] },
  { path: 'admin/templates', component: AdminTemplateManagementPage, canActivate: [adminGuard] },
  { path: 'profile', component: UserProfilePage, canActivate: [authGuard] },
];
