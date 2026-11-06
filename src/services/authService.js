// src/services/authService.js
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const UserModel = require('../models/userModel');
const logger = require('../core/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'edcam_secret_key_default_production_2026';
const PIN_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos
const USER_LIST_TTL_MS = 60 * 1000;      // 1 minuto

// Memoria caché para respuestas PIN ultrarrápidas (0ms de latencia en re-ingreso)
const pinLookupCache = new Map(); // sha256(pin) -> { user, expiresAt }
let activeUsersCache = null;
let activeUsersExpiresAt = 0;

function hashPinForCache(pin) {
  return crypto.createHash('sha256').update(String(pin).trim()).digest('hex');
}

const AuthService = {
  /**
   * Obtiene la lista de usuarios activos con caché en memoria para no saturar MySQL
   */
  async getCachedActiveUsers() {
    const now = Date.now();
    if (activeUsersCache && now < activeUsersExpiresAt) {
      return activeUsersCache;
    }

    const users = await UserModel.getAllActive();
    activeUsersCache = users;
    activeUsersExpiresAt = now + USER_LIST_TTL_MS;
    return users;
  },

  /**
   * Invalida los cachés cuando se crea o modifica un usuario
   */
  invalidateCache() {
    activeUsersCache = null;
    activeUsersExpiresAt = 0;
    pinLookupCache.clear();
    logger.debug('AUTH', 'Caché de usuarios y PINs invalidada');
  },

  /**
   * Valida un PIN de 6 dígitos con rendimiento optimizado
   */
  async authenticatePin(pin) {
    const cleanPin = String(pin || '').trim();
    if (!/^\d{6}$/.test(cleanPin)) {
      throw new Error('El PIN debe ser exactamente de 6 dígitos numéricos');
    }

    const now = Date.now();
    const pinHashKey = hashPinForCache(cleanPin);

    // 1. Verificación ultra-rápida en caché en memoria (< 1ms)
    const cachedEntry = pinLookupCache.get(pinHashKey);
    if (cachedEntry && now < cachedEntry.expiresAt) {
      logger.debug('AUTH', `Autenticación resuelta desde caché de alta velocidad para ${cachedEntry.user.username}`);
      return this.generateSession(cachedEntry.user);
    }

    // 2. Consulta de usuarios activos
    const users = await this.getCachedActiveUsers();
    if (!users || users.length === 0) {
      return null;
    }

    // 3. Comparación paralela en el hilo de trabajo libuv (no bloquea el Event Loop)
    const comparePromises = users.map(async (u) => {
      try {
        const isMatch = await bcrypt.compare(cleanPin, u.pin_hash);
        return isMatch ? u : null;
      } catch (err) {
        return null;
      }
    });

    const results = await Promise.all(comparePromises);
    const matchedUser = results.find(u => u !== null);

    if (!matchedUser) {
      return null;
    }

    // Guardar en caché de PIN exitoso
    pinLookupCache.set(pinHashKey, {
      user: matchedUser,
      expiresAt: now + PIN_CACHE_TTL_MS
    });

    return this.generateSession(matchedUser);
  },

  /**
   * Genera el JWT y el objeto de usuario seguro
   */
  generateSession(user) {
    const token = jwt.sign(
      {
        sub: user.id,
        id: user.id,
        username: user.username,
        role: user.role,
        assigned_locker_id: user.assigned_locker_id,
        allowed_qty: user.allowed_qty
      },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    return {
      token,
      id: user.id,
      username: user.username,
      role: user.role,
      assigned_locker_id: user.assigned_locker_id,
      allowed_qty: user.allowed_qty,
      email: user.email,
      phone: user.phone
    };
  }
};

module.exports = AuthService;
