// src/onesignal.js
const ONESIGNAL_APP_ID = "8c3bc536-e526-40ac-9ecd-19701c76b735";

let initialized = false;

export async function initOneSignal(groomerId) {
  if (process.env.NODE_ENV !== "production") return;
  if (initialized) return;
  initialized = true;

  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async function(OneSignal) {
    try {
      await OneSignal.init({
        appId: ONESIGNAL_APP_ID,
        notifyButton: { enable: false },
      });

      // Tag subscription with groomer ID for targeting
      await OneSignal.login(groomerId);

      console.log("OneSignal initialized for groomer:", groomerId);
    } catch (err) {
      console.error("OneSignal init error:", err.message);
      initialized = false; // allow retry if init failed
    }
  });
}

export async function requestNotificationPermission() {
  return new Promise((resolve) => {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async function(OneSignal) {
      try {
        await OneSignal.Notifications.requestPermission();
        resolve(OneSignal.Notifications.permission);
      } catch {
        resolve(false);
      }
    });
  });
}