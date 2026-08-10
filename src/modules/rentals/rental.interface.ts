export interface ICreateRentalRequest {
  vehicle_id: number;
  customer_name: string;
  customer_phone: string;
  start_date: string;
  end_date: string;
  total_amount: number;
}

export interface IRental {
  id?: number;
  vehicle_id: number;
  customer_name: string;
  customer_phone: string;
  start_date: Date | string;
  end_date: Date | string;
  total_amount: number;
  status: 'booked' | 'ongoing' | 'completed' | 'cancelled';
  created_at?: Date;
  updated_at?: Date;
}

export interface IRentalResponse {
  id?: number;
  vehicle_id: number;
  customer_name: string;
  customer_phone: string;
  start_date: string;
  end_date: string;
  total_amount: number;
  status: string;
  message?: string;
  created_at?: Date | string;
  updated_at?: Date | string;
}

export interface IRentalPayload {
  requestId: string;
  vehicle_id: number;
  customer_name: string;
  customer_phone: string;
  start_date: string;
  end_date: string;
  total_amount: number;
  status: 'booked';
  createdAt: string;
}
