let customReplaces = null;
let subPage = "search"
const version = "1.10";

let token = null;
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

  if (appUrl) {
    console.log(`https://howlongtobeat.com${appUrl}`)
    await fetch(`https://howlongtobeat.com${appUrl}`)
      .then(response2 => response2.text())
      .then(script => {
        if (!script) return;
        const userKey = script.slice(script.indexOf('users:{id:"')).split('"')[1];
        if (userKey)
          apiUserKey = userKey;

        const index = script.indexOf('searchOptions:');
        const frag = script.slice(index - 2000, index).replace("init?t=", "");
        subPage = frag.slice(frag.indexOf(`/api/`) + 5, frag.length - 1);
        subPage = subPage.slice(0, subPage.indexOf('/'));
        console.log(subPage)
        const matches = [...frag.matchAll(/\.concat\(["']([^"']+)["']\)/g)];
        matches.forEach(el => {
          apiSearchKey = !apiSearchKey ? el[1] : apiSearchKey + el[1];
        });
      });
  }
}

getKey();
getFetchData();

chrome.webRequest.onBeforeSendHeaders.addListener(
  function (details) {
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
    (async () => {
      if (!fetchData) return sendResponse({ success: false });

      if (subPage)
        try {
          const initFetch = await fetch(`https://howlongtobeat.com/api/${subPage + `/init?t=${Date.now()}`}`);
          const initData = await initFetch.text();

          if (initData.startsWith("{")) {
            let tokenData = JSON.parse(initData);
            if (tokenData?.token) token = tokenData.token;
          }
        } catch (e) { }

      if (!token && !apiSearchKey)
        return sendResponse({ success: false });

      let fetchDataCopy = fetchData.replace("{SEARCH_TERMS}", JSON.stringify(message?.gameName?.split(' ')));

      if (apiUserKey)
        fetchDataCopy = fetchData.replace("{USER_ID}", apiUserKey);

      let headers = {
        "Content-Type": "application/json",
        origin: "https://howlongtobeat.com/",
      };

      if (token)
        headers["x-auth-token"] = token;

      try {
        console.log(`https://howlongtobeat.com/api/${subPage}/${apiSearchKey ? `${apiSearchKey}` : ""}`);
        const response = await fetch(`https://howlongtobeat.com/api/${subPage}/${apiSearchKey ? `${apiSearchKey}` : ""}`, {
          method: 'POST',
          headers: headers,
          body: fetchDataCopy
        });

        const text = await response.text();
        console.log("RESPONSE: " + text);
        sendResponse({ success: true, data: text });
      } catch (error) {
        sendResponse({ success: false, error: error.toString() });
      }
    })();

    return true;
  }
});