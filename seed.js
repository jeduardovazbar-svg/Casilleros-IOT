// seed.js (en la raíz del proyecto)
const db = require('./src/config/database');
const bcrypt = require('bcrypt');

/**
 * Catálogo de usuarios iniciales / administrativos
 * NOTA CRÍTICA: Todos los PINs deben ser exactamente de 6 dígitos numéricos.
 */
const SEED_USERS = [
  {
    username: 'admin_general',
    pin: '999999',
    role: 'admin',
    email: 'jeduardovazbar@gmail.com',
    phone: '4493902776',
    assignedLockerId: null,
    allowedQty: 0
  },
  {
    username: 'operador_turno1',
    pin: '123456',
    role: 'operador',
    email: 'jeduardovazbar@gmail.com',
    phone: '4493902776',
    assignedLockerId: null,
    allowedQty: 0
  },
  {
    username: 'empleado_juan',
    pin: '000001',
    role: 'empleado',
    email: 'jeduardovazbar@gmail.com',
    phone: '4493902776',
    assignedLockerId: 1,
    allowedQty: 2
  }
];

async function seedUser(user) {
  const cleanPin = String(user.pin).trim();
  if (!/^\d{6}$/.test(cleanPin)) {
    throw new Error(`El usuario "${user.username}" tiene un PIN inválido ("${cleanPin}"). Debe ser estrictamente de 6 dígitos numéricos.`);
  }

  // 1. Cifrar el PIN (bcrypt.hash solo recibe el string del PIN y las rondas de salteo)
  const pinHash = await bcrypt.hash(cleanPin, 10);

  // 2. Insertar o actualizar todos los campos si el username ya existe (ON DUPLICATE KEY UPDATE)
  const query = `
    INSERT INTO users 
      (username, pin_hash, role, email, phone, assigned_locker_id, allowed_qty, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    ON DUPLICATE KEY UPDATE 
      pin_hash = VALUES(pin_hash),
      role = VALUES(role),
      email = VALUES(email),
      phone = VALUES(phone),
      assigned_locker_id = VALUES(assigned_locker_id),
      allowed_qty = VALUES(allowed_qty),
      is_active = 1;
  `;

  await db.query(query, [
    user.username,
    pinHash,
    user.role,
    user.email || null,
    user.phone || null,
    user.assignedLockerId || null,
    user.allowedQty || 0
  ]);
}

async function seed() {
  console.log('==================================================');
  console.log(' Conectando a MySQL para inicializar datos...');
  console.log('==================================================');

  // 1. Casillero #1 físico
  await db.query(`
    INSERT INTO lockers (locker_number, board_id, relay_channel, product_name, current_stock, max_capacity, size_type, grid_col_span, grid_row_span, price)
    VALUES (1, 1, 1, 'Guantes de Nitrilo', 25, 50, 'S', 1, 1, 50.00)
    ON DUPLICATE KEY UPDATE 
      product_name = VALUES(product_name),
      price = VALUES(price);
  `);
  console.log('✔ Casillero #1 verificado.');

  // 2. Insertar o actualizar usuarios declarados
  for (const u of SEED_USERS) {
    await seedUser(u);
    console.log(`✔ Usuario "${u.username}" (${u.role.toUpperCase()}) registrado/actualizado con PIN: ${u.pin}`);
  }

  console.log('\n==================================================');
  console.log(' ✔ BASE DE DATOS SINCRONIZADA CON ÉXITO');
  console.log('==================================================');
  console.log(' Usuarios disponibles para acceso por PIN:');
  SEED_USERS.forEach(u => {
    console.log(` • [${u.role.toUpperCase().padEnd(8)}] ${u.username.padEnd(16)} -> PIN: ${u.pin} | Correo: ${u.email || 'N/A'}`);
  });
  console.log('==================================================\n');

  process.exit(0);
}

seed().catch((err) => {
  console.error('\n❌ Error al ejecutar seed.js:', err.message);
  process.exit(1);
});
