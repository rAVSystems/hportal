import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Rick } from './rick';

describe('Rick', () => {
  let component: Rick;
  let fixture: ComponentFixture<Rick>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Rick]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Rick);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
