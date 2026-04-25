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
import { ReportsPage } from './pages/reports-page/reports-page';
import { SetupPage } from './pages/setup-page/setup-page';
import { ChangePasswordPage } from './pages/change-password-page/change-password-page';
import { authGuard } from './guards/auth.guard';
import { adminGuard } from './guards/admin.guard';
import { setupGuard } from './guards/setup.guard';
import { changePasswordGuard } from './guards/change-password.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'setup', component: SetupPage, canActivate: [setupGuard] },
  { path: 'login', component: LoginPage },
  { path: 'register', component: NewUserPage },
  { path: 'change-password', component: ChangePasswordPage, canActivate: [authGuard] },
  { path: 'monitor', component: MonitorPage, canActivate: [authGuard, changePasswordGuard] },
  { path: 'edit/:id', component: EditPage, canActivate: [authGuard, changePasswordGuard] },
  { path: 'edit-template/:id', component: EditPage, canActivate: [authGuard, changePasswordGuard] },
  { path: 'newroom', component: NewRoomPage, canActivate: [authGuard, changePasswordGuard] },
  { path: 'control/:roomId/:ip', component: ControlPage, canActivate: [authGuard, changePasswordGuard] },
  { path: 'admin/users', component: AdminUserManagementPage, canActivate: [adminGuard, changePasswordGuard] },
  { path: 'admin/templates', component: AdminTemplateManagementPage, canActivate: [adminGuard, changePasswordGuard] },
  { path: 'profile', component: UserProfilePage, canActivate: [authGuard, changePasswordGuard] },
  { path: 'reports', component: ReportsPage, canActivate: [authGuard, changePasswordGuard] },
];
