// src/onesignal.js
// OneSignal is initialized in index.html
// This module just handles tagging the groomer after login

let loggedIn = false;

export async function initOneSignal(groomerId) {
  if (process.env.NODE_ENV !== "production") return;
  if (loggedIn) return;
  loggedIn = true;

  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async function(OneSignal) {
    try {
      // Tag this subscription with the groomer's ID for targeting
      await OneSignal.login(groomerId);
      console.log("OneSignal: logged in groomer", groomerId);
    } catch (err) {
      console.error("OneSignal login error:", err.message);
      loggedIn = false;
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