let customReplaces = null;
const version = "1.2";
let apiUserKey = null;

fetch('https://raw.githubusercontent.com/Juzlus/HowLongToBeat-on-Steam/refs/heads/main/server.json')
  .then(response => response.json())
  .then(data => {
    if (!data) return;
    if (data?.version != version)
      chrome.notifications.create({
        title: 'HowLongToBeat on Steam',
        message: 'A new version of the extension is available. Click here to check it out!',
        iconUrl: 'https://raw.githubusercontent.com/Juzlus/HowLongToBeat-on-Steam/refs/heads/main/icons/2048.png',
        type: 'basic'
      });
    customReplaces = data?.custom_replaces;
  });

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
        const apiKey = script.slice(script.indexOf('users:{id:"')).split('"')[1];
        if (!apiKey) return;
        apiUserKey = apiKey;
      }); 
}
getKey();
  
chrome.notifications.onClicked.addListener(() => {
  chrome.tabs.create({ url: 'https://github.com/Juzlus/HowLongToBeat-on-Steam/releases/latest/' });
});

chrome.runtime.onInstalled.addListener(async () => {
  const rules = [{
    id: 1,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [{
        header: 'Referer',
        operation: 'set',
        value: 'https://howlongtobeat.com/',
      }],
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
    if (!apiUserKey) return;
    fetch(`https://howlongtobeat.com/api/search`, {
      method: 'POST',
      headers: {
        "Content-Type": "application/json",
        origin: "https://howlongtobeat.com/",
      },
      body: JSON.stringify ({
        searchType: "games",
        searchTerms: message?.gameName?.split(' '),
        searchPage: 1,
        size: 20,
        searchOptions: {
          games: {
            userId: 0,
            platform: "PC",
            sortCategory: "name",
            rangeCategory: "main",
            rangeTime: {
              min: null,
              max:null
            },
            gameplay: {
              perspective: "",
              flow: "",
              genre: ""
            },
            rangeYear: {
              min: "",
              max: ""
            },
            modifier: ""
          },
          users: {
            id: apiUserKey,
            sortCategory: "postcount"
          },
          lists: {
            sortCategory: "follows"
          },
          filter: "",
          sort: 0,
          randomizer: 0
        },
        useCache: true
      })
    })
      .then(response => response.text())
      .then(data => sendResponse({ success: true, data: data }))
      .catch(error => sendResponse({ success: false, error: error.toString() }));
    return true;
  }
});