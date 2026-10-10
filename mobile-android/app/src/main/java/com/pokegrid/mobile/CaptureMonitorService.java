package com.pokegrid.mobile;

import android.app.*;
import android.content.*;
import android.graphics.*;
import android.os.*;
import java.io.*;
import java.net.*;
import java.util.*;
import org.json.*;

public class CaptureMonitorService extends Service {
    static final String CHANNEL="pokegrid_captures", MONITOR="pokegrid_monitor";
    Handler h; Runnable loop;
    @Override public void onCreate(){ super.onCreate(); channels(); h=new Handler(Looper.getMainLooper());
        Notification n=new Notification.Builder(this,MONITOR).setSmallIcon(com.pokegrid.mobile.R.drawable.ic_stat_pg).setContentTitle("PokéGrid ativo").setContentText("Monitorando capturas em segundo plano").setOngoing(true).build();
        startForeground(44,n);
        loop=()->{ new Thread(this::poll).start(); h.postDelayed(loop,15000); }; h.post(loop);
    }
    @Override public int onStartCommand(Intent i,int f,int id){ return START_STICKY; }
    @Override public void onDestroy(){ if(h!=null&&loop!=null) h.removeCallbacks(loop); super.onDestroy(); }
    @Override public android.os.IBinder onBind(Intent i){ return null; }
    void channels(){ if(Build.VERSION.SDK_INT>=26){ NotificationManager m=getSystemService(NotificationManager.class);
        NotificationChannel a=new NotificationChannel(CHANNEL,"Capturas",NotificationManager.IMPORTANCE_HIGH); a.setDescription("Pokémon capturados"); m.createNotificationChannel(a);
        NotificationChannel b=new NotificationChannel(MONITOR,"Monitor do PokéGrid",NotificationManager.IMPORTANCE_LOW); b.setDescription("Mantém o monitor de capturas ativo"); m.createNotificationChannel(b); }}
    void poll(){ try{
        if(!getSharedPreferences("pg",MODE_PRIVATE).getBoolean("enabled",true)) return;
        String token=getSharedPreferences("pg",MODE_PRIVATE).getString("token",""); if(token.isEmpty()) return;
        HttpURLConnection c=(HttpURLConnection)new URL(MainActivity.RELAY+"/api/v1/latest").openConnection(); c.setConnectTimeout(8000); c.setReadTimeout(8000); c.setRequestProperty("Authorization","Bearer "+token);
        if(c.getResponseCode()!=200) return; String text=read(c.getInputStream()); JSONObject root=new JSONObject(text); JSONArray ev=root.optJSONArray("events"); if(ev==null||ev.length()==0)return;
        for(int i=Math.min(ev.length()-1,15);i>=0;i--){ JSONObject e=ev.optJSONObject(i); if(e==null)continue; String title=e.optString("title",""); String detail=e.optString("detail",""); String type=e.optString("type",""); String all=(title+" "+detail+" "+type).toLowerCase(Locale.ROOT); if(!all.contains("captur"))continue;
            String id=e.optString("id",e.optString("at","")+"|"+title+"|"+detail); String saved=getSharedPreferences("pg",MODE_PRIVATE).getString("lastEvent",""); if(id.equals(saved))continue;
            String name=e.optString("pokemon",e.optString("name",extractName(title,detail))); String image=e.optString("image",e.optString("imageUrl",""));
            showCaptureNotification(this,name,image,false); getSharedPreferences("pg",MODE_PRIVATE).edit().putString("lastEvent",id).apply(); break;
        }
    }catch(Exception ignored){} }
    static String read(InputStream in)throws Exception{ BufferedReader b=new BufferedReader(new InputStreamReader(in)); StringBuilder s=new StringBuilder(); for(String l;(l=b.readLine())!=null;)s.append(l); return s.toString(); }
    static String extractName(String t,String d){ String x=(t+" "+d).replaceAll("(?i).*captur(?:ou|ado|ada|ar)?[:\\s-]*","").trim(); if(x.length()>40||x.isEmpty())return "Novo Pokémon"; return x; }
    public static void showCaptureNotification(Context ctx,String name,String imageUrl,boolean test){
        if(name==null||name.trim().isEmpty())name="Novo Pokémon"; NotificationManager m=(NotificationManager)ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if(Build.VERSION.SDK_INT>=26 && m.getNotificationChannel(CHANNEL)==null){ NotificationChannel ch=new NotificationChannel(CHANNEL,"Capturas",NotificationManager.IMPORTANCE_HIGH); m.createNotificationChannel(ch); }
        Notification.Builder b=Build.VERSION.SDK_INT>=26?new Notification.Builder(ctx,CHANNEL):new Notification.Builder(ctx);
        b.setSmallIcon(com.pokegrid.mobile.R.drawable.ic_stat_pg).setContentTitle(test?"Teste de notificação":"Pokémon capturado!").setContentText(name).setAutoCancel(true);
        try{ Bitmap bm=downloadImage(imageUrl,name); if(bm!=null){ b.setLargeIcon(bm); b.setStyle(new Notification.BigPictureStyle().bigPicture(bm).setSummaryText(name)); }}catch(Exception ignored){}
        m.notify((int)(System.currentTimeMillis()%100000),b.build());
    }
    static Bitmap downloadImage(String direct,String name)throws Exception{ String url=direct;
        if(url==null||url.isEmpty()){ String slug=name.toLowerCase(Locale.ROOT).replace("♀","-f").replace("♂","-m").replaceAll("[^a-z0-9]+","-").replaceAll("(^-|-$)",""); if(slug.isEmpty()||slug.equals("novo-pokemon"))return null;
            HttpURLConnection p=(HttpURLConnection)new URL("https://pokeapi.co/api/v2/pokemon/"+URLEncoder.encode(slug,"UTF-8")).openConnection(); p.setConnectTimeout(5000); p.setReadTimeout(5000); if(p.getResponseCode()!=200)return null; JSONObject j=new JSONObject(read(p.getInputStream())); url=j.optJSONObject("sprites").optJSONObject("other").optJSONObject("official-artwork").optString("front_default",""); }
        if(url.isEmpty())return null; HttpURLConnection c=(HttpURLConnection)new URL(url).openConnection(); c.setConnectTimeout(5000); c.setReadTimeout(5000); return BitmapFactory.decodeStream(c.getInputStream());
    }
}
