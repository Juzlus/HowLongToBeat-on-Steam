let customReplaces = null;
let subPage = "lookup"
const version = "1.8";

let apiUserKey = null;
let apiSearchKey = null;
let fetchData = null;

fetch('https://raw.githubusercontent.com/Juzlus/HowLongToBeat-on-Steam/refs/heads/main/server.json')
  .then(response => response.json())
  .then(data => {
    if (!data) return;
    if (data?.version_firefox != version)
    chrome.notifications.create('updateNotification', {
      title: 'HowLongToBeat on Steam',
      message: 'New version available. Click to download!',
      priority: 1,
      iconUrl: 'https://raw.githubusercontent.com/Juzlus/HowLongToBeat-on-Steam/refs/heads/main/icons/2048.png',
      type: 'basic'
    });
    customReplaces = data?.custom_replaces;

    chrome.notifications.onClicked.addListener((notifId) => {
      if (notifId !== 'updateNotification') return;
      chrome.tabs.create({
        url: `https://github.com/Juzlus/HowLongToBeat-on-Steam/releases/latest/download/HowLongToBeat_on_Steam_v${data?.version_firefox}_[FireFox].zip`
      });
    });
});

async function getFetchData() {
  await fetch('https://raw.githubusercontent.com/Juzlus/HowLongToBeat-on-Steam/refs/heads/main/fetchData.txt')
    .then(response => response.text())
    .then(html => {
      if (!html) return;
      fetchData = html;
    });
}

async function getKey() {
  let appUrl = null;
  await fetch('https://howlongtobeat.com')
    .then(response => response.text())
    .then(html => {
      if (!html) return;
      const _appUrl = html.slice(html.indexOf("/pages/_app-") - 40).split('"')[1];
      if (!_appUrl) return;
      appUrl = _appUrl;
    });
  
  if (appUrl)
    await fetch(`https://howlongtobeat.com${appUrl}`)
      .then(response2 => response2.text())
      .then(script => {
        if (!script) return;
        const userKey = script.slice(script.indexOf('users:{id:"')).split('"')[1];
        if (userKey)
          apiUserKey = userKey;

        const index = script.indexOf('searchOptions:');
        const frag = script.slice(index - 400, index);
        subPage = frag.slice(frag.indexOf(`fetch("/api/`) + 12, frag.indexOf('/".concat'));

        const matches = [...frag.matchAll(/\.concat\(["']([^"']+)["']\)/g)];
        matches.forEach(el => {
          apiSearchKey = !apiSearchKey ? el[1] : apiSearchKey + el[1];
        });
      });
}

getKey();
getFetchData();

chrome.webRequest.onBeforeSendHeaders.addListener(
  function(details) {
    details.requestHeaders.push({
      name: "Referer",
      value: "https://howlongtobeat.com/"
    });
    return { requestHeaders: details.requestHeaders };
  },
  {
    urls: ["https://howlongtobeat.com/*"]
  },
  ["blocking", "requestHeaders"]
);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getCustomReplaces') {
      return sendResponse({ success: customReplaces ? true : false, data: customReplaces });
  }
  else if (message.action === 'fetchHTML') {
      fetch(message.url)
        .then(response => response.text())
        .then(data => sendResponse({ success: true, data: data }))
        .catch(error => sendResponse({ success: false, error: error.toString() }));
      return true;
  }
  else if (message.action === 'searchHLTB') {
    if (!apiUserKey && !apiSearchKey) return;
    if (!fetchData) return;
    let fetchDataCopy = fetchData.replace("{SEARCH_TERMS}", JSON.stringify(message?.gameName?.split(' ')));

    if (apiUserKey)
      fetchDataCopy = fetchData.replace("{USER_ID}", apiUserKey);

    fetch(`https://howlongtobeat.com/api/${subPage}/${apiSearchKey ? `${apiSearchKey}` : ""}`, {
      method: 'POST',
      headers: {
        "Content-Type": "application/json",
        origin: "https://howlongtobeat.com/",
      },
      body: fetchDataCopy
    })
      .then(response => response.text())
      .then(data => sendResponse({ success: true, data: data }))
      .catch(error => sendResponse({ success: false, error: error.toString() }));
    return true;
  }
});