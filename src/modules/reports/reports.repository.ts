import { Knex } from 'knex';
import { db } from '../../config/db';

export interface IDbReportVehicle {
  id: number;
  name: string;
  daily_rate: number;
}

export interface IDbReportRental {
  id: number;
  vehicle_id: number;
  start_date: Date | string;
  end_date: Date | string;
  total_amount: number;
}

export class ReportsRepository {
  private database: Knex;

  constructor(customDb?: Knex) {
    this.database = customDb || db;
  }

  /**
   * Fetches active non-deleted vehicles.
   */
  public async getVehicles(vehicleId?: number): Promise<IDbReportVehicle[]> {
    let query = this.database('vehicles')
      .select('id', 'name', 'daily_rate')
      .where('deleted_at', null);

    if (vehicleId) {
      query = query.andWhere('id', vehicleId);
    }

    return query.orderBy('id', 'asc');
  }

  /**
   * Fetches non-cancelled rentals overlapping with the given month date range.
   */
  public async getOverlappingRentals(
    monthStart: string,
    monthEnd: string,
    vehicleId?: number,
  ): Promise<IDbReportRental[]> {
    let query = this.database('rentals')
      .select('id', 'vehicle_id', 'start_date', 'end_date', 'total_amount')
      .whereNot('status', 'cancelled')
      .whereRaw('start_date <= ? AND end_date >= ?', [monthEnd, monthStart]);

    if (vehicleId) {
      query = query.andWhere('vehicle_id', vehicleId);
    }

    return query;
  }
}
