package dev.t3quest;

import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public final class BridgeClient {
    public static String normalizeUrl(String input) throws Exception {
        URI uri = new URI(input.trim());
        if (!("http".equals(uri.getScheme()) || "https".equals(uri.getScheme())) || uri.getHost() == null
                || uri.getRawUserInfo() != null || uri.getRawQuery() != null || uri.getRawFragment() != null
                || !(uri.getPath().isEmpty() || uri.getPath().equals("/"))) {
            throw new IllegalArgumentException("Enter an http(s) server origin, for example http://192.168.1.20:8787");
        }
        return input.trim().replaceAll("/+$", "");
    }

    public static JSONObject request(String base, String token, String path, File audio) throws Exception {
        return request(base,token,path,audio,null);
    }
    public static JSONObject post(String base,String token,String path,JSONObject body) throws Exception {
        return request(base,token,path,null,body);
    }
    private static JSONObject request(String base, String token, String path, File audio, JSONObject body) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(normalizeUrl(base) + path).openConnection();
        connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(5000);
        connection.setReadTimeout(audio == null ? 30000 : 90000);
        connection.setRequestProperty("Authorization", "Bearer " + token);
        connection.setRequestProperty("Accept", "application/json");
        try {
            if (audio != null) {
                connection.setRequestMethod("POST");
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "audio/wav");
                connection.setFixedLengthStreamingMode(audio.length());
                try (FileInputStream input = new FileInputStream(audio); java.io.OutputStream out = connection.getOutputStream()) {
                    byte[] chunk = new byte[8192]; int n;
                    while ((n = input.read(chunk)) > 0) out.write(chunk, 0, n);
                }
            }
            if(body!=null){
                byte[] data=body.toString().getBytes(StandardCharsets.UTF_8);
                connection.setRequestMethod("POST");connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type","application/json");connection.setFixedLengthStreamingMode(data.length);
                try(java.io.OutputStream out=connection.getOutputStream()){out.write(data);}
            }
            int status = connection.getResponseCode();
            if (status != 200) {
                String message="Bridge HTTP "+status+(status==401?" · check the bridge token":"");
                try(InputStream error=connection.getErrorStream()) { if(error!=null){byte[] data=new byte[4096];int used=0,n;while(used<data.length&&(n=error.read(data,used,data.length-used))>0)used+=n;String detail=new JSONObject(new String(data,0,used,StandardCharsets.UTF_8)).optString("error");if(!detail.isEmpty())message=detail;} }catch(Exception ignored){}
                throw new IllegalStateException(message);
            }
            try (InputStream input = connection.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] chunk = new byte[8192]; int n;
                while ((n = input.read(chunk)) > 0) {
                    if (out.size() + n > (path.startsWith("/api/threads/") ? 24_000_000 : 2_000_000)) throw new IllegalStateException("Bridge response too large");
                    out.write(chunk, 0, n);
                }
                JSONObject result = new JSONObject(out.toString(StandardCharsets.UTF_8.name()));
                if (path.equals("/api/state") &&
                        (!(result.optString("mode").equals("demo") || result.optString("mode").equals("t3-read-only") || result.optString("mode").equals("t3-connected"))
                        || result.optJSONArray("threads") == null || !result.has("status"))) {
                    throw new IllegalStateException("This address is not a compatible T3 Quest bridge");
                }
                return result;
            }
        } finally { connection.disconnect(); }
    }
}
