async function getCustomReplaces()
{
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'getCustomReplaces' }, response => {
            resolve(response?.success ? response.data : null);
        });
    });
}

async function fetchHTML(url)
{
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'fetchHTML', url: url }, response => {
            resolve(response?.success ? response.data : null);
        });
    });
}

async function searchHLTB(name)
{
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'searchHLTB', gameName: name }, response => {
            resolve(response?.success ? response.data : null);
        });
    });
}

async function getPage(url)
{
    const response = await fetchHTML(url);
    if (!response) return;
    const parser = new DOMParser();
    const doc = parser.parseFromString(response, 'text/html');
    return doc;
}

async function getHLTBData(gameId)
{
    const doc = await getPage(`https://howlongtobeat.com/game/${gameId}`);
    if (!doc) return;
    let scores = [];
    doc?.querySelectorAll("li[class*=GameStats_short__], li[class*=GameStats_long__], li[class*=GameStats_full__]")?.forEach((el, i) => {
        if (el?.querySelector('h4')?.innerText == "All Styles")
            return;
        scores[i] = {name: el?.querySelector('h4')?.innerText, value: el?.querySelector('h5')?.innerText, timeColor: el?.classList[1]};
    });
    return scores;
}

function hasYear(name)
{
    const splited = name?.split(/[(||)]/);
    if (splited?.length >= 1)
        if (!isNaN(parseInt(splited[1])))
            return [splited[0], splited[1]];
    return [name, null]
}

async function searchByName(name)
{
    let [gameName, year] = hasYear(name);
    gameName = gameName.replace(/[^a-zA-Z0-9 _']/g, '').replace('Game of the Year Edition', 'GOTY');

    const customReplaces = await getCustomReplaces();
    if (customReplaces)
        customReplaces?.forEach(el => {
            const reg = el?.split('#');
            gameName = gameName?.replace(reg[0], reg[1]);
        });

    const response = await searchHLTB(gameName);
    if (!response) return;
    const json = JSON.parse(response);
    if (!json || !json?.data?.length) return;
    return year ? json?.data?.filter(el => el?.release_world == year)[0] : json?.data[0];
}

async function getUntranslatedTitle(steamId)
{
    const doc = await getPage(`https://steamdb.info/api/RenderAppHover/?appid=${steamId}`);
    if (!doc) return;
    const title = doc?.querySelector('a.hover_title')?.innerText;
    return title;
} 

async function createDiv() 
{
    const name = document.querySelector('.apphub_AppName')?.innerText;
    const steamId = document.querySelector('[data-miniprofile-appid]')?.getAttribute('data-miniprofile-appid');
    if (!name || !steamId) return;

    const gameData = await searchByName(name) || await searchByName(name?.replace(/\.([^\s]|$)/g, '. $1')) || await searchByName(await getUntranslatedTitle(steamId));
    if (!gameData) return;

    const scores = await getHLTBData(gameData?.game_id);
    if (!scores || !scores?.length) return;

    let innerDiv = '';
    const div = document.createElement("a");
    div.setAttribute('id', 'howlongtobeat_block');
    div.setAttribute('title', `HowLongToBeat - ${gameData?.game_name}`)
    div.setAttribute('href', `https://howlongtobeat.com/game/${gameData?.game_id}`);
    if (scores?.length == 1)
        div.className = `large`;
    div.style = `--cover-img: url('https://howlongtobeat.com/games/${gameData?.game_image}')`;
    scores?.forEach(el => {
        innerDiv += `<div style="width: ${100/scores?.length}%" class="${el?.timeColor}"><h4>${el?.name}</h4><h5>${el?.value}</h5></div>`;
    });
    div.innerHTML = innerDiv;
    
    const steamdb = document.querySelector(".page_content .rightcol.game_meta_data .steamdb_stats");
    if (steamdb)
        steamdb.after(div);
    else
        document.querySelector(".page_content .rightcol.game_meta_data").prepend(div);
}

createDiv();