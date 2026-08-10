import crypto from 'crypto';
import { RentalRepository } from './rental.repository';
import { RentalCache } from './rental.cache';
import { VehiclesRepository } from '../vehicles/vehicles.repository';
import {
  ICreateRentalRequest,
  IRentalResponse,
  IRentalPayload,
} from './rental.interface';
import { AppError } from '../../utils/appError';
import { getKafkaProducer } from '../../config/kafka';

export class RentalService {
  private rentalRepository: RentalRepository;
  private rentalCache: RentalCache;
  private vehiclesRepository: VehiclesRepository;

  constructor(
    rentalRepository: RentalRepository,
    rentalCache: RentalCache,
    vehiclesRepository: VehiclesRepository,
  ) {
    this.rentalRepository = rentalRepository;
    this.rentalCache = rentalCache;
    this.vehiclesRepository = vehiclesRepository;
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
      // Validate vehicle existence
      const vehicle = await this.vehiclesRepository.findById(request.vehicle_id);
      if (!vehicle) {
        throw new AppError(`Vehicle with ID ${request.vehicle_id} not found`, 404);
      }

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
        total_amount: Number(request.total_amount),
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
}
