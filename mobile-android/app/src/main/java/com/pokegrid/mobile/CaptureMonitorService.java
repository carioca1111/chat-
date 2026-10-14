package com.pokegrid.mobile;

import android.app.*;
import android.content.*;
import android.os.*;
import java.io.*;
import java.net.*;
import org.json.*;

public class CaptureMonitorService extends Service {
    static final String CHANNEL="gridium_alerts", MONITOR="gridium_monitor";
    Handler h; Runnable loop;
    @Override public void onCreate(){ super.onCreate(); channels();h=new Handler(Looper.getMainLooper());
        Notification n=base(MONITOR,"Gridium Mobile ativo","Alertas e saúde do PC em segundo plano",true).build();startForeground(44,n);
        loop=()->{new Thread(this::poll).start();h.postDelayed(loop,30000);};h.post(loop);
    }
    @Override public int onStartCommand(Intent i,int f,int id){return START_STICKY;}
    @Override public void onDestroy(){if(h!=null&&loop!=null)h.removeCallbacks(loop);super.onDestroy();}
    @Override public android.os.IBinder onBind(Intent i){return null;}
    void channels(){if(Build.VERSION.SDK_INT>=26){NotificationManager m=getSystemService(NotificationManager.class);NotificationChannel a=new NotificationChannel(CHANNEL,"Alertas do Gridium",NotificationManager.IMPORTANCE_HIGH);a.setDescription("Shiny, Sniper, capturas e conexões");m.createNotificationChannel(a);NotificationChannel b=new NotificationChannel(MONITOR,"Monitor do Gridium",NotificationManager.IMPORTANCE_LOW);b.setDescription("Mantém os alertas remotos ativos");m.createNotificationChannel(b);}}
    Notification.Builder base(String channel,String title,String text,boolean ongoing){Notification.Builder b=Build.VERSION.SDK_INT>=26?new Notification.Builder(this,channel):new Notification.Builder(this);Intent open=new Intent(this,MainActivity.class);PendingIntent pi=PendingIntent.getActivity(this,0,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);return b.setSmallIcon(com.pokegrid.mobile.R.drawable.ic_stat_pg).setContentTitle(title).setContentText(text).setContentIntent(pi).setOngoing(ongoing).setAutoCancel(!ongoing);}
    void poll(){try{
        android.content.SharedPreferences sp=getSharedPreferences("pg",MODE_PRIVATE);if(!sp.getBoolean("enabled",true))return;String token=sp.getString("token","");if(token.isEmpty())return;
        HttpURLConnection c=(HttpURLConnection)new URL(MainActivity.RELAY+"/api/v2/state").openConnection();c.setConnectTimeout(8000);c.setReadTimeout(10000);c.setRequestProperty("Authorization","Bearer "+token);if(c.getResponseCode()!=200)return;
        JSONObject state=new JSONObject(read(c.getInputStream()));boolean pc=state.optBoolean("pcOnline",false);if(sp.contains("lastPcOnline")){boolean prev=sp.getBoolean("lastPcOnline",false);if(prev&&!pc)showAlert("Gridium Desktop offline","O celular perdeu o sinal do PC.");else if(!prev&&pc)showAlert("Gridium Desktop online","A conexão com o PC voltou.");}sp.edit().putBoolean("lastPcOnline",pc).apply();
        JSONObject root=state.optJSONObject("snapshot");if(root==null)return;JSONArray rows=root.optJSONArray("rows");if(rows!=null)for(int i=0;i<rows.length();i++){JSONObject row=rows.optJSONObject(i);if(row==null)continue;int slot=row.optInt("slot",i);JSONObject rec=row.optJSONObject("record"),vals=rec!=null?rec.optJSONObject("values"):null;if(vals==null||!vals.has("capturas"))continue;long count=Math.round(vals.optDouble("capturas",0));String key="lastCaptures_"+slot;long prev=sp.getLong(key,-1);if(prev>=0&&count>prev){long delta=Math.min(999,count-prev);String account=rec.optString("nick","Conta "+(slot+1));showAlert("Nova captura",account+" • "+delta+(delta==1?" captura":" capturas"));appendDetected(account,slot,delta,System.currentTimeMillis());}sp.edit().putLong(key,count).apply();}
        JSONObject total=root.optJSONObject("total"),tv=total!=null?total.optJSONObject("values"):null;if(tv!=null){long shiny=Math.round(tv.optDouble("shinies",0));long old=sp.getLong("lastShinies",-1);if(old>=0&&shiny>old)showAlert("✨ Shiny capturado!",(shiny-old)+" novo shiny registrado pelo Gridium.");sp.edit().putLong("lastShinies",shiny).apply();}
        JSONObject grid=root.optJSONObject("gridium"),mobile=grid!=null?grid.optJSONObject("mobile"):null,sn=mobile!=null?mobile.optJSONObject("sniper"):null,metrics=sn!=null?sn.optJSONObject("metrics"):null;if(metrics!=null){long wins=Math.round(metrics.optDouble("wins",0));long old=sp.getLong("lastSniperWins",-1);if(old>=0&&wins>old)showAlert("⚡ Sniper comprou",(wins-old)+" nova compra confirmada.");sp.edit().putLong("lastSniperWins",wins).apply();}
    }catch(Exception ignored){}}
    void showAlert(String title,String text){NotificationManager m=(NotificationManager)getSystemService(Context.NOTIFICATION_SERVICE);Notification.Builder b=base(CHANNEL,title,text,false).setDefaults(Notification.DEFAULT_ALL);m.notify((int)(System.currentTimeMillis()%100000),b.build());}
    void appendDetected(String account,int slot,long count,long at){try{android.content.SharedPreferences sp=getSharedPreferences("pg",MODE_PRIVATE);JSONArray arr;try{arr=new JSONArray(sp.getString("detectedCaptures","[]"));}catch(Exception e){arr=new JSONArray();}JSONObject x=new JSONObject();x.put("at",at);x.put("account",account);x.put("slot",slot);x.put("count",count);x.put("name","Pokémon não identificado");x.put("inferred",true);JSONArray out=new JSONArray();out.put(x);for(int i=0;i<arr.length()&&i<99;i++)out.put(arr.opt(i));sp.edit().putString("detectedCaptures",out.toString()).apply();}catch(Exception ignored){}}
    static String read(InputStream in)throws Exception{BufferedReader b=new BufferedReader(new InputStreamReader(in));StringBuilder s=new StringBuilder();for(String l;(l=b.readLine())!=null;)s.append(l);return s.toString();}
    public static void showCaptureNotification(Context ctx,String text,String imageUrl,boolean test){NotificationManager m=(NotificationManager)ctx.getSystemService(Context.NOTIFICATION_SERVICE);if(Build.VERSION.SDK_INT>=26&&m.getNotificationChannel(CHANNEL)==null)m.createNotificationChannel(new NotificationChannel(CHANNEL,"Alertas do Gridium",NotificationManager.IMPORTANCE_HIGH));Notification.Builder b=Build.VERSION.SDK_INT>=26?new Notification.Builder(ctx,CHANNEL):new Notification.Builder(ctx);b.setSmallIcon(com.pokegrid.mobile.R.drawable.ic_stat_pg).setContentTitle(test?"Teste do Gridium":"Nova captura").setContentText(text==null?"Gridium Mobile":text).setAutoCancel(true).setDefaults(Notification.DEFAULT_ALL);m.notify((int)(System.currentTimeMillis()%100000),b.build());}
}
