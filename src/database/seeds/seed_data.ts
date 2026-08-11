import { Knex } from 'knex';
import bcrypt from 'bcryptjs';

export async function seed(knex: Knex): Promise<void> {
  // Deletes ALL existing entries in rentals, vehicles, and staff
  await knex('rentals').del();
  await knex('vehicles').del();
  await knex('staff').del();

  // Hash password for staff
  const passwordHash = await bcrypt.hash('Password123', 10);

  // Insert staff
  await knex('staff').insert([
    {
      id: 1,
      email: 'admin@rental.com',
      password_hash: passwordHash,
      name: 'Admin Staff',
    },
  ]);

  // Insert vehicles
  const vehicles = await knex('vehicles')
    .insert([
      {
        id: 1,
        name: 'Tesla Model 3',
        plate_number: 'CAR-1234',
        category: 'Electric',
        daily_rate: 120.0,
        photo_path: null,
        deleted_at: null,
      },
      {
        id: 2,
        name: 'Toyota RAV4',
        plate_number: 'CAR-5678',
        category: 'SUV',
        daily_rate: 80.0,
        photo_path: null,
        deleted_at: null,
      },
      {
        id: 3,
        name: 'Honda Civic',
        plate_number: 'CAR-9012',
        category: 'Sedan',
        daily_rate: 50.0,
        photo_path: null,
        deleted_at: null,
      },
    ])
    .returning('*');

  // Insert rentals (including a month boundary rental to test pro-rata monthly reports)
  await knex('rentals').insert([
    {
      vehicle_id: vehicles[0].id,
      customer_name: 'John Doe',
      customer_phone: '+1234567890',
      start_date: '2026-07-28',
      end_date: '2026-08-03', // 7 days total: 4 days in July (28, 29, 30, 31) and 3 days in Aug (1, 2, 3)
      total_amount: 840.0,
      status: 'booked',
    },
    {
      vehicle_id: vehicles[1].id,
      customer_name: 'Jane Smith',
      customer_phone: '+0987654321',
      start_date: '2026-08-10',
      end_date: '2026-08-15', // 6 days total: entirely in August
      total_amount: 480.0,
      status: 'ongoing',
    },
  ]);
}
