import { Cluster } from "./models/Cluster";
import { DNSResponse } from "./models/DNSResponse";
import Browser from "webextension-polyfill";
import JSZip from "jszip";
import FileSaver from "file-saver";

const htmlTemplate = `<div id="ssess-wgexportall-dialog" style="padding: 25px;padding-left: 25px;padding-right: 25px;background: rgba(27,180,183,.1);border-top: 2px solid #ff8282;box-sizing: border-box;border-bottom: 2px solid #ff8282;">
<div style="font-weight: 900;">SurfShark essentials</div>
<form style="color: #59626b;" onsubmit="event.preventDefault()">
    <label for="ssess-pk" style="display: block;">Private key:</label>
    <input type="text" id="ssess-pk" placeholder="private key..." style="background-color: rgba(34,46,58,.05);border: none;padding: 10px;border-radius: 10px;">
    <label for="ssess-dns" style="display: block;">DNS:</label>
    <input type="text" id="ssess-dns" placeholder="dns..." value="162.252.172.57, 149.154.159.92" style="background-color: rgba(34,46,58,.05);border: none;padding: 10px;border-radius: 10px;">
    <label for="ssess-address" style="display: block;">Address:</label>
    <input type="text" id="ssess-address" placeholder="address..." value="10.14.0.2/16" style="background-color: rgba(34,46,58,.05);border: none;padding: 10px;border-radius: 10px;display: block;">
    <input type="checkbox" id="ssess-fetchaddresses"> <label for="ssess-fetchaddresses">Use IP addresses instead of domains (useful if surfshark blocked in your country, and you can't use surfshark DNS)</label>      
    <button type="submit" id="ssess-wg-export" style="align-items: center;background: #178a9e;border: none;border-radius: 12px;box-sizing: border-box;color: #fff;cursor: pointer;display: inline-flex;flex-direction: row;font-size: 16px;font-weight: 700;height: 48px;outline: none;padding: 16px;display: flex;">Export configs</button>
    <div id="ssess-wg-pb-wrapper" style="display:none">
        <div style="margin-top: 4px;" id="ssess-wg-title"></div>
        <div style="height: 10px;background: rgba(34,46,58,.05);border-radius: 10px;overflow: hidden;"><div id="ssess-wg-pb" style="height: 100%;width: 0%;background: #ff8282;"></div></div>
    </div>
</form></div>`;

const checkPage = () => {
    const vpnType = document.querySelector("div[data-test='content-drawer'] > div > div > div");
    const injectElement = document.querySelector("div[data-test='content-drawer'] > div");
    const pubKeyInput = document.querySelector("[data-test='manual-setup-text-field-pubkey-readonly']");

    if (injectElement == null || vpnType == null || pubKeyInput == null) return;

    // inject UI element
    if ((vpnType as HTMLElement).innerHTML.toLowerCase() == "wireguard") {
        const el = document.getElementById("ssess-wgexportall-dialog");
        if (el == null) {
            const node = document.createElement("div");
            injectElement.insertBefore(node, injectElement.firstChild!.nextSibling);
            node.innerHTML = htmlTemplate;
        }
    }
};

const timer = () => {
    try {
        checkPage();
    } catch (e) {
        console.error(`[SurfsharkEssentials] Timer failed ${e}`);
    }
    setTimeout(timer, 100);
};

timer();

const setProgressBarData = (label: string, percent: number) => {
    document.getElementById("ssess-wg-title")!.innerHTML = label;
    document.getElementById("ssess-wg-pb")!.style.width = `${percent}%`;
};

const exportWGConfigs = () => {
    // get configs
    const pk = (document.getElementById("ssess-pk") as HTMLInputElement).value;
    const dns = (document.getElementById("ssess-dns") as HTMLInputElement).value;
    const address = (document.getElementById("ssess-address") as HTMLInputElement).value;
    const fetchaddresses = (document.getElementById("ssess-fetchaddresses") as HTMLInputElement).checked;

    console.log(`Config:\n\tPK size: ${pk.length}\n\tdns: ${dns}\n\taddress: ${address}\n\tfetch addresses for domains? ${fetchaddresses ? 'yes' : 'no'}`);

    // show progress bar and reset state
    setProgressBarData("Exporting...", 0);
    document.getElementById("ssess-wg-pb-wrapper")!.style.display = "block";

    fetch("https://my.surfshark.com/vpn/api/v4/server/clusters").then(async (resp) => {
        let currentIter = 0;
        const clusters: Array<Cluster> = await resp.json();

        // create archive
        const zip = new JSZip();

        for (const cluster of clusters) {
            const fname = `wg_${cluster.regionCode}-${cluster.countryCode}-${cluster.location}.conf`;
            let serverAddress = cluster.connectionName;
            if (fetchaddresses) {
                try {
                    const dns: DNSResponse = await Browser.runtime.sendMessage({
                        action: "dns",
                        url: cluster.connectionName
                    })
                    if (dns.Answer.length == 0) {
                        throw new Error("No addresses found");
                    }
                    serverAddress = dns.Answer[0].data;
                } catch (e) {
                    console.error(`[SurfsharkEssentials] Can't export ${fname}: ${e}`);
                }
            }

            // assemble config file
            const wgconf = `[Interface]
PrivateKey = ${pk}
Address = ${address}
DNS = ${dns}

[Peer]
PublicKey = ${cluster.pubKey}
AllowedIPs = 0.0.0.0/0
Endpoint = ${serverAddress}:51820
`;
            zip.file(fname, wgconf);
            currentIter++;
            // update info
            const percent = currentIter / clusters.length * 100;
            setProgressBarData(`Exporting ${currentIter}/${clusters.length} (${Math.round(percent)}%): ${fname}`, percent);
        }

        zip.generateAsync({ type: "blob" })
            .then(function (content) {
                FileSaver.saveAs(content, "wg-configs.zip");
            });
    });
};

document.addEventListener("click", (ev) => {
    const target = ev.target as HTMLElement;
    if (target.id != "ssess-wg-export") return;

    try {
        exportWGConfigs();
    } catch (e) {
        console.error(`[SurfsharkEssentials] Export failed: ${e}`);
    }
});