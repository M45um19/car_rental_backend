import { db } from '../config/db';
import { RentalRepository } from '../modules/rentals/rental.repository';
import { IRentalPayload } from '../modules/rentals/rental.interface';
import { getKafkaProducer } from '../config/kafka';

export class RentalBatchProcessor {
  private buffer: IRentalPayload[] = [];
  private timer: NodeJS.Timeout | null = null;
  private maxBatchSize = 100;
  private maxWaitMs = 2000;
  private rentalRepository: RentalRepository;

  constructor(rentalRepository: RentalRepository) {
    this.rentalRepository = rentalRepository;
  }

  /**
   * Adds an incoming Kafka rental payload to the buffer queue.
   * Flushes immediately if batch size reaches 100 or when 2-second timer triggers.
   */
  public addMessage(payload: IRentalPayload): void {
    this.buffer.push(payload);

    if (this.buffer.length >= this.maxBatchSize) {
      this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => {
        this.flush();
      }, this.maxWaitMs);
    }
  }

  /**
   * Flushes and processes all currently buffered messages in the batch processor.
   */
  public async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.buffer.length === 0) return;

    const itemsToProcess = [...this.buffer];
    this.buffer = [];

    await this.processBatchWithBinarySplit(itemsToProcess);
  }

  /**
   * Checks for intra-batch date collisions between items in the same batch in memory.
   */
  private checkIntraBatchOverlaps(items: IRentalPayload[]): string | null {
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        if (
          items[i].vehicle_id === items[j].vehicle_id &&
          items[i].start_date <= items[j].end_date &&
          items[i].end_date >= items[j].start_date
        ) {
          return `Intra-batch date collision for vehicle ${items[i].vehicle_id} between dates ${items[i].start_date} and ${items[j].end_date}`;
        }
      }
    }
    return null;
  }

  /**
   * Processes a batch of rentals inside a Knex transaction with row-level locks.
   * Uses Binary Split Algorithm (divide & conquer) on failure to isolate poisonous records to DLQ.
   */
  private async processBatchWithBinarySplit(items: IRentalPayload[]): Promise<void> {
    if (items.length === 0) return;

    try {
      // 1. In-memory check for intra-batch date collisions
      const intraCollision = this.checkIntraBatchOverlaps(items);
      if (intraCollision) {
        throw new Error(intraCollision);
      }

      await db.transaction(async (trx) => {
        // 2. Single SQL query bulk check for database date collisions
        const dbOverlaps = await this.rentalRepository.findOverlappingRentalsBulk(trx, items);
        if (dbOverlaps.length > 0) {
          const first = dbOverlaps[0];
          throw new Error(
            `Overlapping rental detected in database for vehicle ${first.vehicle_id}`,
          );
        }

        // 4. Bulk insert valid rental records in a single statement
        const rentalsToInsert = items.map((item) => ({
          vehicle_id: item.vehicle_id,
          customer_name: item.customer_name,
          customer_phone: item.customer_phone,
          start_date: new Date(item.start_date),
          end_date: new Date(item.end_date),
          total_amount: item.total_amount,
          status: 'booked' as const,
        }));

        await this.rentalRepository.createBulk(trx, rentalsToInsert);
      });

      console.log(
        `[RentalBatchProcessor] Successfully committed batch of ${items.length} rentals.`,
      );
    } catch (error) {
      const errMessage = (error as Error).message || 'Bulk insert error';
      console.warn(
        `[RentalBatchProcessor] Batch processing failed for ${items.length} item(s): ${errMessage}`,
      );

      if (items.length === 1) {
        // Single poisonous record isolated
        const poisonousItem = items[0];
        console.error(
          `[RentalBatchProcessor] Routing poisonous record (requestId: ${poisonousItem.requestId}) to DLQ (rental-dlq).`,
        );
        await this.sendToDLQ(poisonousItem, errMessage);
      } else {
        // Binary split divide & conquer algorithm
        const mid = Math.floor(items.length / 2);
        const leftHalf = items.slice(0, mid);
        const rightHalf = items.slice(mid);

        console.log(
          `[RentalBatchProcessor] Executing binary split: left half (${leftHalf.length}), right half (${rightHalf.length})`,
        );
        await this.processBatchWithBinarySplit(leftHalf);
        await this.processBatchWithBinarySplit(rightHalf);
      }
    }
  }

  /**
   * Routes a failed/corrupted rental payload to the Dead Letter Queue (rental-dlq) topic.
   */
  private async sendToDLQ(item: IRentalPayload, reason: string): Promise<void> {
    try {
      const producer = getKafkaProducer();
      await producer.send({
        topic: 'rental-dlq',
        messages: [
          {
            key: item.vehicle_id.toString(),
            value: JSON.stringify({
              ...item,
              failureReason: reason,
              dlqTimestamp: new Date().toISOString(),
            }),
          },
        ],
      });
    } catch (dlqErr) {
      console.error('[RentalBatchProcessor] Failed to route record to rental-dlq topic:', dlqErr);
    }
  }
}
