async function callBackground(action, params = {}) {
    return new Promise(resolve => {
        chrome.runtime.sendMessage({ action, ...params }, response => {
            resolve(response?.success ? response.data : null);
        });
    });
}

async function getPage(url) {
    const html = await callBackground('fetchHTML', { url });
    if (!html) return null;
    return new DOMParser().parseFromString(html, 'text/html');
}

async function getUntranslatedTitle(steamId) {
    const url = `https://store.steampowered.com/api/appdetails?appids=${steamId}&l=english`;
    const response = await callBackground('fetchHTML', { url });
    if (!response) return null;
    
    try {
        const json = JSON.parse(response);
        if (json[steamId]?.success)
            return json[steamId]?.data?.name;
    } catch (e) { printLog(`Steam API Error: ${e}`, true); }
    
    return null;
}

function parseTitleAndYear(name) {
    const match = name?.match(/(.*?)\s*[\(\[|](\d{4})[\)\]|]/);
    if (match) return { title: match[0], year: match[1] };
    return { title: name, year: null };
}

async function searchByName(name, year = null) {
    if (!name) return null;
    let gameName = name.replace(/[^a-zA-Z0-9 -_']/g, '').trim();

    const customReplaces = await callBackground('getCustomReplaces');
    if (customReplaces)
        customReplaces.forEach(rule => {
            const parts = rule.split('#');
            if (parts.length == 2)
                gameName = gameName.replace(new RegExp(parts[0], 'g'), parts[1]);
        });

    renderUI(gameName);
    const response = await callBackground('searchHLTB', { gameName: gameName });

    if (!response) return null;
    const json = JSON.parse(response);
    if (!json?.data || !json?.data?.length === 0) return null;
    
    if (year) {
        const matchedByYear = json.data.find(el => el?.release_world == year);
        if (matchedByYear) return matchedByYear;
    }

    return json.data[0];
}

async function renderUI(gameName) {
    const existing = document.getElementById("howlongtobeat_block");
    if (existing) existing.remove();

    const target = await waitForElm(".page_content .rightcol.game_meta_data");
    if (!target) return null;

    const gameCover = document.querySelector('img.game_header_image_full');

    const container = document.createElement("a");
    container.id = "howlongtobeat_block";
    container.title = `HowLongToBeat - ${gameName}`;
    container.href = `https://howlongtobeat.com/?q=${gameName}`;
    container.className = `large`;
    if (gameCover) container.style = `--cover-img: url('${gameCover?.src}')`;

    const item = document.createElement('div');
    item.style.width = "100%";
    item.className = "time_00";
    item.innerHTML = `<h4>HowLongToBeat on Steam</h4><h5 class="howlongtobeat_searching"><b>Searching:</b> "${gameName}"</h5>`;
    container.appendChild(item);

    const steamdb = target.querySelector(".steamdb_stats");
    if (steamdb) steamdb.after(container);
    else target.prepend(container);
}

async function updateUI(gameData, scores) {
    const existing = document.getElementById("howlongtobeat_block");
    if (existing) existing.remove();

    const target = await waitForElm(".page_content .rightcol.game_meta_data");
    if (!target) return null;

    const gameCover = document.querySelector('img.game_header_image_full');

    const container = document.createElement("a");
    container.id = "howlongtobeat_block";
    container.title = `HowLongToBeat - ${gameData?.game_name}`;
    container.href = `https://howlongtobeat.com/game/${gameData?.game_id}`;
    container.style = `--cover-img: url('${(gameCover ? gameCover?.src : `https://howlongtobeat.com/games/${gameData?.game_image}`)}')`;
    if (scores.length == 1) container.className = `large`;

    scores.forEach(s => {
        const item = document.createElement('div');
        item.style.width = `${100 / scores?.length}%`;
        item.className = s.timeColor;
        item.innerHTML = `<h4>${s.name}</h4><h5>${s.value}</h5>`;
        container.appendChild(item);
    });

    const steamdb = target.querySelector(".steamdb_stats");
    if (steamdb) steamdb.after(container);
    else target.prepend(container);
}

const waitForElm = async (selector) => {
    return new Promise(resolve => {
        if (document.querySelector(selector)) {
            return resolve(document.querySelector(selector));
        };
        const observer = new MutationObserver(() => {
            if (document.querySelector(selector)) {
                resolve(document.querySelector(selector));
                observer.disconnect();
            }
        });
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    });
};

async function createGameDiv() {
    const nameEl = await waitForElm('.apphub_AppName');
    const steamIdEl = await waitForElm('[data-miniprofile-appid]');
    
    if (!nameEl || !steamIdEl) return;

    const originalName = nameEl.innerText;
    const steamId = steamIdEl.getAttribute('data-miniprofile-appid');
    const { title, year } = parseTitleAndYear(originalName);

    printLog(`Searching: "${title}${year ? ` (${year})` : ''}"`);
    let gameData = await searchByName(title, year);
    
    if (!gameData) {
        const dottedName = title.replace(/\.([^\s]|$)/g, '. $1');
        printLog(`Searching alt.: "${dottedName}${year ? ` (${year})` : ''}"`);
        gameData = await searchByName(dottedName, year);
    }
    
    if (!gameData) {
        printLog("Trying to get an English title from Steam API...");
        const englishTitle = await getUntranslatedTitle(steamId);
        if (englishTitle)
            gameData = await searchByName(englishTitle, year);
    }

    if (!gameData) {
        document.querySelector('.howlongtobeat_searching').innerText = "Not Found!"
        printLog(`No data found for: "${originalName}"`);
        return;
    }

    printLog(`Fetching HLTB info for: "${gameData.game_name}" (ID: ${gameData.game_id})`);

    const scores = await getHLTBData(gameData.game_id);
    if (!scores) return;
    
    printLog("HLTB info fetched successfully.");
    updateUI(gameData, scores);
}

async function getHLTBData(gameId) {
    const url = `https://howlongtobeat.com/game/${gameId}`;
    const doc = await getPage(url);
    if (!doc) return null;

    const selector = await callBackground('getHLTBSelector') || 'div[class*="GameStats_game_times"] li';
    const scores = [];

    doc.querySelectorAll(selector).forEach(el => {
        const title = el.querySelector('h4')?.innerText;
        const time = el.querySelector('h5')?.innerText;
        
        if (title && title != "All Styles")
            scores.push({ name: title, value: time, timeColor: el.classList[1] || '' });
    });
    
    return scores;
}

function printLog(message, isError = false) {
    const tag = "[HowLongToBeat on Steam]";
    const tagStyle = "color: #ff7708; font-weight: bold;";
    const msgStyle = isError ? "color: #c22525" : "color: #9d53ff;";
    console.log(`%c${tag} %c${message}`, tagStyle, msgStyle);
}

createGameDiv();