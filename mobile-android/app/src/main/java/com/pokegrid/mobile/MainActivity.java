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

public class MainActivity extends Activity {
    static final String RELAY = "https://pokegrid-relay-209e4eb1d9.onrender.com";
    WebView web;
    final java.util.concurrent.ExecutorService network = java.util.concurrent.Executors.newSingleThreadExecutor();

    @Override public void onCreate(Bundle b){
        super.onCreate(b);
        getWindow().setStatusBarColor(Color.rgb(23,8,14));
        getWindow().setNavigationBarColor(Color.rgb(10,5,8));
        web=new WebView(this);
        WebSettings s=web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(false);
        s.setAllowFileAccessFromFileURLs(false);
        s.setAllowUniversalAccessFromFileURLs(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        web.addJavascriptInterface(new Bridge(),"Android");
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r){
                Uri u=r.getUrl();
                if("file:///android_asset/index.html".equals(u.toString())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW,u)); } catch(Exception e){android.util.Log.e("GridiumSync", "WebView lifecycle/navigation: "+e.getMessage());}
                return true;
            }
        });
        setContentView(web);
        web.loadUrl("file:///android_asset/index.html");
        if(Build.VERSION.SDK_INT>=33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},501);
    }

    @Override protected void onPause(){
        if(web!=null){ try{web.evaluateJavascript("window.__gridiumVisibility&&window.__gridiumVisibility(false)",null);}catch(Exception e){android.util.Log.e("GridiumSync", "WebView lifecycle/navigation: "+e.getMessage());} web.onPause(); }
        super.onPause();
    }
    @Override protected void onResume(){
        super.onResume();
        if(web!=null){ web.onResume(); try{web.evaluateJavascript("window.__gridiumVisibility&&window.__gridiumVisibility(true)",null);}catch(Exception e){android.util.Log.e("GridiumSync", "WebView lifecycle/navigation: "+e.getMessage());} }
    }
    @Override protected void onDestroy(){
        if(web!=null){ try{web.evaluateJavascript("window.__gridiumVisibility&&window.__gridiumVisibility(false)",null);}catch(Exception e){android.util.Log.e("GridiumSync", "WebView lifecycle/navigation: "+e.getMessage());} web.destroy();web=null; }
        network.shutdownNow();
        super.onDestroy();
    }
    @Override public void onBackPressed(){ if(web!=null&&web.canGoBack()) web.goBack(); else super.onBackPressed(); }

    public class Bridge {
        @JavascriptInterface public void migrateAuthToken(String legacy) {
            android.content.SharedPreferences sp=getSharedPreferences("pg",MODE_PRIVATE);
            if(!sp.getBoolean("authMigrated",false)) {
                String current=sp.getString("token","");
                String candidate=current.isEmpty()?legacy:current;
                setAuthToken(candidate!=null && candidate.startsWith("pg1.")?candidate:"");
            }
        }
        @JavascriptInterface public boolean hasAuthToken(){return !getAuthToken().isEmpty();}
        @JavascriptInterface public void relayRequest(String id,String path,String method,String body) {
            if(!id.matches("[0-9]{1,12}"))return;
            network.execute(()->{
                org.json.JSONObject result=RelayClient.request(path,method,body,getAuthToken());
                try {
                    org.json.JSONObject data=result.optJSONObject("data");
                    if(path.equals("/api/v1/pair/claim") && result.optInt("status")==200 && data!=null) {
                        String device=data.optString("token","");
                        if(device.startsWith("pg1.")){setAuthToken(device);data.remove("token");data.put("paired",true);}
                    }
                    result.put("tokenPresent",hasAuthToken());
                }catch(org.json.JSONException e){android.util.Log.e("GridiumSync","Bridge JSON: "+e.getMessage());}
                final String json=result.toString();
                runOnUiThread(()->{if(web!=null)web.evaluateJavascript("window.__relayResult("+org.json.JSONObject.quote(id)+","+json+")",null);});
            });
        }

        @JavascriptInterface public void setAuthToken(String token){ getSharedPreferences("pg",MODE_PRIVATE).edit().putString("token",token==null?"":token).putBoolean("authMigrated",true).commit(); }
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
            }catch(Exception e){android.util.Log.e("GridiumSync", "Network: "+e.getMessage()); return "unknown"; }
        }
        @JavascriptInterface public void testNotification(){ CaptureMonitorService.showCaptureNotification(MainActivity.this,"Notificações do Gridium funcionando","",true); }
    }
}
