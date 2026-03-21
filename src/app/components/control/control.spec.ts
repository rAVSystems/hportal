import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Control } from './control';

describe('Control', () => {
  let component: Control;
  let fixture: ComponentFixture<Control>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Control]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Control);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
