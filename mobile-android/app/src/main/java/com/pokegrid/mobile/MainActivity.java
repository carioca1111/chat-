package com.pokegrid.mobile;

import android.Manifest;
import android.app.*;
import android.os.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.webkit.*;
import androidx.webkit.WebViewAssetLoader;

public class MainActivity extends Activity {
    static final String RELAY = "https://pokegrid-relay-209e4eb1d9.onrender.com";
    static final String APP_HOST = "appassets.androidplatform.net";
    WebView web;

    @Override public void onCreate(Bundle b){
        super.onCreate(b);
        getWindow().setStatusBarColor(Color.rgb(23,8,14));
        getWindow().setNavigationBarColor(Color.rgb(10,5,8));
        web=new WebView(this);
        WebSettings s=web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        web.addJavascriptInterface(new Bridge(),"Android");

        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
            .build();

        web.setWebViewClient(new WebViewClient(){
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request){
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r){
                Uri u=r.getUrl();
                if("https".equals(u.getScheme()) && APP_HOST.equals(u.getHost())) return false;
                if("https".equals(u.getScheme()) && "pokegrid-relay-209e4eb1d9.onrender.com".equals(u.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW,u)); } catch(Exception ignored){}
                return true;
            }
        });
        setContentView(web);
        web.loadUrl("https://appassets.androidplatform.net/assets/index.html");
        if(Build.VERSION.SDK_INT>=33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},501);
    }

    @Override protected void onPause(){
        if(web!=null){ try{web.evaluateJavascript("window.__gridiumVisibility&&window.__gridiumVisibility(false)",null);}catch(Exception ignored){} web.onPause(); }
        super.onPause();
    }
    @Override protected void onResume(){
        super.onResume();
        if(web!=null){ web.onResume(); try{web.evaluateJavascript("window.__gridiumVisibility&&window.__gridiumVisibility(true)",null);}catch(Exception ignored){} }
    }
    @Override protected void onDestroy(){
        if(web!=null){ try{web.evaluateJavascript("window.__gridiumVisibility&&window.__gridiumVisibility(false)",null);}catch(Exception ignored){} web.destroy();web=null; }
        super.onDestroy();
    }
    @Override public void onBackPressed(){ if(web!=null&&web.canGoBack()) web.goBack(); else super.onBackPressed(); }

    public class Bridge {
        @JavascriptInterface public void setAuthToken(String token){ getSharedPreferences("pg",MODE_PRIVATE).edit().putString("token",token==null?"":token).apply(); }
        @JavascriptInterface public String getAuthToken(){ return getSharedPreferences("pg",MODE_PRIVATE).getString("token",""); }
        @JavascriptInterface public void setNotificationsEnabled(boolean enabled){
            getSharedPreferences("pg",MODE_PRIVATE).edit().putBoolean("enabled",enabled).apply();
            Intent i=new Intent(MainActivity.this,CaptureMonitorService.class);
            if(enabled){ if(Build.VERSION.SDK_INT>=26) startForegroundService(i); else startService(i); }
            else stopService(i);
        }
        @JavascriptInterface public boolean notificationsEnabled(){ return getSharedPreferences("pg",MODE_PRIVATE).getBoolean("enabled",true); }
        @JavascriptInterface public String getNetworkType(){
            try{
                ConnectivityManager cm=(ConnectivityManager)getSystemService(Context.CONNECTIVITY_SERVICE);
                if(cm==null)return "unknown";
                Network network=cm.getActiveNetwork(); if(network==null)return "offline";
                NetworkCapabilities caps=cm.getNetworkCapabilities(network); if(caps==null)return "unknown";
                if(caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR))return "cellular";
                if(caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI))return "wifi";
                if(caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET))return "ethernet";
                return "other";
            }catch(Exception ignored){ return "unknown"; }
        }
        @JavascriptInterface public void testNotification(){ CaptureMonitorService.showCaptureNotification(MainActivity.this,"Notificações do Gridium funcionando","",true); }
    }
}
