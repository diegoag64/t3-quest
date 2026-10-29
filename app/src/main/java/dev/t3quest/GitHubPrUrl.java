package dev.t3quest;

import java.net.URI;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Keeps untrusted thread links out of the privileged packaged conversation WebView. */
public final class GitHubPrUrl {
    private static final Pattern PR = Pattern.compile("^/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)/pull/([1-9][0-9]*)(?:/(?:files|checks|commits))?/?$");
    public static boolean isGitHub(String value) {
        try {
            URI uri = new URI(value);
            return "https".equalsIgnoreCase(uri.getScheme()) && "github.com".equalsIgnoreCase(uri.getHost())
                && uri.getRawUserInfo() == null && (uri.getPort() == -1 || uri.getPort() == 443);
        } catch (Exception ignored) { return false; }
    }
    public static String root(String value) {
        if (!isGitHub(value) || value.length() > 4000) return null;
        try {
            Matcher match = PR.matcher(new URI(value).getRawPath());
            if (!match.matches() || match.group(1).equals(".") || match.group(1).equals("..")
                || match.group(2).equals(".") || match.group(2).equals("..")) return null;
            return "https://github.com/" + match.group(1) + "/" + match.group(2) + "/pull/" + match.group(3);
        } catch (Exception ignored) { return null; }
    }
    private GitHubPrUrl() { }
}
