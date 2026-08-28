const bcrypt = require('bcrypt');
const pool = require('./pool');

async function seed() {
  const passwordHash = await bcrypt.hash('Admin123!', 12);

  await pool.query(
    `
      INSERT INTO admins (full_name, email, password_hash, role)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (email)
      DO UPDATE SET
        full_name = EXCLUDED.full_name,
        password_hash = EXCLUDED.password_hash,
        role = EXCLUDED.role
    `,
    ['Test Admin', 'admin@test.com', passwordHash, 'admin']
  );

  console.log('Seeded test admin: admin@test.com / Admin123!');
  await pool.end();
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
