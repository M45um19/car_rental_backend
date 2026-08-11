import { ReportsRepository } from './reports.repository';
import {
  IVehicleRentalReportItem,
  IHighestRevenueVehicle,
  IRentalReportData,
} from './reports.interface';

export class ReportsService {
  private reportsRepository: ReportsRepository;

  constructor(reportsRepository: ReportsRepository) {
    this.reportsRepository = reportsRepository;
  }

  /**
   * Helper to parse date to UTC midnight for exact day calculations.
   */
  private parseToUTCMidnight(dateInput: Date | string): Date {
    const str =
      typeof dateInput === 'string'
        ? dateInput.split('T')[0]
        : dateInput.toISOString().split('T')[0];
    const [y, m, d] = str.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }

  /**
   * Generates monthly rental report per vehicle.
   */
  public async getRentalReport(month: string, vehicleId?: number): Promise<IRentalReportData> {
    const [yearStr, monthStr] = month.split('-');
    const year = parseInt(yearStr, 10);
    const monthNum = parseInt(monthStr, 10);

    const lastDay = new Date(year, monthNum, 0).getDate();
    const monthStartStr = `${yearStr}-${monthStr}-01`;
    const monthEndStr = `${yearStr}-${monthStr}-${String(lastDay).padStart(2, '0')}`;

    const monthStartUTC = new Date(Date.UTC(year, monthNum - 1, 1));
    const monthEndUTC = new Date(Date.UTC(year, monthNum - 1, lastDay));

    const vehicles = await this.reportsRepository.getVehicles(vehicleId);
    const rentals = await this.reportsRepository.getOverlappingRentals(
      monthStartStr,
      monthEndStr,
      vehicleId,
    );

    const vehicleStatsMap = new Map<
      number,
      {
        id: number;
        name: string;
        daily_rate: number;
        total_bookings: number;
        days_rented: number;
        revenue: number;
      }
    >();

    for (const v of vehicles) {
      vehicleStatsMap.set(v.id, {
        id: v.id,
        name: v.name,
        daily_rate: Number(v.daily_rate),
        total_bookings: 0,
        days_rented: 0,
        revenue: 0,
      });
    }

    for (const rental of rentals) {
      const vStats = vehicleStatsMap.get(rental.vehicle_id);
      if (!vStats) continue;

      const rentalStart = this.parseToUTCMidnight(rental.start_date);
      const rentalEnd = this.parseToUTCMidnight(rental.end_date);

      const totalRentalDays = Math.max(
        1,
        Math.round((rentalEnd.getTime() - rentalStart.getTime()) / (1000 * 60 * 60 * 24)) + 1,
      );

      const effectiveStart = rentalStart > monthStartUTC ? rentalStart : monthStartUTC;
      const effectiveEnd = rentalEnd < monthEndUTC ? rentalEnd : monthEndUTC;

      if (effectiveStart <= effectiveEnd) {
        const daysInMonth =
          Math.round((effectiveEnd.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60 * 24)) +
          1;

        const dailyRate =
          totalRentalDays > 0 ? Number(rental.total_amount) / totalRentalDays : vStats.daily_rate;

        const rentalRevenueInMonth = dailyRate * daysInMonth;

        vStats.total_bookings += 1;
        vStats.days_rented += daysInMonth;
        vStats.revenue += rentalRevenueInMonth;
      }
    }

    const reportVehicles: IVehicleRentalReportItem[] = [];
    let topVehicle: IHighestRevenueVehicle | null = null;
    let maxRevenue = -1;

    for (const vStats of vehicleStatsMap.values()) {
      const roundedRevenue = Number(vStats.revenue.toFixed(2));
      const vehicleItem: IVehicleRentalReportItem = {
        id: vStats.id,
        name: vStats.name,
        total_bookings: vStats.total_bookings,
        days_rented: vStats.days_rented,
        revenue: roundedRevenue,
      };
      reportVehicles.push(vehicleItem);

      if (roundedRevenue > maxRevenue && roundedRevenue > 0) {
        maxRevenue = roundedRevenue;
        topVehicle = {
          id: vStats.id,
          name: vStats.name,
          revenue: roundedRevenue,
        };
      }
    }

    return {
      month,
      vehicles: reportVehicles,
      highest_revenue_vehicle: topVehicle,
    };
  }
}
