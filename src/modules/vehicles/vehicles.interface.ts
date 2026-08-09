export interface IVehicle {
  id: number;
  name: string;
  plate_number: string;
  category: string;
  daily_rate: number;
  photo_path: string | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface ICreateVehicleRequest {
  name: string;
  plate_number: string;
  category: string;
  daily_rate: number;
}

export interface IUpdateVehicleRequest {
  name?: string;
  plate_number?: string;
  category?: string;
  daily_rate?: number;
}

export interface IVehicleResponse {
  id: number;
  name: string;
  plate_number: string;
  category: string;
  daily_rate: number;
  photo_path: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface IVehicleListResponse {
  vehicles: IVehicleResponse[];
  nextCursor: number | null;
}
