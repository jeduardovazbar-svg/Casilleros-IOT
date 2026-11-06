#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <WiFiManager.h>
#include <Preferences.h>
#include "esp_camera.h"

// Desactivación de caídas de voltaje (Brownout Reset)
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"

// ==========================================
// VARIABLES DE RED Y SERVIDOR (DINÁMICAS)
// ==========================================
char server_host[64] = "192.168.100.142";
char server_port_str[6] = "3000";

WebSocketsClient webSocket;
Preferences preferences;
bool shouldSaveConfig = false;

// ==========================================
// PINES AI-THINKER ESP32-CAM
// ==========================================
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27
#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

bool cameraActive = false;

// Callback que detecta cuando el usuario guarda datos en el portal web
void saveConfigCallback() {
  shouldSaveConfig = true;
}

// ==========================================
// INICIALIZACIÓN DE CÁMARA
// ==========================================
bool initCamera() {
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sscb_sda = SIOD_GPIO_NUM;
  config.pin_sscb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  
  // 16 MHz previene ruido en el bus SPI de la memoria PSRAM
  config.xclk_freq_hz = 16000000;
  config.pixel_format = PIXFORMAT_JPEG;

  if (psramFound()) {
    Serial.println("[CAM] PSRAM detectada. Configurando resolución VGA.");
    config.frame_size = FRAMESIZE_VGA;      // 640x480
    config.jpeg_quality = 14;               // Balance de compresión
    config.fb_count = 2;                    // Doble búfer para streaming continuo
    config.grab_mode = CAMERA_GRAB_LATEST;  // Fotograma más reciente
  } else {
    Serial.println("[CAM] PSRAM NO encontrada. Usando QVGA.");
    config.frame_size = FRAMESIZE_QVGA;     // 320x240
    config.jpeg_quality = 15;
    config.fb_count = 1;
    config.grab_mode = CAMERA_GRAB_WHEN_EMPTY;
  }

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("[CAM ERROR] Fallo al iniciar sensor: 0x%x\n", err);
    return false;
  }
  
  Serial.println("[CAM] Sensor listo y estabilizado.");
  return true;
}

// ==========================================
// EVENTOS WEBSOCKET
// ==========================================
void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      Serial.println("[WS] ESP32-CAM desconectada del backend");
      cameraActive = false;
      break;

    case WStype_CONNECTED:
      Serial.println("[WS] ESP32-CAM conectada exitosamente.");
      // Identificarse ante el backend de Node.js
      webSocket.sendTXT("{\"type\":\"IDENTIFY\",\"device\":\"ESP32_CAM\"}");
      break;

    case WStype_TEXT: {
      #if ARDUINOJSON_VERSION_MAJOR >= 7
        JsonDocument doc;
      #else
        StaticJsonDocument<256> doc;
      #endif

      DeserializationError error = deserializeJson(doc, payload);
      if (error) return;

      const char* command = doc["command"];
      if (command) {
        if (strcmp(command, "START_CAMERA") == 0) {
          Serial.println("[ORDEN] Iniciando transmisión de video...");
          cameraActive = true;
        } else if (strcmp(command, "STOP_CAMERA") == 0) {
          Serial.println("[ORDEN] Deteniendo transmisión de video...");
          cameraActive = false;
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
  // 1. Desactivar el detector de caídas de tensión (Brownout)
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);

  Serial.begin(115200);
  delay(1000);

  // 2. Cargar parámetros guardados previamente en memoria flash no volátil (NVS)
  preferences.begin("cam_cfg", false);
  if (preferences.isKey("host")) {
    preferences.getString("host", server_host, sizeof(server_host));
  }
  if (preferences.isKey("port")) {
    preferences.getString("port", server_port_str, sizeof(server_port_str));
  }

  // 3. Configurar portal cautivo con campos adicionales para IP y Puerto
  WiFiManager wm;
  wm.setSaveConfigCallback(saveConfigCallback);

  WiFiManagerParameter custom_server_host("server", "IP o Host del Servidor", server_host, 64);
  WiFiManagerParameter custom_server_port("port", "Puerto del Servidor", server_port_str, 6);
  wm.addParameter(&custom_server_host);
  wm.addParameter(&custom_server_port);

  // Tiempo límite de 3 minutos en modo Punto de Acceso (AP) antes de reiniciar
  wm.setConfigPortalTimeout(180);

  Serial.println("[WiFi] Conectando a red guardada o abriendo portal...");
  if (!wm.autoConnect("ESP32-CAM-Config", "12345678")) {
    Serial.println("[WiFi] Tiempo de espera agotado sin conexión. Reiniciando...");
    delay(2000);
    ESP.restart();
  }

  // 4. Guardar en memoria NVS si hubo cambios en el portal
  if (shouldSaveConfig) {
    strncpy(server_host, custom_server_host.getValue(), sizeof(server_host));
    strncpy(server_port_str, custom_server_port.getValue(), sizeof(server_port_str));
    preferences.putString("host", server_host);
    preferences.putString("port", server_port_str);
    Serial.println("[CFG] Nuevos parámetros del servidor guardados en memoria.");
  }
  preferences.end();

  Serial.printf("\n[WiFi] Conectado. IP local: %s\n", WiFi.localIP().toString().c_str());
  Serial.printf("[WS Target] Servidor configurado: %s:%s\n", server_host, server_port_str);

  // 5. Inicializar la cámara tras asegurar la conexión
  initCamera();

  // 6. Conectar al WebSocket del backend
  int port = atoi(server_port_str);
  webSocket.begin(server_host, port, "/");
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000);
}

// ==========================================
// LOOP
// ==========================================
void loop() {
  webSocket.loop();

  // Capturar y transmitir solo cuando el casillero esté abierto y el socket conectado
  if (cameraActive && webSocket.isConnected()) {
    camera_fb_t * fb = esp_camera_fb_get();
    
    if (!fb) {
      Serial.println("[CAM ERROR] Fotograma nulo, reintentando...");
      delay(50);
      return;
    }

    // Enviar fotograma binario JPEG
    webSocket.sendBIN(fb->buf, fb->len);

    // Liberar memoria inmediatamente
    esp_camera_fb_return(fb);

    // Pausa técnica para permitir procesar tareas de red y fijar ~20 FPS
    delay(50);
  }
}
