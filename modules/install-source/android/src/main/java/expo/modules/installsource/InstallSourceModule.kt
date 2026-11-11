package expo.modules.installsource

import android.app.Activity
import android.os.Build
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.appupdate.AppUpdateOptions
import com.google.android.play.core.install.model.ActivityResult
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.UpdateAvailability
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class InstallSourceModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("InstallSource")

    // The package that installed this app ("com.android.vending" for Google Play), or null when it was sideloaded.
    Function("getInstallerPackageName") {
      val context = appContext.reactContext ?: return@Function null
      val packageManager = context.packageManager
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
          packageManager.getInstallSourceInfo(context.packageName).installingPackageName
        } else {
          @Suppress("DEPRECATION")
          packageManager.getInstallerPackageName(context.packageName)
        }
      } catch (e: Exception) {
        null
      }
    }

    // Google Play in-app updates. Asks Play whether a newer build of this app is out:
    // { status: "available" | "in_progress" | "none" | "error", versionCode }.
    AsyncFunction("getPlayUpdate") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.resolve(mapOf("status" to "error", "versionCode" to 0))
        return@AsyncFunction
      }
      try {
        AppUpdateManagerFactory.create(context).appUpdateInfo
          .addOnSuccessListener { info ->
            val status = when {
              info.updateAvailability() == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS -> "in_progress"
              info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE
                && info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE) -> "available"
              else -> "none"
            }
            promise.resolve(mapOf("status" to status, "versionCode" to info.availableVersionCode()))
          }
          .addOnFailureListener { promise.resolve(mapOf("status" to "error", "versionCode" to 0)) }
      } catch (e: Exception) {
        promise.resolve(mapOf("status" to "error", "versionCode" to 0))
      }
    }

    // Shows Google Play's own full-screen "Update available" window; Play downloads the update and restarts the
    // game. Resolves "ok", "canceled" (the player went back), "failed" or "none" (nothing to update right now).
    AsyncFunction("startPlayUpdate") { promise: Promise ->
      val context = appContext.reactContext
      val activity = appContext.currentActivity
      if (context == null || activity == null) {
        promise.resolve("failed")
        return@AsyncFunction
      }
      try {
        val manager = AppUpdateManagerFactory.create(context)
        manager.appUpdateInfo
          .addOnSuccessListener { info ->
            val ready = info.updateAvailability() == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS
              || (info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE
                && info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE))
            if (!ready) {
              promise.resolve("none")
              return@addOnSuccessListener
            }
            manager.startUpdateFlow(info, activity, AppUpdateOptions.newBuilder(AppUpdateType.IMMEDIATE).build())
              .addOnSuccessListener { result ->
                promise.resolve(
                  when (result) {
                    Activity.RESULT_OK -> "ok"
                    Activity.RESULT_CANCELED -> "canceled"
                    ActivityResult.RESULT_IN_APP_UPDATE_FAILED -> "failed"
                    else -> "failed"
                  }
                )
              }
              .addOnFailureListener { promise.resolve("failed") }
          }
          .addOnFailureListener { promise.resolve("failed") }
      } catch (e: Exception) {
        promise.resolve("failed")
      }
    }
  }
}
