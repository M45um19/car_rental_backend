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
    excludeRentalId?: number,
  ): Promise<boolean> {
    let query = trx('rentals')
      .where('vehicle_id', vehicleId)
      .whereNot('status', 'cancelled')
      .whereRaw('start_date <= ? AND end_date >= ?', [endDate, startDate]);

    if (excludeRentalId) {
      query = query.whereNot('id', excludeRentalId);
    }

    const existing = await query.first();
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
   * Updates an existing rental record by ID.
   */
  public async update(id: number, rentalData: Partial<IRental>): Promise<IRental> {
    const [updated] = await this.database('rentals')
      .where('id', id)
      .update({
        ...rentalData,
        updated_at: new Date(),
      })
      .returning('*');

    return updated;
  }

  /**
   * Deletes a rental record by ID.
   */
  public async delete(id: number): Promise<boolean> {
    const rowsDeleted = await this.database('rentals').where('id', id).del();
    return rowsDeleted > 0;
  }

  /**
   * Fetches paginated rentals from the database using keyset cursor pagination and filters.
   */
  public async findPaginatedFromDb(
    limit: number,
    cursor?: number,
    filters?: {
      vehicle_id?: number;
      status?: string;
      start_date?: string;
      end_date?: string;
    },
  ): Promise<IRental[]> {
    let query = this.database('rentals');

    if (filters?.vehicle_id) {
      query = query.where('vehicle_id', filters.vehicle_id);
    }

    if (filters?.status) {
      query = query.where('status', filters.status);
    }

    if (filters?.start_date && filters?.end_date) {
      query = query.whereRaw('start_date <= ? AND end_date >= ?', [filters.end_date, filters.start_date]);
    } else if (filters?.start_date) {
      query = query.where('start_date', '>=', filters.start_date);
    } else if (filters?.end_date) {
      query = query.where('end_date', '<=', filters.end_date);
    }

    if (cursor) {
      query = query.where('id', '<', cursor);
    }

    return query.orderBy('id', 'desc').limit(limit);
  }

  /**
   * Finds a rental record by ID.
   */
  public async findById(id: number): Promise<IRental | null> {
    const record = await this.database('rentals').where('id', id).first();
    return record || null;
  }
}
