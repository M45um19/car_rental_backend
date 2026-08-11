export interface IGetRentalReportQuery {
  month: string;
  vehicle_id?: number;
}

export interface IVehicleRentalReportItem {
  id: number;
  name: string;
  total_bookings: number;
  days_rented: number;
  revenue: number;
}

export interface IHighestRevenueVehicle {
  id: number;
  name: string;
  revenue: number;
}

export interface IRentalReportData {
  month: string;
  vehicles: IVehicleRentalReportItem[];
  highest_revenue_vehicle: IHighestRevenueVehicle | null;
}
