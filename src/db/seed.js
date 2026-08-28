const bcrypt = require('bcrypt');
const pool = require('./pool');

async function seed() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'true') {
    console.log('Skipping demo admin seed in production. Set ALLOW_DEMO_SEED=true to override.');
    await pool.end();
    return;
  }

  const passwordHash = await bcrypt.hash('Admin123!', 12);

  await pool.query(
    `
      INSERT INTO admins (full_name, email, phone_number, password_hash, role)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (phone_number)
      DO UPDATE SET
        full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        password_hash = EXCLUDED.password_hash,
        role = EXCLUDED.role
    `,
    ['Test Admin', 'admin@test.com', '251978164708', passwordHash, 'admin']
  );

  console.log('Seeded test admin: +251978164708 / Admin123!');
  await pool.end();
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
