import { redisClient } from '../../config/redis';
import { IVehicleResponse } from './vehicles.interface';

export class VehiclesCache {
  public async getVehicle(id: number): Promise<IVehicleResponse | null> {
    const data = await redisClient.get(`vehicle:${id}`);
    return data ? JSON.parse(data) : null;
  }

  public async setVehicle(id: number, data: IVehicleResponse): Promise<void> {
    await redisClient.set(`vehicle:${id}`, JSON.stringify(data), { EX: 3600 });
  }

  public async getManyVehicles(ids: number[]): Promise<(IVehicleResponse | null)[]> {
    if (ids.length === 0) return [];
    const keys = ids.map((id) => `vehicle:${id}`);
    const cachedData = await redisClient.mGet(keys);
    return cachedData.map((val) => (val ? JSON.parse(val) : null));
  }

  public async setManyVehicles(vehicles: IVehicleResponse[]): Promise<void> {
    if (vehicles.length === 0) return;
    const promises = vehicles.map((v) =>
      redisClient.set(`vehicle:${v.id}`, JSON.stringify(v), { EX: 3600 }),
    );
    await Promise.all(promises);
  }

  public async indexExists(key: string): Promise<boolean> {
    const exists = await redisClient.exists(key);
    return exists === 1;
  }

  public async zAddIndex(key: string, score: number, member: string): Promise<void> {
    await redisClient.zAdd(key, { score, value: member });
  }

  public async zAddManyIndex(
    key: string,
    items: { score: number; value: string }[],
  ): Promise<void> {
    await redisClient.zAdd(key, items);
  }

  public async zExpire(key: string, seconds: number): Promise<void> {
    await redisClient.expire(key, seconds);
  }

  public async zRangeQuery(
    key: string,
    min: string | number,
    max: string | number,
    limit: number,
  ): Promise<string[]> {
    return redisClient.zRange(key, min, max, {
      BY: 'SCORE',
      REV: true,
      LIMIT: { offset: 0, count: limit },
    });
  }

  public async deleteVehicle(id: number): Promise<void> {
    await redisClient.del(`vehicle:${id}`);
  }

  public async zRemIndex(key: string, member: string): Promise<void> {
    await redisClient.zRem(key, member);
  }

  public async deleteIndex(key: string): Promise<void> {
    await redisClient.del(key);
  }

  public async deleteManyIndices(keys: string[]): Promise<void> {
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
  }

  public async findKeys(pattern: string): Promise<string[]> {
    return redisClient.keys(pattern);
  }
}
