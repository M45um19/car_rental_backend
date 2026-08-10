import { Knex } from 'knex';
import { db } from '../../config/db';
import { IRental } from './rental.interface';

export class RentalRepository {
  private database: Knex;

  constructor(customDb?: Knex) {
    this.database = customDb || db;
  }

  /**
   * Checks if an overlapping active rental exists for a vehicle in the specified date range.
   */
  public async hasOverlappingRental(
    trx: Knex.Transaction,
    vehicleId: number,
    startDate: string,
    endDate: string,
  ): Promise<boolean> {
    const existing = await trx('rentals')
      .where('vehicle_id', vehicleId)
      .whereNot('status', 'cancelled')
      .whereRaw('start_date <= ? AND end_date >= ?', [endDate, startDate])
      .first();

    return !!existing;
  }

  /**
   * Checks for overlapping active rentals for an entire batch of items in a SINGLE database query.
   * Returns all existing database rentals that collide with any item in the batch.
   */
  public async findOverlappingRentalsBulk(
    trx: Knex.Transaction,
    items: { vehicle_id: number; start_date: string; end_date: string }[],
  ): Promise<IRental[]> {
    if (items.length === 0) return [];

    return trx('rentals')
      .whereNot('status', 'cancelled')
      .andWhere((builder) => {
        for (const item of items) {
          builder.orWhere((subBuilder) => {
            subBuilder
              .where('vehicle_id', item.vehicle_id)
              .where('start_date', '<=', item.end_date)
              .where('end_date', '>=', item.start_date);
          });
        }
      });
  }

  /**
   * Performs bulk insertion of rental records within a Knex transaction.
   */
  public async createBulk(trx: Knex.Transaction, rentals: Partial<IRental>[]): Promise<IRental[]> {
    if (rentals.length === 0) return [];
    return trx('rentals').insert(rentals).returning('*');
  }

  /**
   * Finds a rental record by ID.
   */
  public async findById(id: number): Promise<IRental | null> {
    const record = await this.database('rentals').where('id', id).first();
    return record || null;
  }
}
