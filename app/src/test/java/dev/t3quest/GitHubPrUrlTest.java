package dev.t3quest;

import org.junit.Test;
import static org.junit.Assert.*;

public class GitHubPrUrlTest {
    @Test public void preservesPullRequestIdentityAcrossSectionsAndDeepLinks() {
        String root="https://github.com/example/vr-app/pull/42";
        for(String suffix:new String[]{"","/","/files","/checks","/commits","?diff=split#discussion_r123"})
            assertEquals(root,GitHubPrUrl.root(root+suffix));
        assertEquals(root,GitHubPrUrl.root("https://GITHUB.com:443/example/vr-app/pull/42"));
    }
    @Test public void rejectsLookalikeHostsAndLocalOrPrivilegedUrls() {
        for(String url:new String[]{"http://github.com/a/b/pull/1","https://github.com.evil.test/a/b/pull/1","https://github.com@evil.test/a/b/pull/1","https://name@github.com/a/b/pull/1","file:///tmp/pr","javascript:alert(1)","intent://github.com/a/b/pull/1","https://github.com:8080/a/b/pull/1","https://quest.t3.local/ui/index.html"}) {
            assertNull(url,GitHubPrUrl.root(url));assertFalse(url,GitHubPrUrl.isGitHub(url));
        }
    }
    @Test public void onlyPullRequestsCanOpenThePrPanel() {
        for(String url:new String[]{"https://github.com/a/b/issues/42","https://github.com/a/b/pull/0","https://github.com/a/b/pull/nope","https://github.com/a/b/pull/1/../../settings","https://github.com/a/b%2fother/pull/1","https://github.com/../b/pull/1","https://github.com/login", "not a URL"})assertNull(url,GitHubPrUrl.root(url));
    }
    @Test public void allowsGitHubLoginAndNavigationWithoutTreatingThemAsPrEntryPoints() {
        assertTrue(GitHubPrUrl.isGitHub("https://github.com/login?return_to=%2Fa%2Fb%2Fpull%2F1"));
        assertTrue(GitHubPrUrl.isGitHub("https://github.com/sessions/two-factor"));
        assertFalse(GitHubPrUrl.isGitHub("https://example.com/login"));
    }
}
