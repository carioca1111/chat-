package com.pokegrid.mobile;

import android.app.*;
import android.content.*;
import android.os.*;
import java.io.*;
import java.net.*;
import org.json.*;

public class CaptureMonitorService extends Service {
    static final String CHANNEL="pokegrid_captures", MONITOR="pokegrid_monitor";
    Handler h; Runnable loop;
    final java.util.concurrent.atomic.AtomicBoolean polling=new java.util.concurrent.atomic.AtomicBoolean(false);
    @Override public void onCreate(){ super.onCreate(); channels(); h=new Handler(Looper.getMainLooper());
        Notification n=(Build.VERSION.SDK_INT>=26?new Notification.Builder(this,MONITOR):new Notification.Builder(this)).setSmallIcon(com.pokegrid.mobile.R.drawable.ic_stat_pg).setContentTitle("Gridium 2 Mobile ativo").setContentText("Monitorando capturas em segundo plano").setOngoing(true).build();
        startForeground(44,n); loop=()->{ new Thread(this::poll).start(); h.postDelayed(loop,15000); }; h.post(loop);
    }
    @Override public int onStartCommand(Intent i,int f,int id){ return START_STICKY; }
    public void onTimeout(int startId,int fgsType){stopSelf();}
    @Override public void onDestroy(){ if(h!=null&&loop!=null) h.removeCallbacks(loop); super.onDestroy(); }
    @Override public android.os.IBinder onBind(Intent i){ return null; }
    void channels(){ if(Build.VERSION.SDK_INT>=26){ NotificationManager m=getSystemService(NotificationManager.class); NotificationChannel a=new NotificationChannel(CHANNEL,"Capturas do Gridium",NotificationManager.IMPORTANCE_HIGH); a.setDescription("Pokémon capturados"); m.createNotificationChannel(a); NotificationChannel b=new NotificationChannel(MONITOR,"Monitor do Gridium 2",NotificationManager.IMPORTANCE_LOW); b.setDescription("Mantém o monitor de capturas ativo"); m.createNotificationChannel(b); }}
    void poll(){ if(!polling.compareAndSet(false,true))return; try{
        if(!getSharedPreferences("pg",MODE_PRIVATE).getBoolean("enabled",true)) return;
        String token=getSharedPreferences("pg",MODE_PRIVATE).getString("token",""); if(token.isEmpty()) return;
        JSONObject response=RelayClient.request("/api/v1/latest","GET","",token);
        if(response.optInt("status")!=200 || response.has("error")) return;
        JSONObject root=response.getJSONObject("data"); JSONArray rows=root.optJSONArray("rows");
        if(rows!=null&&rows.length()>0){ for(int i=0;i<rows.length();i++){ JSONObject row=rows.optJSONObject(i); if(row==null)continue; int slot=row.optInt("slot",i); JSONObject rec=row.optJSONObject("record"),vals=rec!=null?rec.optJSONObject("values"):null; if(vals==null||!vals.has("capturas"))continue; long nowCount=Math.round(vals.optDouble("capturas",0)); String key="lastCaptures_"+slot; android.content.SharedPreferences sp=getSharedPreferences("pg",MODE_PRIVATE); long prev=sp.getLong(key,-1); if(prev>=0&&nowCount>prev){ long delta=Math.min(nowCount-prev,999); String account=rec.optString("nick",""); if(account.trim().isEmpty())account="Conta "+(slot+1); showCaptureNotification(this,account+" • "+delta+(delta==1?" captura":" capturas"),"",false); } sp.edit().putLong(key,nowCount).apply(); } return; }
        JSONObject total=root.optJSONObject("total"),vals=total!=null?total.optJSONObject("values"):null; if(vals!=null&&vals.has("capturas")){ long nowCount=Math.round(vals.optDouble("capturas",0)); android.content.SharedPreferences sp=getSharedPreferences("pg",MODE_PRIVATE); long prev=sp.getLong("lastCapturesTotal",-1); if(prev>=0&&nowCount>prev){ long delta=Math.min(nowCount-prev,999); showCaptureNotification(this,delta+(delta==1?" nova captura":" novas capturas"),"",false); } sp.edit().putLong("lastCapturesTotal",nowCount).apply(); }
    }catch(Exception e){android.util.Log.e("GridiumSync","Capture monitor: "+e.getClass().getSimpleName()+": "+e.getMessage());}finally{polling.set(false);} }
    static String read(InputStream in)throws Exception{ BufferedReader b=new BufferedReader(new InputStreamReader(in)); StringBuilder s=new StringBuilder(); for(String l;(l=b.readLine())!=null;)s.append(l); return s.toString(); }
    public static void showCaptureNotification(Context ctx,String text,String imageUrl,boolean test){ if(text==null||text.trim().isEmpty())text="Nova captura detectada"; NotificationManager m=(NotificationManager)ctx.getSystemService(Context.NOTIFICATION_SERVICE); if(Build.VERSION.SDK_INT>=26&&m.getNotificationChannel(CHANNEL)==null)m.createNotificationChannel(new NotificationChannel(CHANNEL,"Capturas do Gridium",NotificationManager.IMPORTANCE_HIGH)); Notification.Builder b=Build.VERSION.SDK_INT>=26?new Notification.Builder(ctx,CHANNEL):new Notification.Builder(ctx); b.setSmallIcon(com.pokegrid.mobile.R.drawable.ic_stat_pg).setContentTitle(test?"Teste do Gridium":"Nova captura detectada!").setContentText(text).setAutoCancel(true).setDefaults(Notification.DEFAULT_ALL); m.notify((int)(System.currentTimeMillis()%100000),b.build()); }
}
