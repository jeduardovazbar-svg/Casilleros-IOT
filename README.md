<div align="center">

# 📦 SmartLocker IoT & Inventory System

**Sistema integral de gestión de inventario y control de acceso físico automatizado mediante casilleros inteligentes con ESP32 y Node.js.**

[![Node.js](https://img.shields.io/badge/Node.js-v18+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.x-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![ESP32](https://img.shields.io/badge/Hardware-ESP32-E7352C?style=for-the-badge&logo=espressif&logoColor=white)](https://www.espressif.com/)
[![JWT](https://img.shields.io/badge/Auth-JWT-000000?style=for-the-badge&logo=jsonwebtokens&logoColor=white)](https://jwt.io/)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](#licencia)

<br />

<!-- ESPACIO PARA IMAGEN O BANNER PRINCIPAL -->
<img src="/public/interfaz.png" alt="SmartLocker Dashboard y Hardware" width="100%" style="border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);" />

*Vista previa del dashboard de administración y del casillero automatizado.*

</div>

---

## 📖 Tabla de Contenidos

- [Descripción General](#-descripción-general)
- [Características Clave](#-características-clave)
- [Control de Acceso Basado en Roles (RBAC)](#-control-de-acceso-basado-en-roles-rbac)
- [Arquitectura del Sistema](#-arquitectura-del-sistema)
- [Esquema de Hardware](#-esquema-de-hardware)
- [Stack Tecnológico](#-stack-tecnológico)
- [Instalación y Puesta en Marcha](#-instalación-y-puesta-en-marcha)
  - [Prerrequisitos](#prerrequisitos)
  - [Backend (Node.js)](#backend-nodejs)
  - [Firmware (ESP32)](#firmware-esp32)
- [Variables de Entorno](#-variables-de-entorno)
- [Rutas Principales de la API](#-rutas-principales-de-la-api)
- [Licencia](#-licencia)

---

## 🎯 Descripción General

**SmartLocker** resuelve la fricción en el control de materiales, herramientas e insumos críticos dentro de talleres, laboratorios y almacenes industriales. Combina una plataforma web en tiempo real con hardware embebido para registrar trazabilidad completa: quién retiró un insumo, en qué compartimento y a qué hora exacta se accionó la cerradura eléctrica.

---

## ✨ Características Clave

- **Control de Inventario en Tiempo Real:** Seguimiento de stock, altas, bajas y alertas de reabastecimiento.
- **Apertura Automatizada de Casilleros:** Desbloqueo temporal de cerraduras mediante pulsos controlados por relevadores.
- **Registro y Auditoría (Logs):** Registro inmutable de cada apertura de casillero y movimiento de inventario.
- **Mapeo Físico-Digital:** Vinculación directa entre un ítem de inventario y un casillero físico específico.
- **Mecanismo Failsafe:** Bloqueo automático ante desconexiones y timeout de seguridad para cierre de relevadores.

---

## 👥 Control de Acceso Basado en Roles (RBAC)

| Módulo / Acción | 🔴 Administrativo | 🟡 Operador | 🟢 Trabajador |
| :--- | :---: | :---: | :---: |
| **Gestión de Usuarios y Roles** | ✅ Total | ❌ | ❌ |
| **Alta / Baja / Edición de Ítems** | ✅ Total | ✅ Total | ❌ |
| **Apertura de Emergencia / Forzada** | ✅ Todos | ❌ | ❌ |
| **Asignación de Ítems a Casilleros** | ✅ | ✅ | ❌ |
| **Apertura para Carga / Mantenimiento** | ✅ | ✅ | ❌ |
| **Solicitud de Préstamo / Retiro** | ✅ | ✅ | ✅ |
| **Apertura del Casillero Asignado** | ✅ | ✅ | ✅ (Solo asignados) |
| **Visualización de Logs de Auditoría** | ✅ Total | 👁️ Lectura básica | ❌ |

---

## 🏗️ Arquitectura del Sistema

```text
[ Cliente Web / Móvil ]
         │ (HTTP / JWT)
         ▼
[ Servidor Node.js + Express ] ──── (Lectura/Escritura) ────► [ Base de Datos ]
         │
         │ (HTTP REST / WebSockets / MQTT)
         ▼
    [ ESP32 ] (Microcontrolador WiFi)
         │
         │ (Señal Digital GPIO)
         ▼
[ Módulo de Relevadores ] (Optoacoplado)
         │
         │ (12V DC)
         ▼
[ Cerraduras Solenoide / Casilleros ]
