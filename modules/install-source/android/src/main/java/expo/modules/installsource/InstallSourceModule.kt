package expo.modules.installsource

import android.os.Build
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
  }
}
