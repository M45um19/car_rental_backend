import { Knex } from 'knex';
import { IStaff } from './auth.interface';

export class AuthRepository {
  private db: Knex;

  constructor(db: Knex) {
    this.db = db;
  }

  public async findByEmail(email: string): Promise<IStaff | undefined> {
    return this.db<IStaff>('staff').where({ email }).first();
  }

}
