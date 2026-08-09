import { redisClient } from '../../config/redis';

export class AuthCache {
  public async setSession(userId: number, deviceId: string, sessionData: object): Promise<void> {
    const sessionKey = `session:staff:${userId}:${deviceId}`;
    await redisClient.set(sessionKey, JSON.stringify(sessionData), {
      EX: 7 * 24 * 60 * 60, // 7 days in seconds
    });
  }

  public async hasSession(userId: number, deviceId: string): Promise<boolean> {
    const sessionKey = `session:staff:${userId}:${deviceId}`;
    const exists = await redisClient.exists(sessionKey);
    return exists === 1;
  }
}

export const authCache = new AuthCache();
export default authCache;
