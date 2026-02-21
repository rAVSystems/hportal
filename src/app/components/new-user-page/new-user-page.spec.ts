import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NewUserPage } from './new-user-page';

describe('NewUserPage', () => {
  let component: NewUserPage;
  let fixture: ComponentFixture<NewUserPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NewUserPage]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NewUserPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
