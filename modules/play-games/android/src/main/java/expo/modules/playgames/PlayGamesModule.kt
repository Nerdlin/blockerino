package expo.modules.playgames

import com.google.android.gms.games.PlayGames
import com.google.android.gms.games.PlayGamesSdk
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Google Play Games Services v2. Play signs the player in by itself when the game starts (when they allowed it once);
// this module asks whether that worked, can ask again from a button, and reports achievements and scores. Every call
// fails quietly into false/nothing: a game installed from GitHub (another signing key) simply has no Play Games.
class PlayGamesModule : Module() {
  private var initialized = false

  private fun ensureInitialized(): Boolean {
    if (initialized) return true
    val context = appContext.reactContext ?: return false
    return try {
      PlayGamesSdk.initialize(context)
      initialized = true
      true
    } catch (e: Exception) {
      false
    }
  }

  override fun definition() = ModuleDefinition {
    Name("PlayGames")

    OnCreate {
      ensureInitialized()
    }

    AsyncFunction("isAuthenticated") { promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null || !ensureInitialized()) {
        promise.resolve(false)
        return@AsyncFunction
      }
      PlayGames.getGamesSignInClient(activity).isAuthenticated
        .addOnCompleteListener { task -> promise.resolve(task.isSuccessful && task.result.isAuthenticated) }
    }

    AsyncFunction("signIn") { promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null || !ensureInitialized()) {
        promise.resolve(false)
        return@AsyncFunction
      }
      PlayGames.getGamesSignInClient(activity).signIn()
        .addOnCompleteListener { task -> promise.resolve(task.isSuccessful && task.result.isAuthenticated) }
    }

    Function("unlockAchievement") { id: String ->
      val activity = appContext.currentActivity ?: return@Function
      if (!ensureInitialized()) return@Function
      try {
        PlayGames.getAchievementsClient(activity).unlock(id)
      } catch (e: Exception) {
        // not signed in or an unknown id: nothing to report
      }
    }

    Function("setAchievementSteps") { id: String, steps: Int ->
      val activity = appContext.currentActivity ?: return@Function
      if (!ensureInitialized() || steps <= 0) return@Function
      try {
        PlayGames.getAchievementsClient(activity).setSteps(id, steps)
      } catch (e: Exception) {
        // not signed in or an unknown id
      }
    }

    Function("submitScore") { leaderboardId: String, score: Double ->
      val activity = appContext.currentActivity ?: return@Function
      if (!ensureInitialized()) return@Function
      try {
        PlayGames.getLeaderboardsClient(activity).submitScore(leaderboardId, score.toLong())
      } catch (e: Exception) {
        // not signed in or an unknown id
      }
    }

    AsyncFunction("showAchievements") { promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null || !ensureInitialized()) {
        promise.resolve(false)
        return@AsyncFunction
      }
      PlayGames.getAchievementsClient(activity).achievementsIntent
        .addOnSuccessListener { intent ->
          activity.startActivityForResult(intent, 9003)
          promise.resolve(true)
        }
        .addOnFailureListener { promise.resolve(false) }
    }
  }
}
