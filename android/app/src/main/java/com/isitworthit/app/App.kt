package com.isitworthit.app

import android.app.Application
import com.isitworthit.app.data.Repository
import com.isitworthit.app.data.AppPreferences

class App : Application() {
    val repository by lazy { Repository(AppPreferences(this)) }
}
