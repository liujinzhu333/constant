package com.dream.mobile

import android.annotation.SuppressLint
import android.content.pm.ActivityInfo
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.WindowInsetsController
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.dream.mobile.BuildConfig
import com.dream.mobile.bridge.BridgeDispatcher

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var bridge: BridgeDispatcher

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 竖屏锁定
        requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT

        // 沉浸式状态栏：内容延伸到状态栏下方，H5 自行适配 safe-area
        setupEdgeToEdge()

        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        setupWebView()

        // 初始化 JSBridge 调度器（注入所有子 Bridge）
        bridge = BridgeDispatcher(this, webView)
        bridge.register()

        // 加载 H5
        loadH5()
    }

    private fun setupEdgeToEdge() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false)
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE or
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            )
        }
        // 状态栏图标深色（白底黑字）
        WindowInsetsControllerCompat(window, window.decorView).apply {
            isAppearanceLightStatusBars = true
            isAppearanceLightNavigationBars = true
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true           // localStorage
            databaseEnabled = true
            allowFileAccess = true             // 访问 assets/
            allowContentAccess = true
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            useWideViewPort = true
            loadWithOverviewMode = true
            javaScriptCanOpenWindowsAutomatically = false
            mediaPlaybackRequiresUserGesture = false

            // 混合内容：生产关闭，仅 debug 可开
            if (BuildConfig.DEBUG) {
                mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            }
        }

        // 开启 Chrome DevTools 调试
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url.toString()
                // 拦截 bridge:// 协议（备用方案，主要走 JavascriptInterface）
                if (url.startsWith("bridge://")) return true
                // 外部链接用系统浏览器打开（可按需调整）
                if (!url.startsWith("file://") && !url.startsWith("http://localhost")) {
                    return true
                }
                return false
            }

            override fun onPageFinished(view: WebView, url: String) {
                super.onPageFinished(view, url)
                // 注入系统安全区域 insets 给 H5
                injectSafeAreaInsets()
                // 通知 H5 平台信息
                bridge.onPageReady()
            }
        }
    }

    private fun loadH5() {
        // 优先加载热更新后的本地 H5 包
        val updateDir = getDir("h5_update", MODE_PRIVATE)
        val indexFile = java.io.File(updateDir, "index.html")

        if (indexFile.exists()) {
            webView.loadUrl("file://${indexFile.absolutePath}")
        } else {
            // 加载内置 assets/www/index.html
            webView.loadUrl("file:///android_asset/www/index.html")
        }
    }

    /**
     * 将状态栏/导航栏高度注入 H5，供 CSS safe-area 适配。
     */
    private fun injectSafeAreaInsets() {
        ViewCompat.getRootWindowInsets(webView)?.let { insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            val density = resources.displayMetrics.density
            val top = (bars.top / density).toInt()
            val bottom = (bars.bottom / density).toInt()
            val js = """
                (function() {
                    document.documentElement.style.setProperty('--safe-area-inset-top', '${top}px');
                    document.documentElement.style.setProperty('--safe-area-inset-bottom', '${bottom}px');
                    window.__DREAM_INSETS__ = { top: $top, bottom: $bottom };
                    window.dispatchEvent(new CustomEvent('dream:insets', { detail: { top: $top, bottom: $bottom } }));
                })();
            """.trimIndent()
            webView.evaluateJavascript(js, null)
        }
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    override fun onDestroy() {
        bridge.destroy()
        webView.destroy()
        super.onDestroy()
    }
}
