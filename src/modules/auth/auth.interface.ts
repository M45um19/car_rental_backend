export interface IStaff {
  id: number;
  email: string;
  password_hash: string;
  name: string;
  created_at: Date;
  updated_at: Date;
}

export interface ILoginRequest {
  email: string;
  password?: string;
}

export interface ILoginResponse {
  accessToken: string;
  refreshToken: string;
  deviceId: string;
  staff: {
    id: number;
    email: string;
    name: string;
  };
}

export interface ILoginMetadata {
  ip: string;
  deviceName: string;
}
