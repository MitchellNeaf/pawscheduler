// src/onesignal.js
// OneSignal is initialized in index.html
// This module handles tagging the groomer after login
// and saving their subscription ID to Supabase

let loggedIn = false;

export async function initOneSignal(groomerId, supabase) {
  if (process.env.NODE_ENV !== "production") return;
  if (loggedIn) return;
  loggedIn = true;

  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async function(OneSignal) {
    try {
      // Tag this subscription with the groomer's ID
      await OneSignal.login(groomerId);

      // Get the OneSignal subscription ID and save it to Supabase
      const subscriptionId = await OneSignal.User.PushSubscription.id;
      if (subscriptionId && supabase) {
        await supabase
          .from("groomers")
          .update({ onesignal_player_id: subscriptionId })
          .eq("id", groomerId);
        console.log("OneSignal: saved subscription ID", subscriptionId);
      }
    } catch (err) {
      console.error("OneSignal init error:", err.message);
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