# Dream Mobile Base — ProGuard Rules

# 保留 JSBridge 注入接口（@JavascriptInterface 方法不能被混淆）
-keepclassmembers class com.dream.mobile.bridge.** {
    @android.webkit.JavascriptInterface <methods>;
}

# 保留 Kotlin coroutines
-keepnames class kotlinx.coroutines.internal.MainDispatcherFactory {}
-keepnames class kotlinx.coroutines.CoroutineExceptionHandler {}
-keepclassmembernames class kotlinx.** {
    volatile <fields>;
}

# 保留 AndroidX Biometric
-keep class androidx.biometric.** { *; }
