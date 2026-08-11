import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create staff table
  await knex.schema.createTable('staff', (table) => {
    table.increments('id').primary();
    table.string('email').unique().notNullable();
    table.string('password_hash').notNullable();
    table.string('name').notNullable();
    table.timestamps(true, true); // Adds created_at and updated_at, default to current timestamp
  });

  // Create vehicles table
  await knex.schema.createTable('vehicles', (table) => {
    table.increments('id').primary();
    table.string('name').notNullable();
    table.string('plate_number').unique().notNullable();
    table.string('category').notNullable();
    table.decimal('daily_rate', 10, 2).notNullable();
    table.string('photo_path').nullable();
    table.timestamp('deleted_at').nullable();
    table.timestamps(true, true);
  });

  // Create rentals table
  await knex.schema.createTable('rentals', (table) => {
    table.increments('id').primary();
    table
      .integer('vehicle_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('vehicles')
      .onDelete('CASCADE');
    table.string('customer_name').notNullable();
    table.string('customer_phone').notNullable();
    table.date('start_date').notNullable();
    table.date('end_date').notNullable();
    table.decimal('total_amount', 10, 2).notNullable();
    table
      .enum('status', ['booked', 'ongoing', 'completed', 'cancelled'])
      .notNullable()
      .defaultTo('booked');
    table.timestamps(true, true);

    // Add indexes for optimization
    table.index(['vehicle_id', 'status']);
    table.index(['start_date', 'end_date']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('rentals');
  await knex.schema.dropTableIfExists('vehicles');
  await knex.schema.dropTableIfExists('staff');
}
