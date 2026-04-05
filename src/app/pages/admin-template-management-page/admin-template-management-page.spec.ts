import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdminTemplateManagementPage } from './admin-template-management-page';

describe('AdminTemplateManagementPage', () => {
  let component: AdminTemplateManagementPage;
  let fixture: ComponentFixture<AdminTemplateManagementPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminTemplateManagementPage]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AdminTemplateManagementPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
