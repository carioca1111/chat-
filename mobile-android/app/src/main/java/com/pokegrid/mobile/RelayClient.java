package com.pokegrid.mobile;

import java.io.*;
import java.net.*;
import javax.net.ssl.*;
import java.nio.charset.StandardCharsets;
import org.json.*;

/** HTTPS only, fixed host/path, system trust store, no redirects or WebView cookies. */
public final class RelayClient {
    public static JSONObject request(String path, String method, String body, String token) {
        JSONObject result = new JSONObject();
        HttpsURLConnection c = null;
        long started = android.os.SystemClock.elapsedRealtime();
        try {
            boolean claim = path.equals("/api/v1/pair/claim") && method.equals("POST");
            boolean read = method.equals("GET") && (path.equals("/health") || path.equals("/api/v2/health") || path.equals("/api/v1/latest") || path.equals("/api/v2/state"));
            if (!claim && !read) throw new SecurityException("Endpoint não permitido");
            result.put("endpoint",path);
            c = (HttpsURLConnection)new URL(MainActivity.RELAY + path).openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(15000); c.setReadTimeout(20000); c.setUseCaches(false);
            c.setRequestMethod(method); c.setRequestProperty("Accept","application/json");
            c.setRequestProperty("User-Agent","Gridium2Mobile/Alpha-1.2");
            if (!claim && !path.endsWith("health") && token != null && !token.isEmpty()) c.setRequestProperty("Authorization","Bearer " + token);
            if (claim) {
                byte[] bytes=body.getBytes(StandardCharsets.UTF_8);
                c.setDoOutput(true); c.setFixedLengthStreamingMode(bytes.length);
                c.setRequestProperty("Content-Type","application/json");
                try(OutputStream out=c.getOutputStream()){out.write(bytes);}
            }
            int status=c.getResponseCode(); result.put("status",status);
            result.put("serverTime",c.getHeaderFieldDate("Date",0));
            InputStream stream=status>=400?c.getErrorStream():c.getInputStream();
            String content="";
            if(stream!=null) try(InputStream in=stream; ByteArrayOutputStream out=new ByteArrayOutputStream()) {
                byte[] buf=new byte[8192]; int n;
                while((n=in.read(buf))!=-1){if(out.size()+n>2097152)throw new IOException("Resposta maior que 2 MB");out.write(buf,0,n);}
                content=new String(out.toByteArray(),StandardCharsets.UTF_8);
            }
            try { result.put("data",new JSONObject(content)); }
            catch(JSONException e) {result.put("error","JSON INVÁLIDO");result.put("message",e.getClass().getSimpleName()+": resposta não é um objeto JSON");}
        } catch(Exception e) {
            try {result.put("error",category(e));result.put("message",e.getClass().getSimpleName()+": "+String.valueOf(e.getMessage()));}
            catch(JSONException impossible){throw new IllegalStateException(impossible);}
        } finally {if(c!=null)c.disconnect();}
        try { result.put("durationMs",android.os.SystemClock.elapsedRealtime()-started); }
        catch(JSONException impossible){throw new IllegalStateException(impossible);}
        // Never log headers, request bodies, tokens, or received account data.
        android.util.Log.i("GridiumSync",method+" "+path+" HTTP "+result.optInt("status",0)+" "+result.optString("error")+" "+result.optString("message"));
        return result;
    }
    public static String category(Exception e) {
        if(e instanceof UnknownHostException)return "DNS FALHOU";
        if(e instanceof SSLException)return "TLS FALHOU";
        if(e instanceof SocketTimeoutException)return "TIMEOUT";
        if(e instanceof SecurityException)return "PERMISSÃO/ENDPOINT";
        return "RELAY INACESSÍVEL";
    }
}
