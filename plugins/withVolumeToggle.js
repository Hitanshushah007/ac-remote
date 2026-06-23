// Expo config plugin: a headless Accessibility Service that toggles the appliance
// you're pointing at when you press Volume-Up + Volume-Down together — no screen,
// no unlock. Reads token/calibrations/home-Wi-Fi from native_config.json (written
// by the RN app via src/nativeSync.ts).
const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PACKAGE = 'com.hitanshushah.acremote';

const SERVICE_KT = `package ${PACKAGE}

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.content.Intent
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.view.KeyEvent
import android.view.accessibility.AccessibilityEvent
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread
import kotlin.math.abs

class PointAccessibilityService : AccessibilityService(), SensorEventListener {
    private var sensorManager: SensorManager? = null
    @Volatile private var heading = 0.0
    private var lastDown = 0L
    private var lastFire = 0L
    private val handler = Handler(Looper.getMainLooper())

    override fun onServiceConnected() {
        super.onServiceConnected()
        // Keep the process resident so swiping the app from Recents can't stop us.
        try {
            val i = Intent(this, KeepAliveService::class.java)
            if (Build.VERSION.SDK_INT >= 26) startForegroundService(i) else startService(i)
        } catch (e: Exception) {}
        sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        sensorManager?.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)?.let {
            sensorManager?.registerListener(this, it, SensorManager.SENSOR_DELAY_UI)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        try { stopService(Intent(this, KeepAliveService::class.java)) } catch (e: Exception) {}
    }

    // Double-press Volume-Down (two taps within 450ms) fires the toggle.
    // We deliberately AVOID the both-volume-keys combo — Android reserves that for
    // its own "accessibility shortcut" (which toggles this service on/off).
    override fun onKeyEvent(event: KeyEvent): Boolean {
        if (event.keyCode != KeyEvent.KEYCODE_VOLUME_DOWN) return false
        if (event.action != KeyEvent.ACTION_DOWN) return false
        val now = System.currentTimeMillis()
        if (now - lastDown < 450 && now - lastFire > 1500) {
            lastFire = now
            lastDown = 0L
            trigger()
            return true // swallow the 2nd tap so the volume doesn't keep dropping
        }
        lastDown = now
        return false // single presses pass through — normal volume still works
    }

    override fun onSensorChanged(event: SensorEvent) {
        if (event.sensor.type == Sensor.TYPE_ROTATION_VECTOR) {
            val r = FloatArray(9)
            SensorManager.getRotationMatrixFromVector(r, event.values)
            val o = FloatArray(3)
            SensorManager.getOrientation(r, o)
            var az = Math.toDegrees(o[0].toDouble())
            if (az < 0) az += 360.0
            heading = az
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
    override fun onAccessibilityEvent(event: AccessibilityEvent?) {}
    override fun onInterrupt() {}

    private fun config(): JSONObject? = try {
        val f = File(filesDir, "native_config.json")
        if (f.exists()) JSONObject(f.readText()) else null
    } catch (e: Exception) { null }

    private fun onHomeWifi(cfg: JSONObject): Boolean {
        val home = cfg.optString("homeSsid", "")
        if (home.isEmpty()) return true
        return try {
            val wifi = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            (wifi.connectionInfo.ssid ?: "").trim('"') == home
        } catch (e: Exception) { false }
    }

    private fun angDiff(a: Double, b: Double): Double {
        var d = abs(a - b) % 360
        if (d > 180) d = 360 - d
        return d
    }

    private fun trigger() {
        // Wake the CPU so the compass delivers a FRESH reading (when the screen is
        // off, sensor delivery is suspended and the cached heading goes stale),
        // then act ~450ms later once a new reading has arrived.
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        val wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "PointRemote:trigger")
        try { wl.acquire(4000) } catch (e: Exception) {}
        handler.postDelayed({
            try { doToggle() } catch (e: Exception) {} finally {
                try { if (wl.isHeld) wl.release() } catch (e: Exception) {}
            }
        }, 450)
    }

    private fun doToggle() {
        val cfg = config() ?: return
        if (!onHomeWifi(cfg)) { buzz(2); return }        // off home Wi-Fi
        val token = cfg.optString("token")
        val cals = cfg.optJSONArray("calibrations") ?: return
        if (token.isEmpty() || cals.length() == 0) { buzz(1); return }
        var best: JSONObject? = null
        var bestD = 999.0
        for (i in 0 until cals.length()) {
            val c = cals.getJSONObject(i)
            val d = angDiff(heading, c.optDouble("heading"))
            if (d < bestD) { bestD = d; best = c }
        }
        val target = best
        if (target == null || bestD > 40.0) { buzz(1); return } // nothing in line
        val deviceId = target.optString("deviceId")
        if (deviceId.isEmpty()) { buzz(1); return }
        thread {
            try {
                val cur = getSwitch(token, deviceId)
                setSwitch(token, deviceId, !(cur ?: false))
                buzz(0)                                   // success
            } catch (e: Exception) {
                buzz(3)                                   // command failed (token/network)
            }
        }
    }

    // 0 = sent OK (two quick taps) · 1 = nothing in line (one long) ·
    // 2 = off home Wi-Fi (two long) · 3 = command failed: token/network (four fast)
    private fun buzz(type: Int) {
        val v = getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator ?: return
        val pattern = when (type) {
            0 -> longArrayOf(0, 40, 70, 40)
            1 -> longArrayOf(0, 320)
            2 -> longArrayOf(0, 180, 120, 180)
            else -> longArrayOf(0, 55, 55, 55, 55, 55, 55, 55)
        }
        try { v.vibrate(VibrationEffect.createWaveform(pattern, -1)) } catch (e: Exception) {}
    }

    private fun getSwitch(token: String, id: String): Boolean? {
        val c = URL("https://api.smartthings.com/v1/devices/$id/status").openConnection() as HttpURLConnection
        c.setRequestProperty("Authorization", "Bearer $token")
        c.connectTimeout = 8000; c.readTimeout = 8000
        if (c.responseCode != 200) throw Exception("status HTTP " + c.responseCode)
        val body = c.inputStream.bufferedReader().readText()
        val v = JSONObject(body).optJSONObject("components")?.optJSONObject("main")
            ?.optJSONObject("switch")?.optJSONObject("switch")?.optString("value")
        return when (v) { "on" -> true; "off" -> false; else -> null }
    }

    private fun setSwitch(token: String, id: String, on: Boolean) {
        val c = URL("https://api.smartthings.com/v1/devices/$id/commands").openConnection() as HttpURLConnection
        c.requestMethod = "POST"; c.doOutput = true
        c.setRequestProperty("Authorization", "Bearer $token")
        c.setRequestProperty("Content-Type", "application/json")
        c.connectTimeout = 8000; c.readTimeout = 8000
        val cmd = if (on) "on" else "off"
        c.outputStream.use { it.write("""{"commands":[{"component":"main","capability":"switch","command":"$cmd"}]}""".toByteArray()) }
        val code = c.responseCode
        if (code < 200 || code >= 300) throw Exception("command HTTP " + code)
    }
}
`;

const KEEPALIVE_KT = `package ${PACKAGE}

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

// Minimal foreground service whose only job is to keep this process resident, so
// the accessibility key-listener + compass survive the app being swiped away.
class KeepAliveService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val channelId = "point_remote_bg"
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= 26) {
            val ch = NotificationChannel(channelId, "Point Remote", NotificationManager.IMPORTANCE_MIN)
            ch.setShowBadge(false)
            nm.createNotificationChannel(ch)
        }
        val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, channelId)
            else @Suppress("DEPRECATION") Notification.Builder(this)
        val notif = builder
            .setContentTitle("Point Remote")
            .setContentText("Volume-combo toggle active")
            .setSmallIcon(R.drawable.ic_ac_tile)
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(7, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(7, notif)
        }
        return START_STICKY
    }
}
`;

const CONFIG_XML = `<?xml version="1.0" encoding="utf-8"?>
<accessibility-service xmlns:android="http://schemas.android.com/apk/res/android"
    android:accessibilityEventTypes="typeAllMask"
    android:accessibilityFeedbackType="feedbackGeneric"
    android:canRequestFilterKeyEvents="true"
    android:accessibilityFlags="flagRequestFilterKeyEvents"
    android:notificationTimeout="100"
    android:description="@string/point_accessibility_desc" />
`;

const STRINGS_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="point_accessibility_desc">Press Volume-Up + Volume-Down together to toggle the appliance you are pointing at, without unlocking.</string>
</resources>
`;

function withManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest['uses-permission'] = manifest['uses-permission'] || [];
    const perms = [
      'android.permission.ACCESS_WIFI_STATE',
      'android.permission.ACCESS_NETWORK_STATE',
      'android.permission.VIBRATE',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_SPECIAL_USE',
      'android.permission.POST_NOTIFICATIONS',
    ];
    for (const p of perms) {
      if (!manifest['uses-permission'].some((u) => u.$['android:name'] === p)) {
        manifest['uses-permission'].push({ $: { 'android:name': p } });
      }
    }
    const app = manifest.application[0];
    app.service = app.service || [];
    if (!app.service.some((s) => s.$['android:name'] === '.PointAccessibilityService')) {
      app.service.push({
        $: {
          'android:name': '.PointAccessibilityService',
          'android:exported': 'false',
          'android:permission': 'android.permission.BIND_ACCESSIBILITY_SERVICE',
          'android:label': 'Point Remote — Volume toggle',
        },
        'intent-filter': [
          { action: [{ $: { 'android:name': 'android.accessibilityservice.AccessibilityService' } }] },
        ],
        'meta-data': [
          { $: { 'android:name': 'android.accessibilityservice', 'android:resource': '@xml/accessibility_config' } },
        ],
      });
    }
    if (!app.service.some((s) => s.$['android:name'] === '.KeepAliveService')) {
      app.service.push({
        $: {
          'android:name': '.KeepAliveService',
          'android:exported': 'false',
          'android:foregroundServiceType': 'specialUse',
        },
        property: [
          {
            $: {
              'android:name': 'android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE',
              'android:value': 'Keeps the compass + volume-combo listener alive to toggle appliances you point at.',
            },
          },
        ],
      });
    }
    return cfg;
  });
}

function withFiles(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const root = cfg.modRequest.platformProjectRoot;
      const pkgDir = path.join(root, 'app/src/main/java', ...PACKAGE.split('.'));
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(path.join(pkgDir, 'PointAccessibilityService.kt'), SERVICE_KT);
      fs.writeFileSync(path.join(pkgDir, 'KeepAliveService.kt'), KEEPALIVE_KT);

      const xmlDir = path.join(root, 'app/src/main/res/xml');
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(path.join(xmlDir, 'accessibility_config.xml'), CONFIG_XML);

      const valuesDir = path.join(root, 'app/src/main/res/values');
      fs.mkdirSync(valuesDir, { recursive: true });
      fs.writeFileSync(path.join(valuesDir, 'point_remote_strings.xml'), STRINGS_XML);
      return cfg;
    },
  ]);
}

module.exports = (config) => withFiles(withManifest(config));
