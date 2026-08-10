import crypto from 'crypto';
import { RentalRepository } from './rental.repository';
import { RentalCache } from './rental.cache';
import { VehiclesRepository } from '../vehicles/vehicles.repository';
import { VehiclesCache } from '../vehicles/vehicles.cache';
import {
  ICreateRentalRequest,
  IUpdateRentalRequest,
  IRentalResponse,
  IRentalPayload,
  IRentalListResponse,
  IRentalListFilters,
  IRental,
} from './rental.interface';
import { AppError } from '../../utils/appError';
import { getKafkaProducer } from '../../config/kafka';

export class RentalService {
  private rentalRepository: RentalRepository;
  private rentalCache: RentalCache;
  private vehiclesRepository: VehiclesRepository;
  private vehiclesCache?: VehiclesCache;

  constructor(
    rentalRepository: RentalRepository,
    rentalCache: RentalCache,
    vehiclesRepository: VehiclesRepository,
    vehiclesCache?: VehiclesCache,
  ) {
    this.rentalRepository = rentalRepository;
    this.rentalCache = rentalCache;
    this.vehiclesRepository = vehiclesRepository;
    this.vehiclesCache = vehiclesCache;
  }

  /**
   * Helper function to calculate rental total amount from vehicle daily rate and date range.
   */
  private calculateTotalAmount(dailyRate: number, startDateStr: string, endDateStr: string): number {
    const startMs = new Date(startDateStr).getTime();
    const endMs = new Date(endDateStr).getTime();
    const days = Math.max(1, Math.ceil((endMs - startMs) / (1000 * 60 * 60 * 24)) + 1);
    return Number((dailyRate * days).toFixed(2));
  }

  /**
   * Helper function to fetch vehicle daily_rate checking Redis cache first before hitting PostgreSQL.
   */
  private async getVehicleDailyRate(vehicleId: number): Promise<number> {
    if (this.vehiclesCache) {
      const cached = await this.vehiclesCache.getVehicle(vehicleId);
      if (cached) {
        return Number(cached.daily_rate);
      }
    }

    const dbVehicle = await this.vehiclesRepository.findById(vehicleId);
    if (!dbVehicle) {
      throw new AppError(`Vehicle with ID ${vehicleId} not found`, 404);
    }

    if (this.vehiclesCache) {
      await this.vehiclesCache.setVehicle(dbVehicle.id, {
        id: dbVehicle.id,
        name: dbVehicle.name,
        plate_number: dbVehicle.plate_number,
        category: dbVehicle.category,
        daily_rate: Number(dbVehicle.daily_rate),
        photo_path: dbVehicle.photo_path || null,
        created_at: dbVehicle.created_at,
        updated_at: dbVehicle.updated_at,
      });
    }

    return Number(dbVehicle.daily_rate);
  }

  /**
   * Executes the synchronous ingress pipeline for creating a rental:
   * 1. Acquires a distributed lock in Redis for (vehicle_id, start_date, end_date)
   * 2. Checks Redis availability slots (rental:slot:{vehicle_id}:{date})
   * 3. Sets Redis slots with TTL strategy
   * 4. Dispatches rental event payload to Kafka topic 'rental-batch-queue'
   */
  public async createRental(request: ICreateRentalRequest): Promise<IRentalResponse> {
    // 1. Acquire distributed lock in Redis
    const lockToken = await this.rentalCache.acquireLock(
      request.vehicle_id,
      request.start_date,
      request.end_date,
      5000, // 5 seconds TTL
    );

    if (!lockToken) {
      throw new AppError(
        `Vehicle ${request.vehicle_id} is currently processing another concurrent booking request. Please try again.`,
        409,
      );
    }

    try {
      // Validate vehicle existence and fetch daily_rate (Redis cache first, then DB fallback)
      const dailyRate = await this.getVehicleDailyRate(request.vehicle_id);

      // Calculate total amount on backend based on daily_rate and rental duration
      const computedTotalAmount = this.calculateTotalAmount(
        dailyRate,
        request.start_date,
        request.end_date,
      );

      // 2. Check Redis availability slot
      const isAvailable = await this.rentalCache.checkSlotsAvailable(
        request.vehicle_id,
        request.start_date,
        request.end_date,
      );

      if (!isAvailable) {
        throw new AppError(
          `Vehicle ${request.vehicle_id} is already booked for the selected date range (${request.start_date} to ${request.end_date})`,
          409,
        );
      }

      // 3. Reserve Redis slots with TTL strategy
      const requestId = crypto.randomUUID();
      await this.rentalCache.reserveSlots(
        request.vehicle_id,
        request.start_date,
        request.end_date,
        requestId,
      );

      // 4. Construct Kafka event payload
      const payload: IRentalPayload = {
        requestId,
        vehicle_id: request.vehicle_id,
        customer_name: request.customer_name,
        customer_phone: request.customer_phone,
        start_date: request.start_date,
        end_date: request.end_date,
        total_amount: computedTotalAmount,
        status: 'booked',
        createdAt: new Date().toISOString(),
      };

      // 5. Dispatch payload to Kafka topic 'rental-batch-queue'
      const producer = getKafkaProducer();
      await producer.send({
        topic: 'rental-batch-queue',
        messages: [
          {
            key: request.vehicle_id.toString(),
            value: JSON.stringify(payload),
          },
        ],
      });

      return {
        vehicle_id: payload.vehicle_id,
        customer_name: payload.customer_name,
        customer_phone: payload.customer_phone,
        start_date: payload.start_date,
        end_date: payload.end_date,
        total_amount: payload.total_amount,
        status: payload.status,
        message: 'Rental booking submitted and queued successfully',
      };
    } catch (error) {
      throw error;
    } finally {
      // Release distributed Redis lock
      if (lockToken) {
        await this.rentalCache.releaseLock(
          request.vehicle_id,
          request.start_date,
          request.end_date,
          lockToken,
        );
      }
    }
  }

  /**
   * Updates an existing rental record by ID.
   * Recalculates total_amount using vehicle daily_rate and updates Redis date slot cache if dates or status change.
   */
  public async updateRental(id: number, payload: IUpdateRentalRequest): Promise<IRentalResponse> {
    const existing = await this.rentalRepository.findById(id);
    if (!existing) {
      throw new AppError(`Rental with ID ${id} not found`, 404);
    }

    const formatDateStr = (d: Date | string): string => {
      if (typeof d === 'string') return d.split('T')[0];
      const dateObj = new Date(d);
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const oldStartDate = formatDateStr(existing.start_date);
    const oldEndDate = formatDateStr(existing.end_date);

    const targetStartDate = payload.start_date ? formatDateStr(payload.start_date) : oldStartDate;
    const targetEndDate = payload.end_date ? formatDateStr(payload.end_date) : oldEndDate;

    const datesChanged = targetStartDate !== oldStartDate || targetEndDate !== oldEndDate;
    const isBecomingCancelled = payload.status === 'cancelled' && existing.status !== 'cancelled';

    if (isBecomingCancelled) {
      // Evict Redis date slots for cancelled rental
      await this.rentalCache.releaseSlots(existing.vehicle_id, oldStartDate, oldEndDate);
    } else if (datesChanged && existing.status !== 'cancelled') {
      // Acquire Redis distributed lock for target date range
      const lockToken = await this.rentalCache.acquireLock(
        existing.vehicle_id,
        targetStartDate,
        targetEndDate,
        5000,
      );

      if (!lockToken) {
        throw new AppError(
          `Vehicle ${existing.vehicle_id} is currently processing another booking request. Please try again.`,
          409,
        );
      }

      try {
        // Release old slots in Redis
        await this.rentalCache.releaseSlots(existing.vehicle_id, oldStartDate, oldEndDate);

        // Check slot availability for new date range
        const isAvailable = await this.rentalCache.checkSlotsAvailable(
          existing.vehicle_id,
          targetStartDate,
          targetEndDate,
        );

        if (!isAvailable) {
          // Re-reserve old slots if new range unavailable
          await this.rentalCache.reserveSlots(existing.vehicle_id, oldStartDate, oldEndDate, id.toString());
          throw new AppError(
            `Vehicle ${existing.vehicle_id} is already booked for the selected date range (${targetStartDate} to ${targetEndDate})`,
            409,
          );
        }

        // Reserve new slots in Redis with TTL
        await this.rentalCache.reserveSlots(existing.vehicle_id, targetStartDate, targetEndDate, id.toString());
      } finally {
        if (lockToken) {
          await this.rentalCache.releaseLock(existing.vehicle_id, targetStartDate, targetEndDate, lockToken);
        }
      }
    }

    const updateData: Partial<IRental> = {};
    if (payload.customer_name) updateData.customer_name = payload.customer_name;
    if (payload.customer_phone) updateData.customer_phone = payload.customer_phone;

    if (payload.start_date) updateData.start_date = new Date(payload.start_date);
    if (payload.end_date) updateData.end_date = new Date(payload.end_date);

    // Recalculate total_amount automatically if dates changed (checking Redis cache first)
    if (datesChanged) {
      const dailyRate = await this.getVehicleDailyRate(existing.vehicle_id);
      updateData.total_amount = this.calculateTotalAmount(
        dailyRate,
        targetStartDate,
        targetEndDate,
      );
    }

    if (payload.status) updateData.status = payload.status;

    const updated = await this.rentalRepository.update(id, updateData);

    return {
      id: updated.id,
      vehicle_id: updated.vehicle_id,
      customer_name: updated.customer_name,
      customer_phone: updated.customer_phone,
      start_date: typeof updated.start_date === 'string' ? updated.start_date : updated.start_date.toISOString(),
      end_date: typeof updated.end_date === 'string' ? updated.end_date : updated.end_date.toISOString(),
      total_amount: Number(updated.total_amount),
      status: updated.status,
      created_at: updated.created_at,
      updated_at: updated.updated_at,
    };
  }

  /**
   * Fetches a paginated list of rentals with cursor and limit filters.
   */
  public async getRentalsList(filters: IRentalListFilters): Promise<IRentalListResponse> {
    const limit = Number(filters.limit) || 10;
    const fetchLimit = limit + 1;
    const cursor = filters.cursor ? Number(filters.cursor) : undefined;

    const dbRentals = await this.rentalRepository.findPaginatedFromDb(fetchLimit, cursor, {
      vehicle_id: filters.vehicle_id ? Number(filters.vehicle_id) : undefined,
      status: filters.status,
      start_date: filters.start_date,
      end_date: filters.end_date,
    });

    const rentalsList: IRentalResponse[] = dbRentals.map((rental) => ({
      id: rental.id,
      vehicle_id: rental.vehicle_id,
      customer_name: rental.customer_name,
      customer_phone: rental.customer_phone,
      start_date: typeof rental.start_date === 'string' ? rental.start_date : rental.start_date.toISOString(),
      end_date: typeof rental.end_date === 'string' ? rental.end_date : rental.end_date.toISOString(),
      total_amount: Number(rental.total_amount),
      status: rental.status,
      created_at: rental.created_at,
      updated_at: rental.updated_at,
    }));

    let nextCursor: number | null = null;
    if (rentalsList.length > limit) {
      rentalsList.pop(); // Remove extra item fetched for cursor pagination
      if (rentalsList.length > 0) {
        nextCursor = rentalsList[rentalsList.length - 1].id || null;
      }
    }

    return {
      rentals: rentalsList,
      nextCursor,
    };
  }

  /**
   * Retrieves a rental by ID.
   */
  public async getRentalById(id: number): Promise<IRentalResponse> {
    const rental = await this.rentalRepository.findById(id);
    if (!rental) {
      throw new AppError(`Rental with ID ${id} not found`, 404);
    }

    return {
      id: rental.id,
      vehicle_id: rental.vehicle_id,
      customer_name: rental.customer_name,
      customer_phone: rental.customer_phone,
      start_date: typeof rental.start_date === 'string' ? rental.start_date : rental.start_date.toISOString(),
      end_date: typeof rental.end_date === 'string' ? rental.end_date : rental.end_date.toISOString(),
      total_amount: Number(rental.total_amount),
      status: rental.status,
      created_at: rental.created_at,
      updated_at: rental.updated_at,
    };
  }

  /**
   * Deletes a rental record by ID.
   * Releases Redis date slot availability cache if the deleted rental was active.
   */
  public async deleteRental(id: number): Promise<{ message: string }> {
    const existing = await this.rentalRepository.findById(id);
    if (!existing) {
      throw new AppError(`Rental with ID ${id} not found`, 404);
    }

    const formatDateStr = (d: Date | string): string => {
      if (typeof d === 'string') return d.split('T')[0];
      const dateObj = new Date(d);
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    // Release Redis date slots if active (not cancelled)
    if (existing.status !== 'cancelled') {
      const startDateStr = formatDateStr(existing.start_date);
      const endDateStr = formatDateStr(existing.end_date);
      await this.rentalCache.releaseSlots(existing.vehicle_id, startDateStr, endDateStr);
    }

    await this.rentalRepository.delete(id);

    return { message: 'Rental deleted successfully' };
  }
}
