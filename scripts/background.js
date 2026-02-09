let customReplaces = null;
let HLTBSelector = null;
let subPage = null;
let token = null;
let apiUserKey = null;
let apiSearchKey = null;
let fetchData = null;

const version = "1.12";
const firefox = false;

async function initConfig() {
  try {
    const response = await fetch('https://raw.githubusercontent.com/Juzlus/HowLongToBeat-on-Steam/refs/heads/main/server.json');
    const data = await response.json();
    if (!data) return;
    
    if (data.version != version)
        chrome.notifications.create('updateNotification', {
          title: 'HowLongToBeat on Steam',
          message: 'New version available. Click the button below!',
          priority: 1,
          iconUrl: 'https://raw.githubusercontent.com/Juzlus/HowLongToBeat-on-Steam/refs/heads/main/icons/2048.png',
          type: 'basic',
          buttons: [{ title: 'See Release' }, { title: 'Download' }]
        });

    customReplaces = data?.custom_replaces;
    HLTBSelector = data?.hltb_selector;
    subPage = data?.subPage;

  } catch (e) { printLog(`Config error: ${e}`, true); }
}

chrome.notifications.onButtonClicked.addListener((notifId, btnIdx) => {
  if (notifId !== 'updateNotification') return;
  const baseUrl = 'https://github.com/Juzlus/HowLongToBeat-on-Steam/releases/latest/';
  const url = btnIdx === 0 ? baseUrl : `${baseUrl}download/HowLongToBeat_on_Steam_v${data?.version}${firefox ? '_FireFox' : ''}.zip`
  chrome.tabs.create({ url });
});

async function getFetchData() {
  try {
    const response = await fetch('https://raw.githubusercontent.com/Juzlus/HowLongToBeat-on-Steam/refs/heads/main/fetchData.txt');
    fetchData = await response.text();
  } catch (e) { printLog(`FetchData error: ${e}`, true); }
}

async function getKey() {
  try {
    const response = await fetch('https://howlongtobeat.com');
    const html = await response.text();
    
    const scriptRegex = /src="(\/_next\/static\/chunks\/[^"]+\.js)"/g;
    let scripts = [];
    let match;
    while ((match = scriptRegex.exec(html)) !== null)
      scripts.push(match[1])

    scripts.sort((a, b) => {
      const priority = (s) => s.includes('_app') ? 2 : (s.includes('pages') ? 1 : 0);
      return priority(b) - priority(a);
    });
    
    for (const appUrl of scripts)
    {
      const scriptRes = await fetch(`https://howlongtobeat.com${appUrl}`)
      const script = await scriptRes.text();
      printLog(`AppUrl: https://howlongtobeat.com${appUrl}`)

      if (!script.includes('searchOptions:')) continue;

      const userKeyMatch = script.match(/users:{id:"([^"]+)"/);
      if (userKeyMatch) apiUserKey = userKeyMatch[1];
      printLog(`UserKey: ${apiUserKey}`)

      const searchIndex = script.indexOf('searchOptions:')
      const fragment = script.slice(searchIndex - 2000, searchIndex);

      const subPageMatch = fragment.match(/\/api\/([^/"]+)\//);
      if (subPageMatch) subPage = subPageMatch[1];
      printLog(`SubPage: ${subPage}`)

      const keyMatches = [...fragment.matchAll(/\.concat\(["']([^"']+)["']\)/g)];
      if (keyMatches.length > 0)
        apiSearchKey = keyMatches.map(m => m[1]).join('');
      printLog(`SearchKey: ${apiSearchKey}`)

      return true;
  }
  } catch (e) { printLog(`Key error: ${e}`, true); }
}

chrome.runtime.onInstalled.addListener(async () => {
  const rules = [{
    id: 1,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [{ header: 'Referer', operation: 'set', value: 'https://howlongtobeat.com/' }],
    },
    condition: {
      domains: [chrome.runtime.id],
      urlFilter: 'https://howlongtobeat.com/',
      resourceTypes: ['xmlhttprequest'],
    },
  }];
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: rules.map(r => r.id),
    addRules: rules,
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getCustomReplaces')
    return sendResponse({ success: !!customReplaces, data: customReplaces });
  else if (message.action === 'getHLTBSelector')
    return sendResponse({ success: !!HLTBSelector, data: HLTBSelector });
  else if (message.action === 'fetchHTML') {
    fetch(message.url)
      .then(response => response.text())
      .then(data => sendResponse({ success: true, data: data }))
      .catch(error => sendResponse({ success: false, error: error.toString() }));
    return true;
  } else if (message.action === 'searchHLTB') {
    (async () => {
      if (!fetchData) await getFetchData();
      if (!apiSearchKey) await getKey();

      try {
        const init = await fetch(`https://howlongtobeat.com/api/${subPage}/init?t=${Date.now()}`).then(response => response.json());
        token = init?.token || token;

        let payload = fetchData.replace("{SEARCH_TERMS}", JSON.stringify(message.gameName.split(' ')));
        if (apiUserKey) payload = payload.replace("{USER_ID}", apiUserKey);

        const response = await fetch(`https://howlongtobeat.com/api/${subPage}/${apiSearchKey || ""}`, {
          method: 'POST',
          headers: {
            "Content-Type": "application/json",
            origin: "https://howlongtobeat.com/",
            "x-auth-token": token || ""
          },
          body: payload
        });

        const text = await response.text();
        printLog(`https://howlongtobeat.com/api/${subPage}/${apiSearchKey || ""}` + ": " + text);
        sendResponse({ success: true, data: text });
      } catch (e) { sendResponse({ success: false, error: e.toString() }); }
    })();
    return true;
  }
});

function printLog(message, isError = false) {
    const tag = "[HowLongToBeat on Steam]";
    const tagStyle = "color: #ff7708; font-weight: bold;";
    const msgStyle = isError ? "color: #c22525" : "color: #9d53ff;";
    console.log(`%c${tag} %c${message}`, tagStyle, msgStyle);
}

initConfig();
getFetchData();
getKey();