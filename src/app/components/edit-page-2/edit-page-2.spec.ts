import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditPage2 } from './edit-page-2';

describe('EditPage2', () => {
  let component: EditPage2;
  let fixture: ComponentFixture<EditPage2>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditPage2]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EditPage2);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
