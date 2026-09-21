// seed.js (en la raíz del proyecto)
const db = require('./src/config/database');
const bcrypt = require('bcrypt');

async function seed() {
  console.log('Conectando a la base de datos...');

  // Hashes de prueba para los 3 roles
  const pinAdmin = await bcrypt.hash('9999', 10);
  const pinOperador = await bcrypt.hash('1234', 10);
  const pinEmpleado = await bcrypt.hash('0001', 10);

  // 1. Casillero #1 físico
  await db.query(`
    INSERT INTO lockers (locker_number, board_id, relay_channel, product_name, current_stock, max_capacity, size_type, grid_col_span, grid_row_span)
    VALUES (1, 1, 1, 'Guantes de Nitrilo', 25, 50, 'S', 1, 1)
    ON DUPLICATE KEY UPDATE current_stock = 25;
  `);

  // 2. Administrador (Control total)
  await db.query(`
    INSERT INTO users (username, pin_hash, role)
    VALUES ('admin_general', ?, 'admin')
    ON DUPLICATE KEY UPDATE pin_hash = ?;
  `, [pinAdmin, pinAdmin]);

  // 3. Operador (Retiros generales y crea empleados)
  await db.query(`
    INSERT INTO users (username, pin_hash, role)
    VALUES ('operador_turno1', ?, 'operador')
    ON DUPLICATE KEY UPDATE pin_hash = ?;
  `, [pinOperador, pinOperador]);

  // 4. Empleado (Solo abre casillero 1 y retira hasta 2 piezas)
  await db.query(`
    INSERT INTO users (username, pin_hash, role, assigned_locker_id, allowed_qty)
    VALUES ('empleado_juan', ?, 'empleado', 1, 2)
    ON DUPLICATE KEY UPDATE pin_hash = ?;
  `, [pinEmpleado, pinEmpleado]);

  console.log('✔ Datos iniciales listos:');
  console.log('  - Admin PIN:    9999');
  console.log('  - Operador PIN: 1234');
  console.log('  - Empleado PIN: 0001 (Locker 1, max 2 pzas)');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Error al ejecutar seed:', err);
  process.exit(1);
});