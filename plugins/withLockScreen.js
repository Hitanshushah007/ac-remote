// Expo config plugin: lets Point Remote run over the lock screen and adds a
// Quick Settings tile that launches it — so you can point + toggle while locked.
const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PACKAGE = 'com.hitanshushah.acremote';

const TILE_KT = `package ${PACKAGE}

import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.service.quicksettings.TileService

// Tapping the Quick Settings tile (reachable from the lock screen) launches the
// app. MainActivity is flagged showWhenLocked, so the radar renders over the
// keyguard — point and toggle without unlocking.
class AcTileService : TileService() {
  override fun onClick() {
    super.onClick()
    val launch = packageManager.getLaunchIntentForPackage(packageName) ?: return
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    if (Build.VERSION.SDK_INT >= 34) {
      val pi = PendingIntent.getActivity(
        this, 0, launch,
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
      )
      startActivityAndCollapse(pi)
    } else {
      @Suppress("DEPRECATION")
      startActivityAndCollapse(launch)
    }
  }
}
`;

const ICON_XML = `<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp"
    android:viewportWidth="24" android:viewportHeight="24"
    android:tint="#FFFFFF">
  <path android:fillColor="#FFFFFF"
        android:pathData="M12,2C6.48,2 2,6.48 2,12s4.48,10 10,10 10,-4.48 10,-10S17.52,2 12,2zM12,20c-4.41,0 -8,-3.59 -8,-8s3.59,-8 8,-8 8,3.59 8,8 -3.59,8 -8,8z"/>
  <path android:fillColor="#FFFFFF"
        android:pathData="M12,7c-2.76,0 -5,2.24 -5,5s2.24,5 5,5 5,-2.24 5,-5 -2.24,-5 -5,-5zM12,15c-1.65,0 -3,-1.35 -3,-3s1.35,-3 3,-3 3,1.35 3,3 -1.35,3 -3,3z"/>
</vector>
`;

function withManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (!app) return cfg;

    // Allow the main activity to show over (and wake) the lock screen.
    const main = (app.activity || []).find((a) => a.$['android:name'] === '.MainActivity');
    if (main) {
      main.$['android:showWhenLocked'] = 'true';
      main.$['android:turnScreenOn'] = 'true';
    }

    // Register the Quick Settings tile service.
    app.service = app.service || [];
    if (!app.service.some((s) => s.$['android:name'] === '.AcTileService')) {
      app.service.push({
        $: {
          'android:name': '.AcTileService',
          'android:exported': 'true',
          'android:icon': '@drawable/ic_ac_tile',
          'android:label': 'Point Remote',
          'android:permission': 'android.permission.BIND_QUICK_SETTINGS_TILE',
        },
        'intent-filter': [
          { action: [{ $: { 'android:name': 'android.service.quicksettings.action.QS_TILE' } }] },
        ],
      });
    }
    return cfg;
  });
}

function withNativeFiles(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const root = cfg.modRequest.platformProjectRoot;
      const pkgDir = path.join(root, 'app/src/main/java', ...PACKAGE.split('.'));
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(path.join(pkgDir, 'AcTileService.kt'), TILE_KT);

      const drawableDir = path.join(root, 'app/src/main/res/drawable');
      fs.mkdirSync(drawableDir, { recursive: true });
      fs.writeFileSync(path.join(drawableDir, 'ic_ac_tile.xml'), ICON_XML);
      return cfg;
    },
  ]);
}

module.exports = (config) => withNativeFiles(withManifest(config));
