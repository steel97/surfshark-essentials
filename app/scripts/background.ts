import Browser from "webextension-polyfill";

Browser.runtime.onMessage.addListener(async (request, sender) => {
    if (request.action == "dns") {
        const dnsResp = await fetch(`https://1.1.1.1/dns-query?name=${request.url}&type=A`, {
            headers: new Headers({ "accept": "application/dns-json" })
        });

        return dnsResp.json();
    }
});