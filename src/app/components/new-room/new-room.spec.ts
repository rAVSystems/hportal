import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NewRoom } from './new-room';

describe('NewRoom', () => {
  let component: NewRoom;
  let fixture: ComponentFixture<NewRoom>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NewRoom]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NewRoom);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
