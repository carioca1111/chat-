package com.pokegrid.mobile;

import android.test.InstrumentationTestCase;
import org.json.JSONObject;

/** Runs inside Android; this checks the actual TLS/network stack, not JS mocks. */
public class RelayInstrumentedTest extends InstrumentationTestCase {
    public void testNativeHttpsHealthAndAuthentication() throws Exception {
        JSONObject health=RelayClient.request("/health","GET","","");
        assertEquals(health.toString(),200,health.optInt("status"));
        assertTrue(health.toString(),health.getJSONObject("data").getBoolean("ok"));
        JSONObject invalid=RelayClient.request("/api/v1/latest","GET","","invalid-test-device");
        assertEquals(invalid.toString(),401,invalid.optInt("status"));
        assertEquals("unauthorized",invalid.getJSONObject("data").getString("error"));
    }
    public void testTransportErrorCategoriesAndAllowlist() throws Exception {
        assertEquals("DNS FALHOU",RelayClient.category(new java.net.UnknownHostException("test")));
        assertEquals("TLS FALHOU",RelayClient.category(new javax.net.ssl.SSLHandshakeException("test")));
        assertEquals("TIMEOUT",RelayClient.category(new java.net.SocketTimeoutException("test")));
        assertEquals("PERMISSÃO/ENDPOINT",RelayClient.request("https://example.com","GET","","").getString("error"));
    }
    public void testNativeTokenSurvivesRecreationAndClearingPreventsLegacyResurrection() throws Exception {
        final MainActivity a=launchActivity(getInstrumentation().getTargetContext().getPackageName(),MainActivity.class,null);
        MainActivity.Bridge bridge=a.new Bridge();
        bridge.setAuthToken("pg1.test-device.signature");
        assertTrue(bridge.hasAuthToken());
        getInstrumentation().runOnMainSync(a::finish);getInstrumentation().waitForIdleSync();
        final MainActivity b=launchActivity(getInstrumentation().getTargetContext().getPackageName(),MainActivity.class,null);
        MainActivity.Bridge again=b.new Bridge();
        assertEquals("pg1.test-device.signature",again.getAuthToken());
        again.setAuthToken("");again.migrateAuthToken("pg1.stale.signature");assertFalse(again.hasAuthToken());
        getInstrumentation().runOnMainSync(b::finish);
    }
}
