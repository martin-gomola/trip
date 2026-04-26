import { Component, HostListener } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputTextModule } from 'primeng/inputtext';
import { FocusTrapModule } from 'primeng/focustrap';
import { ColorPickerModule } from 'primeng/colorpicker';
import { TooltipModule } from 'primeng/tooltip';
import { Category } from '../../types/poi';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faBed,
  faBicycle,
  faBinoculars,
  faBus,
  faCableCar,
  faCamera,
  faCampground,
  faCar,
  faChampagneGlasses,
  faChargingStation,
  faChurch,
  faFerry,
  faHotel,
  faLandmark,
  faMapLocationDot,
  faMartiniGlass,
  faMotorcycle,
  faMountain,
  faMugSaucer,
  faMusic,
  faPersonHiking,
  faPlane,
  faRoute,
  faSailboat,
  faShip,
  faSpa,
  faSquareParking,
  faTaxi,
  faTicket,
  faTrain,
  faTrainSubway,
  faTree,
  faUmbrellaBeach,
  faUtensils,
  faVanShuttle,
} from '@fortawesome/free-solid-svg-icons';

type CategoryIconOption = {
  label: string;
  value: string;
  icon: IconDefinition;
};

@Component({
  selector: 'app-category-create-modal',
  imports: [
    FloatLabelModule,
    InputTextModule,
    FormsModule,
    ButtonModule,
    ColorPickerModule,
    ReactiveFormsModule,
    FocusTrapModule,
    FontAwesomeModule,
    TooltipModule,
  ],
  standalone: true,
  templateUrl: './category-create-modal.component.html',
  styleUrl: './category-create-modal.component.scss',
})
export class CategoryCreateModalComponent {
  @HostListener('keydown.control.enter', ['$event'])
  @HostListener('keydown.meta.enter', ['$event'])
  onCtrlEnter(event: Event) {
    event.preventDefault();
    this.closeDialog();
  }

  categoryForm: FormGroup;
  iconOptions: CategoryIconOption[] = [
    { label: 'Bed', value: 'bed', icon: faBed },
    { label: 'Hotel', value: 'hotel', icon: faHotel },
    { label: 'Hiking', value: 'person-hiking', icon: faPersonHiking },
    { label: 'Mountain', value: 'mountain', icon: faMountain },
    { label: 'Food', value: 'utensils', icon: faUtensils },
    { label: 'Cafe', value: 'mug-saucer', icon: faMugSaucer },
    { label: 'Ticket', value: 'ticket', icon: faTicket },
    { label: 'Culture', value: 'landmark', icon: faLandmark },
    { label: 'Nature', value: 'tree', icon: faTree },
    { label: 'Wellness', value: 'spa', icon: faSpa },
    { label: 'Beach', value: 'umbrella-beach', icon: faUmbrellaBeach },
    { label: 'Camp', value: 'campground', icon: faCampground },
    { label: 'Camera', value: 'camera', icon: faCamera },
    { label: 'Music', value: 'music', icon: faMusic },
    { label: 'Bar', value: 'martini-glass', icon: faMartiniGlass },
    { label: 'Celebration', value: 'champagne-glasses', icon: faChampagneGlasses },
    { label: 'Church', value: 'church', icon: faChurch },
    { label: 'Viewpoint', value: 'binoculars', icon: faBinoculars },
    { label: 'Route', value: 'route', icon: faRoute },
    { label: 'Map', value: 'map-location-dot', icon: faMapLocationDot },
    { label: 'Car', value: 'car', icon: faCar },
    { label: 'Bus', value: 'bus', icon: faBus },
    { label: 'Train', value: 'train', icon: faTrain },
    { label: 'Subway', value: 'train-subway', icon: faTrainSubway },
    { label: 'Plane', value: 'plane', icon: faPlane },
    { label: 'Ship', value: 'ship', icon: faShip },
    { label: 'Ferry', value: 'ferry', icon: faFerry },
    { label: 'Sailboat', value: 'sailboat', icon: faSailboat },
    { label: 'Bike', value: 'bicycle', icon: faBicycle },
    { label: 'Taxi', value: 'taxi', icon: faTaxi },
    { label: 'Shuttle', value: 'van-shuttle', icon: faVanShuttle },
    { label: 'Cable car', value: 'cable-car', icon: faCableCar },
    { label: 'Motorcycle', value: 'motorcycle', icon: faMotorcycle },
    { label: 'Parking', value: 'square-parking', icon: faSquareParking },
    { label: 'Charging', value: 'charging-station', icon: faChargingStation },
  ];

  constructor(
    private ref: DynamicDialogRef,
    private fb: FormBuilder,
    private config: DynamicDialogConfig,
  ) {
    this.categoryForm = this.fb.group({
      id: -1,
      name: ['', Validators.required],
      color: [
        '#000000',
        {
          validators: [Validators.required, Validators.pattern('\#[abcdefABCDEF0-9]{6}')],
        },
      ],
      icon: null,
      image: null,
    });

    const patchValue = this.config.data?.category as Category | undefined;
    if (patchValue) this.categoryForm.patchValue(patchValue);
  }

  async closeDialog() {
    if (!this.categoryForm.valid) return;
    let ret = this.categoryForm.value;
    ret['color'] = ret['color'].toUpperCase();

    if (ret['icon']) {
      ret['image'] = await this.iconImageDataUrl(ret['icon'], ret['color']);
    } else {
      delete ret['image'];
    }

    this.ref.close(ret);
  }

  defaultIcon() {
    const name = this.categoryForm.get('name')?.value || '';
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const icons = new Set([
      'accommodation',
      'adventure-sports',
      'culture',
      'entertainment-leisure',
      'festival-event',
      'food-drink',
      'nature-outdoor',
      'wellness',
    ]);
    return `/category-icons/${icons.has(slug) ? slug : 'default'}.svg`;
  }

  updateColorFromPicker(value: string) {
    this.categoryForm.get('color')?.setValue(value.toUpperCase());
    this.categoryForm.get('color')?.markAsDirty();
  }

  selectedIcon(): IconDefinition | null {
    const icon = this.categoryForm.get('icon')?.value;
    return this.iconOptions.find((option) => option.value === icon)?.icon || null;
  }

  selectIcon(value: string) {
    this.categoryForm.get('icon')?.setValue(value);
    this.categoryForm.get('icon')?.markAsDirty();
  }

  clearIcon() {
    this.categoryForm.get('icon')?.setValue(null);
    this.categoryForm.get('icon')?.markAsDirty();
  }

  private iconImageDataUrl(value: string, color: string): Promise<string> {
    const option = this.iconOptions.find((item) => item.value === value);
    if (!option) return Promise.resolve('');

    const [width, height, , , pathData] = option.icon.icon;
    const paths = Array.isArray(pathData) ? pathData : [pathData];
    const size = 128;
    const scale = 72 / Math.max(width, height);
    const x = (size - width * scale) / 2;
    const y = (size - height * scale) / 2;
    const background = this.tintColor(color);
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <rect width="${size}" height="${size}" rx="24" fill="${background}" />
        <g transform="translate(${x} ${y}) scale(${scale})">
          ${paths.map((path) => `<path fill="${color}" d="${path}" />`).join('')}
        </g>
      </svg>
    `;

    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not create icon canvas'));
          return;
        }
        ctx.drawImage(image, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      image.onerror = () => reject(new Error('Could not render category icon'));
      image.src = `data:image/svg+xml;base64,${btoa(svg)}`;
    });
  }

  tintColor(color: string): string {
    const hex = color.replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgb(${Math.round(r + (255 - r) * 0.86)}, ${Math.round(g + (255 - g) * 0.86)}, ${Math.round(
      b + (255 - b) * 0.86,
    )})`;
  }
}
