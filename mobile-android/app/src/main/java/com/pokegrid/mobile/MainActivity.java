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
            @Override public void onPageFinished(WebView v,String url){
                super.onPageFinished(v,url);
                String js="(function(){try{if(window.__pgCapturePatch)return;window.__pgCapturePatch=1;var old=window.renderPokemon;window.renderPokemon=async function(){await old();try{var raw=Android.getDetectedCaptures();var arr=JSON.parse(raw||'[]');var box=document.getElementById('pokemonList');if(!box||!arr.length)return;if(box.querySelector('.empty'))box.innerHTML='';arr.slice(0,50).forEach(function(e){var d=document.createElement('div');d.className='poke';d.innerHTML='<div style=\"width:64px;height:64px;border-radius:16px;background:#081421;display:grid;place-items:center;font-size:28px\">?</div><div><b>Pokémon não identificado</b><small class=\"muted\">'+(e.account||'Conta')+' · '+(e.count||1)+((e.count||1)==1?' captura':' capturas')+'</small><div><span class=\"tag\">Detectado pelo contador</span><span class=\"tag muted\">Qualidade: sem dados</span></div></div><small class=\"muted\">'+(typeof ago==='function'?ago(e.at):'')+'</small>';box.appendChild(d);});}catch(e){}};var p=document.querySelector('#sec-pokemon p');if(p)p.textContent='Detecta capturas pelo contador de cada conta. O nome do Pokémon aparece quando essa informação existir nos dados do PC.';}catch(e){}})();";
                v.evaluateJavascript(js,null);
            }
        });
        setContentView(web); web.loadUrl("file:///android_asset/index.html");
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
        @JavascriptInterface public String getDetectedCaptures(){ return getSharedPreferences("pg",MODE_PRIVATE).getString("detectedCaptures","[]"); }
        @JavascriptInterface public void testNotification(){ CaptureMonitorService.showCaptureNotification(MainActivity.this,"Notificações funcionando","",true); }
    }
}
