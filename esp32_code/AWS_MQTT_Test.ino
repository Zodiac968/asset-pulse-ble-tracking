
#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEScan.h>
#include <BLEAdvertisedDevice.h>
#include <time.h>
#include <math.h>

// =======================================
// DEVICE CONFIGURATION
// =======================================

const char *RECEIVER_ID = "esp32-c";
const char *TARGET_MAC = "B4:A7:24:16:BA:8A";

const char *WIFI_SSID = "Wifi name";
const char *WIFI_PASSWORD = "password";

const char *AWS_ENDPOINT = "...";
const int AWS_PORT = 8883;

const char *MQTT_TOPIC = "..";

// =======================================
// AWS CERTIFICATES
// =======================================

const char *AWS_ROOT_CA = R"EOF(
-----BEGIN CERTIFICATE-----

-----END CERTIFICATE-----
)EOF";

const char *AWS_DEVICE_CERT = R"EOF(
-----BEGIN CERTIFICATE-----

-----END CERTIFICATE-----
)EOF";

const char *AWS_PRIVATE_KEY = R"EOF(
-----BEGIN RSA PRIVATE KEY-----

-----END RSA PRIVATE KEY-----
)EOF";

// =======================================
// BLE AND SAMPLING SETTINGS
// =======================================

#define SCAN_TIME 5
#define MAX_SAMPLES 20
#define EMA_ALPHA 0.2f
#define MQTT_RETRY_MS 5000

BLEScan *pBLEScan;
WiFiClientSecure secureClient;
PubSubClient mqttClient(secureClient);

int rssiSamples[MAX_SAMPLES];
int sampleCount = 0;
int rawRSSI = -127;
float filteredRSSI = 0;

bool filterInitialized = false;
unsigned long totalPackets = 0;
unsigned long lastSeen = 0;
unsigned long lastMQTTAttempt = 0;
unsigned long messageCounter = 0;
uint32_t bootId = 0;

// =======================================
// BLE CALLBACK
// =======================================

class BeaconCallbacks : public BLEAdvertisedDeviceCallbacks
{
  void onResult(BLEAdvertisedDevice device) override
  {
    String mac = String(device.getAddress().toString().c_str());

    if (!mac.equalsIgnoreCase(TARGET_MAC))
      return;

    int rssi = device.getRSSI();
    rawRSSI = rssi;
    lastSeen = millis();
    totalPackets++;

    if (sampleCount < MAX_SAMPLES)
    {
      rssiSamples[sampleCount] = rssi;
      sampleCount++;
    }

    if (!filterInitialized)
    {
      filteredRSSI = rssi;
      filterInitialized = true;
    }
    else
    {
      filteredRSSI = EMA_ALPHA * rssi + (1.0f - EMA_ALPHA) * filteredRSSI;
    }

    Serial.printf("BLE | RSSI: %d | Filtered: %.2f | Samples: %d\n", rssi, filteredRSSI, sampleCount);
  }
};

// =======================================
// WIFI CONNECTION
// =======================================

bool connectWiFi()
{
  if (WiFi.status() == WL_CONNECTED)
    return true;

  Serial.print("Connecting to WiFi");

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long start = millis();

  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000)
  {
    Serial.print(".");
    delay(500);
  }

  if (WiFi.status() != WL_CONNECTED)
  {
    Serial.println("\nWiFi connection failed");
    return false;
  }

  Serial.println("\nWiFi connected");
  Serial.print("IP: ");
  Serial.println(WiFi.localIP());

  return true;
}

// =======================================
// TIME SYNCHRONIZATION
// =======================================

bool syncTime()
{
  configTime(0, 0, "pool.ntp.org", "time.google.com");

  unsigned long start = millis();

  while (time(nullptr) < 1700000000 && millis() - start < 12000)
  {
    delay(500);
  }

  bool valid = time(nullptr) >= 1700000000;
  Serial.println(valid ? "Time synchronized" : "Time synchronization failed");

  return valid;
}

// =======================================
// AWS MQTT CONNECTION
// =======================================

void connectAWS()
{
  if (WiFi.status() != WL_CONNECTED || mqttClient.connected())
    return;
  if (millis() - lastMQTTAttempt < MQTT_RETRY_MS)
    return;

  lastMQTTAttempt = millis();

  if (time(nullptr) < 1700000000 && !syncTime())
    return;

  Serial.print("Connecting to AWS IoT... ");

  if (mqttClient.connect(RECEIVER_ID))
  {
    Serial.println("CONNECTED");
  }
  else
  {
    Serial.print("FAILED | State: ");
    Serial.println(mqttClient.state());
  }
}

// =======================================
// BUILD AND PUBLISH TELEMETRY
// =======================================

void publishTelemetry()
{
  if (sampleCount == 0)
  {
    Serial.println("No beacon samples in this scan window");
    return;
  }

  if (!mqttClient.connected())
  {
    Serial.println("MQTT disconnected; batch not published");
    return;
  }

  String payload;
  payload.reserve(768);

  messageCounter++;

  payload += "{";
  payload += "\"receiver_id\":\"" + String(RECEIVER_ID) + "\",";
  payload += "\"beacon_id\":\"" + String(TARGET_MAC) + "\",";
  payload += "\"rssi\":" + String(rawRSSI) + ",";
  payload += "\"filtered_rssi\":" + String(filteredRSSI, 2) + ",";
  payload += "\"packets\":" + String(sampleCount) + ",";
  payload += "\"total_packets\":" + String(totalPackets) + ",";
  payload += "\"uptime_ms\":" + String(millis()) + ",";
  payload += "\"message_id\":\"" + String(RECEIVER_ID) + "-" + String(bootId, HEX) + "-" + String(messageCounter) + "\",";
  payload += "\"samples\":[";

  for (int i = 0; i < sampleCount; i++)
  {
    if (i > 0)
      payload += ",";
    payload += String(rssiSamples[i]);
  }

  payload += "]}";

  if (payload.length() + 1 > mqttClient.getBufferSize())
  {
    Serial.println("MQTT payload exceeds buffer; batch not published");
    return;
  }

  bool success = mqttClient.publish(MQTT_TOPIC, payload.c_str());

  if (success)
  {
    Serial.println("AWS MQTT PUBLISH SUCCESS");
    Serial.println(payload);
    sampleCount = 0;
  }
  else
  {
    Serial.println("AWS MQTT PUBLISH FAILED");
  }
}

// =======================================
// SETUP
// =======================================

void setup()
{
  Serial.begin(115200);
  delay(1500);

  Serial.println();
  Serial.println("=================================");
  Serial.println("ESP32 BLE AWS ASSET TRACKER");
  Serial.printf("Receiver: %s\n", RECEIVER_ID);
  Serial.println("=================================");

  bootId = esp_random();

  connectWiFi();
  if (WiFi.status() == WL_CONNECTED)
    syncTime();

  secureClient.setCACert(AWS_ROOT_CA);
  secureClient.setCertificate(AWS_DEVICE_CERT);
  secureClient.setPrivateKey(AWS_PRIVATE_KEY);

  mqttClient.setServer(AWS_ENDPOINT, AWS_PORT);
  mqttClient.setBufferSize(1024);
  mqttClient.setKeepAlive(60);
  mqttClient.setSocketTimeout(5);

  // Initialize BLE scanning
  BLEDevice::init("ESP32_BLE_ASSET_SCANNER");

  pBLEScan = BLEDevice::getScan();
  pBLEScan->setAdvertisedDeviceCallbacks(new BeaconCallbacks(), true);
  pBLEScan->setActiveScan(true);
  pBLEScan->setInterval(160);
  pBLEScan->setWindow(144);

  connectAWS();

  Serial.println("BLE scanner initialized");
  Serial.println("Starting asset tracking...");
}

// =======================================
// MAIN LOOP
// =======================================

void loop()
{
  if (WiFi.status() != WL_CONNECTED)
  {
    connectWiFi();
    delay(500);
    return;
  }

  if (!mqttClient.connected())
    connectAWS();
  if (mqttClient.connected())
    mqttClient.loop();

  // Gather BLE advertisements for five seconds
  pBLEScan->start(SCAN_TIME, false);
  pBLEScan->clearResults();

  // Publish batch of actual samples
  if (mqttClient.connected())
  {
    mqttClient.loop();
    publishTelemetry();
  }

  delay(100);
}
