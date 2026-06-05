// src/onesignal.js
// OneSignal Web Push initialization
// Called once from App.js after the groomer is authenticated

const ONESIGNAL_APP_ID = "427113ca-0d9d-4d53-9067-5ee03bb2c1df";

export async function initOneSignal(groomerId) {
  // Don't run in development
  if (process.env.NODE_ENV !== "production") return;

  // Don't run if OneSignal SDK isn't loaded
  if (!window.OneSignal) {
    console.warn("OneSignal SDK not loaded yet");
    return;
  }

  try {
    await window.OneSignal.init({
      appId: ONESIGNAL_APP_ID,
      safari_web_id: "", // leave blank for now
      notifyButton: {
        enable: false, // we'll use our own prompt button
      },
      allowLocalhostAsSecureOrigin: false,
    });

    // Tag the subscription with the groomer ID so we can target them
    await window.OneSignal.login(groomerId);

    console.log("OneSignal initialized for groomer:", groomerId);
  } catch (err) {
    console.error("OneSignal init error:", err);
  }
}

export async function requestNotificationPermission() {
  if (!window.OneSignal) return false;
  try {
    await window.OneSignal.Notifications.requestPermission();
    return window.OneSignal.Notifications.permission;
  } catch (err) {
    console.error("Permission request error:", err);
    return false;
  }
}

export function getNotificationPermission() {
  if (!window.OneSignal) return "default";
  return window.OneSignal.Notifications.permission ? "granted" : "default";
}