package com.pokegrid.mobile;

import android.Manifest;
import android.app.*;
import android.os.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.webkit.*;

public class MainActivity extends Activity {
    static final String RELAY = "https://pokegrid-relay-209e4eb1d9.onrender.com";
    WebView web;
    @Override public void onCreate(Bundle b){
        super.onCreate(b);
        getWindow().setStatusBarColor(Color.rgb(7,17,31));
        web=new WebView(this);
        WebSettings s=web.getSettings(); s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true); s.setAllowFileAccess(false);
        web.addJavascriptInterface(new Bridge(),"Android");
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r){
                Uri u=r.getUrl(); if("https".equals(u.getScheme()) && "pokegrid-relay-209e4eb1d9.onrender.com".equals(u.getHost())) return false;
                startActivity(new Intent(Intent.ACTION_VIEW,u)); return true;
            }
        });
        setContentView(web); web.loadUrl(RELAY+"/app/");
        if(Build.VERSION.SDK_INT>=33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},501);
    }
    @Override public void onBackPressed(){ if(web!=null&&web.canGoBack()) web.goBack(); else super.onBackPressed(); }

    public class Bridge {
        @JavascriptInterface public void setAuthToken(String token){ getSharedPreferences("pg",MODE_PRIVATE).edit().putString("token",token==null?"":token).apply(); }
        @JavascriptInterface public void setNotificationsEnabled(boolean enabled){
            getSharedPreferences("pg",MODE_PRIVATE).edit().putBoolean("enabled",enabled).apply();
            Intent i=new Intent(MainActivity.this,CaptureMonitorService.class);
            if(enabled){ if(Build.VERSION.SDK_INT>=26) startForegroundService(i); else startService(i); }
            else stopService(i);
        }
        @JavascriptInterface public boolean notificationsEnabled(){ return getSharedPreferences("pg",MODE_PRIVATE).getBoolean("enabled",true); }
        @JavascriptInterface public void testNotification(){ CaptureMonitorService.showCaptureNotification(MainActivity.this,"Pikachu","",true); }
    }
}
