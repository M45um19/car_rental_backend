import crypto from 'crypto';
import { redisClient } from '../../config/redis';

export class RentalCache {
  /**
   * Acquires a distributed lock in Redis for a vehicle and date range using atomic SET NX PX.
   * Prevents concurrent booking requests across multiple container instances.
   * Returns a unique token string if lock is acquired, or null if already locked.
   */
  public async acquireLock(
    vehicleId: number,
    startDateStr: string,
    endDateStr: string,
    ttlMs: number = 5000,
  ): Promise<string | null> {
    const lockKey = `rental:lock:${vehicleId}:${startDateStr}:${endDateStr}`;
    const token = crypto.randomUUID();

    const result = await redisClient.set(lockKey, token, {
      NX: true,
      PX: ttlMs,
    });

    return result === 'OK' ? token : null;
  }

  /**
   * Releases the distributed Redis lock if the token matches using atomic Lua script.
   */
  public async releaseLock(
    vehicleId: number,
    startDateStr: string,
    endDateStr: string,
    token: string,
  ): Promise<boolean> {
    const lockKey = `rental:lock:${vehicleId}:${startDateStr}:${endDateStr}`;

    const luaScript = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;

    const result = await redisClient.eval(luaScript, {
      keys: [lockKey],
      arguments: [token],
    });

    return result === 1;
  }

  /**
   * Generates an array of YYYY-MM-DD date strings for every day from startDate to endDate inclusive.
   */
  public generateDateArray(startDateStr: string, endDateStr: string): string[] {
    const dates: string[] = [];
    const current = new Date(startDateStr);
    const end = new Date(endDateStr);

    while (current <= end) {
      const year = current.getFullYear();
      const month = String(current.getMonth() + 1).padStart(2, '0');
      const day = String(current.getDate()).padStart(2, '0');
      dates.push(`${year}-${month}-${day}`);
      current.setDate(current.getDate() + 1);
    }

    return dates;
  }

  /**
   * Calculates the TTL in seconds until the end of the given date (plus 24h buffer).
   * Ensures past or current date slot keys automatically expire and are evicted from Redis.
   */
  public calculateTTLForDate(dateStr: string): number {
    const targetDateEnd = new Date(`${dateStr}T23:59:59.999Z`);
    const now = new Date();
    const diffInSeconds = Math.floor((targetDateEnd.getTime() - now.getTime()) / 1000);
    // Add 24-hour buffer (86400s) after target date end, minimum 3600 seconds
    return Math.max(3600, diffInSeconds + 86400);
  }

  /**
   * Checks whether all requested date slots for a vehicle are available in Redis.
   * Key pattern: rental:slot:{vehicleId}:{date}
   * Returns true if ALL slots are free, false if ANY slot is occupied.
   */
  public async checkSlotsAvailable(
    vehicleId: number,
    startDateStr: string,
    endDateStr: string,
  ): Promise<boolean> {
    const dates = this.generateDateArray(startDateStr, endDateStr);
    if (dates.length === 0) return true;

    const keys = dates.map((date) => `rental:slot:${vehicleId}:${date}`);
    const results = await redisClient.mGet(keys);

    return results.every((val) => val === null);
  }

  /**
   * Reserves vehicle date slots in Redis with a calculated TTL per slot date.
   * Value defaults to 'booked' ('1'). Presence of key indicates slot is reserved.
   */
  public async reserveSlots(
    vehicleId: number,
    startDateStr: string,
    endDateStr: string,
    value: string = 'booked',
  ): Promise<void> {
    const dates = this.generateDateArray(startDateStr, endDateStr);

    for (const date of dates) {
      const key = `rental:slot:${vehicleId}:${date}`;
      const ttl = this.calculateTTLForDate(date);
      await redisClient.set(key, value, { EX: ttl });
    }
  }

  /**
   * Releases/evicts reserved slots for a vehicle date range (e.g. on cancellation or error).
   */
  public async releaseSlots(
    vehicleId: number,
    startDateStr: string,
    endDateStr: string,
  ): Promise<void> {
    const dates = this.generateDateArray(startDateStr, endDateStr);
    if (dates.length === 0) return;

    const keys = dates.map((date) => `rental:slot:${vehicleId}:${date}`);
    await redisClient.del(keys);
  }
}


