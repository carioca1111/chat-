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
        getWindow().setStatusBarColor(Color.rgb(6,8,13));
        getWindow().setNavigationBarColor(Color.rgb(6,8,13));
        web=new WebView(this);
        WebSettings s=web.getSettings();
        s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true); s.setDatabaseEnabled(true); s.setAllowFileAccess(false); s.setCacheMode(WebSettings.LOAD_DEFAULT);
        web.addJavascriptInterface(new Bridge(),"Android");
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r){
                Uri u=r.getUrl(); if("https".equals(u.getScheme()) && "pokegrid-relay-209e4eb1d9.onrender.com".equals(u.getHost())) return false;
                try{ startActivity(new Intent(Intent.ACTION_VIEW,u)); }catch(Exception ignored){} return true;
            }
            @Override public void onReceivedError(WebView v,WebResourceRequest request,WebResourceError error){
                if(request.isForMainFrame()) showOffline();
            }
        });
        setContentView(web); web.loadUrl(RELAY+"/app/");
        if(Build.VERSION.SDK_INT>=33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},501);
        startMonitorIfReady();
    }
    void showOffline(){
        String html="<html><meta name='viewport' content='width=device-width,initial-scale=1'><body style='margin:0;background:#06080d;color:#eef4fa;font-family:system-ui;display:grid;place-items:center;height:100vh'><div style='max-width:330px;padding:28px;text-align:center'><h2>Gridium Mobile</h2><p style='color:#8290a4'>Não foi possível alcançar o Relay agora.</p><button onclick=\"location.href='"+RELAY+"/app/'\" style='border:0;border-radius:12px;padding:14px 20px;background:#43e6c1;color:#06100e;font-weight:800'>TENTAR NOVAMENTE</button></div></body></html>";
        web.loadDataWithBaseURL(RELAY,html,"text/html","UTF-8",null);
    }
    void startMonitorIfReady(){
        android.content.SharedPreferences sp=getSharedPreferences("pg",MODE_PRIVATE);
        if(!sp.getBoolean("enabled",true)||sp.getString("token","").isEmpty()) return;
        Intent i=new Intent(this,CaptureMonitorService.class); if(Build.VERSION.SDK_INT>=26) startForegroundService(i); else startService(i);
    }
    @Override public void onBackPressed(){ if(web!=null&&web.canGoBack()&&!web.getUrl().endsWith("/app/")) web.goBack(); else super.onBackPressed(); }

    public class Bridge {
        @JavascriptInterface public String getAuthToken(){ return getSharedPreferences("pg",MODE_PRIVATE).getString("token",""); }
        @JavascriptInterface public void setAuthToken(String token){
            String value=token==null?"":token;getSharedPreferences("pg",MODE_PRIVATE).edit().putString("token",value).apply();
            if(value.isEmpty()) stopService(new Intent(MainActivity.this,CaptureMonitorService.class)); else startMonitorIfReady();
        }
        @JavascriptInterface public void setNotificationsEnabled(boolean enabled){
            getSharedPreferences("pg",MODE_PRIVATE).edit().putBoolean("enabled",enabled).apply();
            Intent i=new Intent(MainActivity.this,CaptureMonitorService.class);
            if(enabled){ if(Build.VERSION.SDK_INT>=26) startForegroundService(i); else startService(i); }
            else stopService(i);
        }
        @JavascriptInterface public boolean notificationsEnabled(){ return getSharedPreferences("pg",MODE_PRIVATE).getBoolean("enabled",true); }
        @JavascriptInterface public String getDetectedCaptures(){ return getSharedPreferences("pg",MODE_PRIVATE).getString("detectedCaptures","[]"); }
        @JavascriptInterface public void testNotification(){ CaptureMonitorService.showCaptureNotification(MainActivity.this,"Gridium Mobile conectado","",true); }
    }
}
