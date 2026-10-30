package com.nerdlin.blockerino

import android.content.Context
import android.content.res.Configuration

/**
 * The game's pixel layout is sized exactly, so the system font size is ignored: a larger font broke buttons and
 * grids, and React Native only picked a changed size up after a restart. Both the application and the activity
 * context are wrapped, because React Native reads display metrics from the application context.
 */
object FixedFontScale {
  fun wrap(base: Context): Context {
    val config = Configuration(base.resources.configuration)
    if (config.fontScale == 1f) return base
    config.fontScale = 1f
    return base.createConfigurationContext(config)
  }
}
