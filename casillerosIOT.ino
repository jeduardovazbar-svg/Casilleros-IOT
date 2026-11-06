#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <ArduinoOTA.h>
#include <WiFiManager.h>
#include <Preferences.h>

// ==========================================
// VARIABLES DE RED Y SERVIDOR (DINÁMICAS)
// ==========================================
char server_host[64] = "192.168.100.142";
char server_port_str[6] = "3000";

WebSocketsClient webSocket;
Preferences preferences;
bool shouldSaveConfig = false;

// ==========================================
// CONFIGURACIÓN RS-485 / MODBUS 
// ==========================================
#define PIN_RX2 16
#define PIN_TX2 17
#define PIN_RS485_DIR 4  // DE + RE puenteados (HIGH = Tx, LOW = Rx)
#define LED_STATUS 2     // LED testigo integrado

// ==========================================
// PINES DE SENSORES Y LEDS (CASILLERO 2)
// ==========================================
#define PIN_SENSOR_LOCKER_2 18  // Azul al GPIO 18 (Blanco a GND)
#define PIN_LED_VERDE       22  // Verde: Casillero cerrado
#define PIN_LED_ROJO        23  // Rojo: Alerta de apertura prolongada

int lastSensorState2 = -1;
unsigned long lastDebounceTime2 = 0;
const unsigned long DEBOUNCE_DELAY_MS = 60;

unsigned long doorOpenStartTime2 = 0;
bool doorOpenAlarmTriggered2 = false;
const unsigned long TIEMPO_MAX_ABIERTO_MS = 15000;

void saveConfigCallback() {
  shouldSaveConfig = true;
}

// Cálculo CRC-16 Modbus (IBM / 0xA001)
uint16_t calculateModbusCRC(const uint8_t *buffer, uint8_t length) {
  uint16_t crc = 0xFFFF;
  for (uint8_t pos = 0; pos < length; pos++) {
    crc ^= (uint16_t)buffer[pos];
    for (int i = 8; i != 0; i--) {
      if ((crc & 0x0001) != 0) {
        crc >>= 1;
        crc ^= 0xA001;
      } else {
        crc >>= 1;
      }
    }
  }
  return crc;
}

// Envío a placas de relés Modbus R4D8A08 (Función 0x06)
void sendModbusRelay(uint8_t boardId, uint8_t channel, bool state) {
  uint8_t frame[8];
  frame[0] = boardId;
  frame[1] = 0x06;
  frame[2] = 0x00;
  frame[3] = channel;
  frame[4] = state ? 0x01 : 0x02;
  frame[5] = 0x00;

  uint16_t crc = calculateModbusCRC(frame, 6);
  frame[6] = crc & 0xFF;
  frame[7] = (crc >> 8) & 0xFF;

  digitalWrite(PIN_RS485_DIR, HIGH);
  delay(2);

  Serial2.write(frame, 8);
  Serial2.flush();

  delay(5);
  digitalWrite(PIN_RS485_DIR, LOW);
}

// ==========================================
// MONITOREO DE SENSORES Y LEDS
// ==========================================
void checkDoorSensors() {
  int reading = digitalRead(PIN_SENSOR_LOCKER_2);

  if (reading != lastSensorState2) {
    if ((millis() - lastDebounceTime2) > DEBOUNCE_DELAY_MS) {
      lastSensorState2 = reading;
      lastDebounceTime2 = millis();

      if (reading == LOW) {
        doorOpenAlarmTriggered2 = false;
        digitalWrite(PIN_LED_VERDE, HIGH);
        digitalWrite(PIN_LED_ROJO, LOW);

        Serial.println("[SENSOR] Casillero 2: CERRADO.");
        webSocket.sendTXT("{\"type\":\"DOOR_STATUS_UPDATE\",\"box\":2,\"status\":\"cerrada\"}");
      } else {
        doorOpenStartTime2 = millis();
        doorOpenAlarmTriggered2 = false;
        digitalWrite(PIN_LED_VERDE, LOW);
        digitalWrite(PIN_LED_ROJO, LOW);

        Serial.println("[SENSOR] Casillero 2: ABIERTO.");
        webSocket.sendTXT("{\"type\":\"DOOR_STATUS_UPDATE\",\"box\":2,\"status\":\"abierta\"}");
      }
    }
  }

  // Alerta de apertura prolongada
  if (lastSensorState2 == HIGH) {
    if (!doorOpenAlarmTriggered2 && (millis() - doorOpenStartTime2 >= TIEMPO_MAX_ABIERTO_MS)) {
      doorOpenAlarmTriggered2 = true;
      digitalWrite(PIN_LED_ROJO, HIGH);

      Serial.println("[ALERTA] Casillero 2 abierto por más de 15 segundos.");
      webSocket.sendTXT("{\"type\":\"DOOR_STATUS_UPDATE\",\"box\":2,\"status\":\"alerta_abierta\"}");
    }
  }
}

// ==========================================
// GESTIÓN DE EVENTOS WEBSOCKET
// ==========================================
void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      Serial.println("[WS] ESP32 MAIN desconectado del backend");
      break;

    case WStype_CONNECTED:
      Serial.println("[WS] ESP32 MAIN autenticado exitosamente.");
      webSocket.sendTXT("{\"type\":\"IDENTIFY\",\"device\":\"ESP32_MAIN\"}");

      // Notificar estado real inicial al arrancar
      {
        String initStatus = (digitalRead(PIN_SENSOR_LOCKER_2) == LOW) ? "cerrada" : "abierta";
        webSocket.sendTXT("{\"type\":\"DOOR_STATUS_UPDATE\",\"box\":2,\"status\":\"" + initStatus + "\"}");
      }
      break;

    case WStype_TEXT: {
      #if ARDUINOJSON_VERSION_MAJOR >= 7
        JsonDocument doc;
      #else
        StaticJsonDocument<300> doc;
      #endif

      DeserializationError error = deserializeJson(doc, payload);
      if (error) return;

      const char* command = doc["command"];
      if (command && strcmp(command, "TRIGGER_LOCK") == 0) {
        int box     = doc["box"];
        int board   = doc["board"];
        int channel = doc["channel"];
        int pulse   = doc["pulseMs"] | 1000;

        Serial.printf("[MODBUS] Disparando Casillero %d (Placa %d, Canal %d)\n", box, board, channel);

        digitalWrite(LED_STATUS, HIGH);
        sendModbusRelay(board, channel, true);

        delay(pulse);

        sendModbusRelay(board, channel, false);
        digitalWrite(LED_STATUS, LOW);

        if (box != 2) {
          delay(300);
          webSocket.sendTXT("{\"type\":\"DOOR_STATUS_UPDATE\",\"box\":" + String(box) + ",\"status\":\"abierta\"}");
          delay(2000);
          webSocket.sendTXT("{\"type\":\"DOOR_STATUS_UPDATE\",\"box\":" + String(box) + ",\"status\":\"cerrada\"}");
        }
      }
      break;
    }
    default:
      break;
  }
}

// ==========================================
// SETUP
// ==========================================
void setup() {
  Serial.begin(115200);

  pinMode(PIN_SENSOR_LOCKER_2, INPUT_PULLUP);
  pinMode(PIN_LED_VERDE, OUTPUT);
  pinMode(PIN_LED_ROJO, OUTPUT);
  pinMode(LED_STATUS, OUTPUT);
  digitalWrite(LED_STATUS, LOW);

  // Inicializar estado de LEDs según interruptor físico
  lastSensorState2 = digitalRead(PIN_SENSOR_LOCKER_2);
  if (lastSensorState2 == LOW) {
    digitalWrite(PIN_LED_VERDE, HIGH);
    digitalWrite(PIN_LED_ROJO, LOW);
  } else {
    digitalWrite(PIN_LED_VERDE, LOW);
    digitalWrite(PIN_LED_ROJO, LOW);
    doorOpenStartTime2 = millis();
  }

  // Configuración bus RS-485
  pinMode(PIN_RS485_DIR, OUTPUT);
  digitalWrite(PIN_RS485_DIR, LOW);
  Serial2.begin(9600, SERIAL_8N1, PIN_RX2, PIN_TX2);

  // 1. Cargar configuración de servidor guardada
  preferences.begin("main_cfg", false);
  if (preferences.isKey("host")) {
    preferences.getString("host", server_host, sizeof(server_host));
  }
  if (preferences.isKey("port")) {
    preferences.getString("port", server_port_str, sizeof(server_port_str));
  }

  // 2. Configurar Portal Cautivo Wi-Fi
  WiFiManager wm;
  wm.setSaveConfigCallback(saveConfigCallback);

  WiFiManagerParameter custom_server_host("server", "IP o Host del Servidor", server_host, 64);
  WiFiManagerParameter custom_server_port("port", "Puerto del Servidor", server_port_str, 6);
  wm.addParameter(&custom_server_host);
  wm.addParameter(&custom_server_port);

  wm.setConfigPortalTimeout(180);

  Serial.println("[WiFi] Conectando a red guardada o iniciando portal...");
  if (!wm.autoConnect("ESP32-Master-Config", "12345678")) {
    Serial.println("[WiFi] Expiró el portal sin conexión. Reiniciando...");
    delay(2000);
    ESP.restart();
  }

  // Guardar datos si el usuario los actualizó en el portal
  if (shouldSaveConfig) {
    strncpy(server_host, custom_server_host.getValue(), sizeof(server_host));
    strncpy(server_port_str, custom_server_port.getValue(), sizeof(server_port_str));
    preferences.putString("host", server_host);
    preferences.putString("port", server_port_str);
    Serial.println("[CFG] Parámetros de servidor actualizados en memoria.");
  }
  preferences.end();

  Serial.printf("\n[WiFi] Conectado. IP local: %s\n", WiFi.localIP().toString().c_str());
  Serial.printf("[WS Target] Servidor: %s:%s\n", server_host, server_port_str);

  // 3. OTA
  ArduinoOTA.setHostname("ESP32-Master-Lockers");
  ArduinoOTA.begin();

  // 4. Iniciar WebSocket hacia el servidor configurado
  int port = atoi(server_port_str);
  webSocket.begin(server_host, port, "/");
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000);
}

// ==========================================
// LOOP
// ==========================================
void loop() {
  ArduinoOTA.handle();
  webSocket.loop();
  checkDoorSensors();
} 
