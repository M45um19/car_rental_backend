import { Knex } from 'knex';
import { db } from '../../config/db';
import { IVehicle } from './vehicles.interface';

export class VehiclesRepository {
  private db: Knex;

  constructor() {
    this.db = db;
  }

  public async findByPlateNumber(plateNumber: string): Promise<IVehicle | null> {
    const vehicle = await this.db('vehicles').where('plate_number', plateNumber).first();
    return vehicle || null;
  }

  public async findById(id: number): Promise<IVehicle | null> {
    const vehicle = await this.db('vehicles').where('id', id).andWhere('deleted_at', null).first();
    return vehicle || null;
  }

  public async findActiveIds(category?: string): Promise<{ id: number }[]> {
    let query = this.db('vehicles').select('id').where('deleted_at', null);

    if (category) {
      query = query.andWhere('category', category);
    }

    return query.orderBy('id', 'desc');
  }

  public async findManyByIds(ids: number[]): Promise<IVehicle[]> {
    if (ids.length === 0) return [];
    return this.db('vehicles').whereIn('id', ids).andWhere('deleted_at', null);
  }

  public async findPaginatedFromDb(
    limit: number,
    cursor?: number,
    category?: string,
  ): Promise<IVehicle[]> {
    let query = this.db('vehicles').where('deleted_at', null);

    if (category) {
      query = query.andWhere('category', category);
    }

    if (cursor) {
      // Key-based cursor pagination (assuming cursor points to vehicle ID, pagination goes descending)
      query = query.andWhere('id', '<', cursor);
    }

    return query.orderBy('id', 'desc').limit(limit);
  }

  public async create(vehicleData: Partial<IVehicle>): Promise<IVehicle> {
    const [insertedVehicle] = await this.db('vehicles')
      .insert({
        name: vehicleData.name,
        plate_number: vehicleData.plate_number,
        category: vehicleData.category,
        daily_rate: vehicleData.daily_rate,
        photo_path: vehicleData.photo_path || null,
      })
      .returning('*');

    return insertedVehicle;
  }

  public async update(id: number, vehicleData: Partial<IVehicle>): Promise<IVehicle> {
    const [updatedVehicle] = await this.db('vehicles')
      .where('id', id)
      .andWhere('deleted_at', null)
      .update({
        ...vehicleData,
        updated_at: new Date(),
      })
      .returning('*');

    return updatedVehicle;
  }

  public async softDelete(id: number): Promise<void> {
    await this.db('vehicles').where('id', id).andWhere('deleted_at', null).update({
      deleted_at: new Date(),
      updated_at: new Date(),
    });
  }
}
