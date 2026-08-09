import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AuthRepository } from './auth.repository';
import { ILoginMetadata, ILoginRequest, ILoginResponse } from './auth.interface';
import { AppError } from '../../utils/appError';
import { env } from '../../config/env';
import { redisClient } from '../../config/redis';
import { generateUuidV7 } from '../../utils/uuid';

export class AuthService {
  private authRepository: AuthRepository;

  constructor(authRepository: AuthRepository) {
    this.authRepository = authRepository;
  }

  public async login(payload: ILoginRequest, metadata: ILoginMetadata): Promise<ILoginResponse> {
    const staff = await this.authRepository.findByEmail(payload.email);
    if (!staff) {
      throw new AppError('Invalid email or password', 401);
    }

    const isPasswordMatch = await bcrypt.compare(payload.password!, staff.password_hash);
    if (!isPasswordMatch) {
      throw new AppError('Invalid email or password', 401);
    }

    // Generate unique Device ID (UUIDv7)
    const deviceId = generateUuidV7();

    // Generate Access Token (1 hour expiry) containing deviceId
    const accessToken = jwt.sign(
      { id: staff.id, email: staff.email, name: staff.name, deviceId },
      env.jwtAccessSecret,
      { expiresIn: '1h' },
    );

    // Generate Refresh Token (7 days expiry)
    const refreshToken = jwt.sign(
      { id: staff.id, deviceId },
      env.jwtRefreshSecret,
      { expiresIn: '7d' },
    );

    // Store Session in Redis
    const sessionKey = `session:staff:${staff.id}:${deviceId}`;
    const sessionData = {
      deviceId,
      ip: metadata.ip,
      deviceName: metadata.deviceName,
      staff: {
        id: staff.id,
        email: staff.email,
        name: staff.name,
      },
    };
    
    try {
      await redisClient.set(sessionKey, JSON.stringify(sessionData), {
        EX: 7 * 24 * 60 * 60, // 7 days in seconds
      });
    } catch (redisErr) {
      console.error('Failed to save session in Redis:', redisErr);
      throw new AppError('Session creation failed', 500);
    }

    return {
      accessToken,
      refreshToken,
      deviceId,
      staff: {
        id: staff.id,
        email: staff.email,
        name: staff.name,
      },
    };
  }
}
