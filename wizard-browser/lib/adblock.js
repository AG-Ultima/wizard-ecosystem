'use strict';
// Starter ad / tracker blocklist. Matching is by hostname suffix (doubleclick.net also blocks
// stats.g.doubleclick.net). Requests to a site from its own domain are never blocked, and neither
// are page navigations, so a site you open on purpose always loads.

const DOMAINS = `
doubleclick.net googlesyndication.com googleadservices.com googletagservices.com adservice.google.com
pagead2.googlesyndication.com google-analytics.com analytics.google.com ssl.google-analytics.com
2mdn.net adnxs.com adsrvr.org advertising.com adform.net amazon-adsystem.com aax.amazon-adsystem.com
criteo.com criteo.net taboola.com outbrain.com scorecardresearch.com quantserve.com quantcount.com
rubiconproject.com pubmatic.com openx.net casalemedia.com indexww.com smartadserver.com moatads.com
adsafeprotected.com doubleverify.com bluekai.com krxd.net demdex.net everesttech.net mathtag.com
rlcdn.com rfihub.com tapad.com turn.com yieldmo.com sharethrough.com teads.tv media.net 33across.com
lijit.com sovrn.com bidswitch.net contextweb.com serving-sys.com flashtalking.com zedo.com
revcontent.com mgid.com popads.net propellerads.com exoclick.com trafficjunky.com juicyads.com
adcolony.com applovin.com hotjar.com hotjar.io mixpanel.com amplitude.com fullstory.com mouseflow.com
crazyegg.com chartbeat.com chartbeat.net parsely.com comscore.com imrworldwide.com adsymptotic.com
pixel.facebook.com an.facebook.com ads-twitter.com analytics.twitter.com static.ads-twitter.com
px.ads.linkedin.com snap.licdn.com analytics.tiktok.com ct.pinterest.com analytics.pinterest.com
bat.bing.com clarity.ms ads.yahoo.com analytics.yahoo.com adtechus.com adtech.de yimg.com.ads
ads.pubmatic.com ib.adnxs.com secure.adnxs.com cdn.taboola.com widgets.outbrain.com paid.outbrain.com
tags.tiqcdn.com tealiumiq.com ensighten.com cdn.mxpnl.com api.segment.io cdn.segment.com
branch.io app.link adjust.com appsflyer.com kochava.com singular.net
ad.doubleclick.net googleads.g.doubleclick.net stats.g.doubleclick.net cm.g.doubleclick.net
adsystem.amazon.com adserver.snapads.com sc-static.net tr.snapchat.com
yandex.ru.metrika mc.yandex.ru an.yandex.ru
sitescout.com bidtheatre.com adroll.com d.adroll.com rtbhouse.com liadm.com id5-sync.com
360yield.com admixer.net adscale.de adition.com weborama.com weborama.fr eyeota.net nr-data.net
cxense.com piano.io tinypass.com permutive.com permutive.app onetag-sys.com sonobi.com gumgum.com
connatix.com primis.tech vidazoo.com spotxchange.com springserve.com freewheel.tv fwmrm.net
imasdk.googleapis.com adsafeprotected.com innovid.com tremorhub.com
`.split(/\s+/).filter(Boolean);

// Paths that are clearly ad requests even on a host we do not list.
const PATH_PATTERNS = [/\/pagead\/(?:js|id|viewthroughconversion)/, /\/adsbygoogle\.js/, /\/gpt\.js$/, /\/ads\/(?:ga-audiences|measurement)/];

function hostOf(url) {
    try { return new URL(url).hostname.toLowerCase(); } catch (e) { return ''; }
}

// "a.b.example.co.uk" and "example.co.uk" are the same site; good enough without a public-suffix list.
function siteKey(host) {
    const parts = host.split('.');
    if (parts.length <= 2) return host;
    const second = parts[parts.length - 2];
    const shortSecond = second.length <= 3 && ['co', 'com', 'org', 'net', 'gov', 'edu', 'ac'].includes(second);
    return parts.slice(shortSecond ? -3 : -2).join('.');
}

function createBlocker(extraDomains) {
    const set = new Set(DOMAINS.concat(extraDomains || []));
    function listed(host) {
        let h = host;
        while (h) {
            if (set.has(h)) return true;
            const i = h.indexOf('.');
            if (i < 0) return false;
            h = h.slice(i + 1);
        }
        return false;
    }
    return {
        size: set.size,
        // details: { url, resourceType, firstPartyUrl }
        shouldBlock(details) {
            if (!details || details.resourceType === 'mainFrame') return false;
            const host = hostOf(details.url);
            if (!host) return false;
            const first = hostOf(details.firstPartyUrl || '');
            if (first && siteKey(first) === siteKey(host)) return false;
            if (listed(host)) return true;
            if (first) {
                try { const p = new URL(details.url).pathname; if (PATH_PATTERNS.some(r => r.test(p))) return true; } catch (e) { /* ignore */ }
            }
            return false;
        }
    };
}

module.exports = { createBlocker, siteKey, hostOf, DOMAINS };
