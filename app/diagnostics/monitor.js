'use strict';
/**
 * MODULE: diagnostics/monitor.js
 * Description: Platzhalter f�r spaetere Monitoring-Hooks (Touch-Log, Perf Overlay, Remote Dispatch); beobachtet die Diagnostics-Layer Flags.
 * Submodules:
 *  - visibility tracker (merkt sich ob Overlay aktiv sein darf)
 *  - edge-case guard (Throttle fuer Konsolen-Spam)
 *  - diagnosticsLayer export (AppModules.diagnosticsLayer.monitor)
 */

(function (global) {
  global.AppModules = global.AppModules || {};
  const appModules = global.AppModules;
  const config = appModules.config || {};
  const diagnosticsLayer = (appModules.diagnosticsLayer = appModules.diagnosticsLayer || {});
  const enabled = config.DIAGNOSTICS_ENABLED !== false;

  let isActive = false;
  let lastHeartbeat = 0;
  const HEARTBEAT_INTERVAL = 10_000;

  const monitorApi = {
    enabled,
    isActive: () => isActive,
    heartbeat(reason = 'manual') {
      if (!enabled) return;
      const now = Date.now();
      if (now - lastHeartbeat < 500) return;
      lastHeartbeat = now;
      appModules.diagnosticsLayer?.logger?.add('diagnostics heartbeat', { reason, at: now });
    },
    toggle(state) {
      if (!enabled) return;
      isActive = typeof state === 'boolean' ? state : !isActive;
      appModules.diagnosticsLayer?.logger?.add('diagnostics monitor toggled', {
        active: isActive
      });
    }
  };

  diagnosticsLayer.monitor = monitorApi;

  if (!enabled) return;

  const scheduleHeartbeat = () => {
    monitorApi.heartbeat('interval');
    global.setTimeout(scheduleHeartbeat, HEARTBEAT_INTERVAL);
  };
  scheduleHeartbeat();
})(typeof window !== 'undefined' ? window : globalThis);
