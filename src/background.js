// src/background.js (versão refatorada)

// --- Configuração do Firebase ---
const firebaseConfig = {
    apiKey: "AIzaSyB5wO0x-7NFmh6waMKzWzRew4ezfYOmYBI",
    authDomain: "site-ati-75d83.firebaseapp.com",
    databaseURL: "https://site-ati-75d83-default-rtdb.firebaseio.com/",
    projectId: "site-ati-75d83"
};
// --- Funções de Lógica do Firebase (Usando API REST) ---
async function fetchTemplatesFromFirebaseRest(username, dataType) {
  if (!username) {
    console.log(`ATI Extensão: Não é possível buscar '${dataType}' sem um atendente logado.`);
    return null;
  }
  const dbURL = firebaseConfig.databaseURL;
  const url = `${dbURL}${dataType}/${username}.json`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Erro de rede: ${response.statusText}`);
    return await response.json();
  } catch (error) {
    console.error(`ATI Extensão: Falha ao buscar dados para '${username}' em '${dataType}'.`, error);
    throw error;
  }
}

async function loadAndCacheTemplates() {
    const { atendenteAtual } = await chrome.storage.local.get('atendenteAtual');
    if (!atendenteAtual) {
        const { cachedOsTemplates } = await chrome.storage.local.get('cachedOsTemplates');
        return cachedOsTemplates || [];
    }
    console.log(`ATI Extensão: Carregando modelos para: ${atendenteAtual}`);
    try {
        const [quickRepliesData, osTemplatesData] = await Promise.all([
            fetchTemplatesFromFirebaseRest(atendenteAtual, 'respostas'),
            fetchTemplatesFromFirebaseRest(atendenteAtual, 'modelos_os')
        ]);
        const quickReplies = quickRepliesData ? Object.values(quickRepliesData) : [];
        const osTemplates = osTemplatesData ? Object.values(osTemplatesData) : [];
        const allTemplates = [
            ...quickReplies.map(t => ({ ...t, category: 'quick_reply' })),
            ...osTemplates
        ];
        const validTemplates = Array.isArray(allTemplates) ? allTemplates.filter(t => t && typeof t === 'object') : [];
        await chrome.storage.local.set({ cachedOsTemplates: validTemplates });
        console.log(`ATI Extensão: ${validTemplates.length} modelos de '${atendenteAtual}' carregados e salvos em cache.`);
        return validTemplates;
    } catch (error) {
        console.error("ATI Extensão: Falha crítica ao carregar do Firebase. Usando cache como fallback.", error);
        const { cachedOsTemplates } = await chrome.storage.local.get('cachedOsTemplates');
        return cachedOsTemplates || [];
    }
}

// --- Lógica do SGP ---
let isSearchRunning = false;
async function performLoginCheck(baseUrl) {
    try {
        const response = await fetch(`${baseUrl}/admin/`, {
            credentials: 'include',
            signal: AbortSignal.timeout(4000)
        });
        const isLoggedIn = !response.url.includes('/accounts/login');
        console.log(`ATI Extensão: [SGP Check] Verificação em ${baseUrl}. Logado: ${isLoggedIn}`);
        return { isLoggedIn, baseUrl };
    } catch (error) {
        console.error(`ATI Extensão: [SGP Check] Falha ao verificar ${baseUrl}.`, error.message);
        throw error;
    }
}

async function checkSgpStatus() {
    const dnsUrl = 'https://sgp.atiinternet.com.br';
    const ipUrl = 'http://201.158.20.35:8000';
    try {
        const dnsStatus = await performLoginCheck(dnsUrl);
        if (dnsStatus.isLoggedIn) return dnsStatus;
    } catch (e) {
        console.warn('ATI Extensão: [SGP Fallback] Conexão com DNS falhou. Tentando IP...');
    }
    try {
        const ipStatus = await performLoginCheck(ipUrl);
        if (ipStatus.isLoggedIn) return ipStatus;
    } catch (e) {
        console.error('ATI Extensão: [SGP Fallback] Conexão com IP também falhou.');
    }
    return { isLoggedIn: false, baseUrl: dnsUrl };
}

async function getSgpStatusWithCache() {
    const today = new Date().toISOString().slice(0, 10);
    const cache = await chrome.storage.local.get('sgp_status_cache');
    if (cache.sgp_status_cache && cache.sgp_status_cache.date === today && cache.sgp_status_cache.isLoggedIn) {
        try {
            const cachedStatus = await performLoginCheck(cache.sgp_status_cache.baseUrl);
            if (cachedStatus.isLoggedIn) return cachedStatus;
        } catch (e) {
            console.warn('ATI Extensão: [SGP Cache] A verificação do cache falhou. Realizando verificação completa.');
        }
    }
    const currentStatus = await checkSgpStatus();
    if (currentStatus.isLoggedIn) {
        await chrome.storage.local.set({ sgp_status_cache: { ...currentStatus, date: today } });
    } else {
        await chrome.storage.local.remove('sgp_status_cache');
    }
    return currentStatus;
}

// =======================================================================
// == FUNÇÃO ATUALIZADA PARA GERENCIAR ABAS POR TÍTULO DA PÁGINA ==
// =======================================================================
async function openOrFocusSgpTab(url, titleQuery = null, forceUpdate = false) {
    const sgpPatterns = [
        "https://sgp.atiinternet.com.br/*",
        "http://201.158.20.35:8000/*"
    ];
    let tabs = [];
    if (titleQuery) {
        tabs = await chrome.tabs.query({ 
            url: sgpPatterns,
            title: `*${titleQuery}*`
        });
    } else {
        tabs = await chrome.tabs.query({ url: sgpPatterns });
    }

    if (tabs.length > 0 && titleQuery) {
        const matchingTab = tabs.find(tab => tab.title.includes(titleQuery));
        if (matchingTab) {
            if (forceUpdate) {
                console.log(`ATI Extensão: [SGP] Atualizando aba do cliente "${titleQuery}" para URL: ${url}`);
                await chrome.tabs.update(matchingTab.id, { url, active: true });
                await chrome.windows.update(matchingTab.windowId, { focused: true });
                return matchingTab;
            } else {
                console.log(`ATI Extensão: [SGP] Aba do cliente "${titleQuery}" já aberta (URL: ${matchingTab.url}). Apenas focando.`);
                await chrome.windows.update(matchingTab.windowId, { focused: true });
                await chrome.tabs.update(matchingTab.id, { active: true });
                return matchingTab;
            }
        }
    }
    console.log(`ATI Extensão: [SGP] Nenhuma aba encontrada para "${titleQuery || 'página geral'}". Criando nova aba com URL: ${url}`);
    return await chrome.tabs.create({ url });
}

// NOVO: Função centralizada para buscar o cliente no SGP
async function findClientInSgp(baseUrl, { cpfCnpj, fullName, phoneNumber }) {
    const executeSearch = async (url) => {
        try {
            const response = await fetch(url, { credentials: 'include' });
            const data = await response.json();
            return (data && data.length > 0) ? data[0] : null;
        } catch (error) {
            console.error("ATI Extensão: [SGP] Erro na requisição para a API:", error);
            return null;
        }
    };

    let client = null;
    if (cpfCnpj) client = await executeSearch(`${baseUrl}/public/autocomplete/ClienteAutocomplete?tconsulta=cpfcnpj&term=${cpfCnpj}`);
    if (!client && fullName) client = await executeSearch(`${baseUrl}/public/autocomplete/ClienteAutocomplete?tconsulta=nome&term=${encodeURIComponent(fullName)}`);
    if (!client && phoneNumber) {
        const cleanPhone = phoneNumber.replace(/\D/g, '').substring(2);
        client = await executeSearch(`${baseUrl}/public/autocomplete/ClienteAutocomplete?tconsulta=telefone&term=${cleanPhone}`);
    }
    return client;
}

// MODIFICADO: Função de busca simplificada
async function searchClientInSgp() {
    if (isSearchRunning) return;
    isSearchRunning = true;
    try {
        const { isLoggedIn, baseUrl } = await getSgpStatusWithCache();
        if (!isLoggedIn) {
            const loginUrl = `${baseUrl}/accounts/login/?next=/admin/`;
            await openOrFocusSgpTab(loginUrl);
            return;
        }

        const clientData = await chrome.storage.local.get(["cpfCnpj", "fullName", "phoneNumber"]);
        const client = await findClientInSgp(baseUrl, clientData); // <-- USA A FUNÇÃO CENTRALIZADA

        if (client) {
            const titleQuery = `${client.label.split(' - ')[0].trim()} (${client.id})`;
            const clientPageUrl = `${baseUrl}/admin/cliente/${client.id}/contratos`;
            await openOrFocusSgpTab(clientPageUrl, titleQuery);
        } else {
            await openOrFocusSgpTab(`${baseUrl}/admin/`);
        }
    } finally {
        isSearchRunning = false;
    }
}

// MODIFICADO: Função de criação de ocorrência simplificada
async function createOccurrenceInSgp() {
    if (isSearchRunning) return;
    isSearchRunning = true;
    try {
        const { isLoggedIn, baseUrl } = await getSgpStatusWithCache();
        if (!isLoggedIn) {
            const loginUrl = `${baseUrl}/accounts/login/?next=/admin/`;
            await openOrFocusSgpTab(loginUrl);
            return;
        }

        const { osText, ...clientData } = await chrome.storage.local.get(["cpfCnpj", "fullName", "phoneNumber", "osText"]);
        const client = await findClientInSgp(baseUrl, clientData); // <-- USA A FUNÇÃO CENTRALIZADA

        if (client) {
            const titleQuery = `${client.label.split(' - ')[0].trim()} (${client.id})`;
            const occurrencePageUrl = `${baseUrl}/admin/atendimento/cliente/${client.id}/ocorrencia/add/`;
            await chrome.storage.local.set({ pendingOsText: osText });
            const sgpTab = await openOrFocusSgpTab(occurrencePageUrl, titleQuery, true);
            
            chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
                if (tabId === sgpTab.id && changeInfo.status === 'complete') {
                    chrome.tabs.sendMessage(sgpTab.id, { action: "fillSgpForm", osText: osText }, (response) => {
                        if (chrome.runtime.lastError) {
                            console.log("ATI Extensão: Aba do SGP é nova, o preenchimento ocorrerá ao carregar.");
                        } else {
                            console.log("ATI Extensão: Aba do SGP já estava aberta, preenchimento enviado por mensagem.");
                        }
                    });
                    chrome.tabs.onUpdated.removeListener(listener);
                }
            });
            return sgpTab;
        } else {
            await openOrFocusSgpTab(`${baseUrl}/admin/`);
        }
    } finally {
        isSearchRunning = false;
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("ATI Extensão: Mensagem recebida no background:", request);
    switch (request.action) {
        case "getTemplates":
            loadAndCacheTemplates().then(sendResponse);
            return true;
        case "userChanged":
        case "templatesUpdated":
            loadAndCacheTemplates().then(() => {
                chrome.tabs.query({ url: "*://*.chatmix.com.br/*" }, (tabs) => {
                    tabs.forEach(tab => chrome.tabs.sendMessage(tab.id, { action: "reloadTemplates" }).catch(() => { }));
                });
            });
            break;
        case "themeUpdated":
            chrome.tabs.query({ url: "*://*.chatmix.com.br/*" }, (tabs) => {
                tabs.forEach(tab => chrome.tabs.sendMessage(tab.id, { action: "applyTheme" }).catch(() => { }));
            });
            break;
        case "createOccurrenceInSgp":
            createOccurrenceInSgp();
            break;
        case "openInSgp":
            searchClientInSgp();
            break;
    }
    return true;
});

chrome.action.onClicked.addListener((tab) => {
    const panelUrl = "https://vituali.github.io/ATI/";
    chrome.tabs.query({ url: panelUrl }, (tabs) => {
        if (tabs.length > 0) {
            chrome.tabs.highlight({ windowId: tabs[0].windowId, tabs: tabs[0].index });
            chrome.windows.update(tabs[0].windowId, { focused: true });
        } else {
            chrome.tabs.create({ url: panelUrl });
        }
    });
});

chrome.commands.onCommand.addListener(async (command) => {
    if (command === "copy-data") {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab) {
                chrome.tabs.sendMessage(tab.id, { action: "executeCopy" });
            }
        } catch (e) {
            console.log("ATI Extensão: Atalho pressionado em aba não compatível.");
        }
    }
});
const INJECTION_RULES = {
    CHATMIX: {
        matches: ["https://www.chatmix.com.br/v2/chat*"],
        js: ["scripts/chatmix.js"],
        css: ["css/common.css", "css/chatmix.css"],
    },
    SGP: {
        matches: ["https://sgp.atiinternet.com.br/admin/atendimento/cliente/*/ocorrencia/add/"],
        js: ["scripts/sgp.js"],
        css: ["css/common.css"],
    },
    BRIDGE: {
        matches: ["https://vituali.github.io/ATI/"],
        js: ["bridge-listener.js"],
        css: [],
    }
};
async function injectFiles(tabId, rule) {
    try {
        if (rule.css && rule.css.length > 0) {
            await chrome.scripting.insertCSS({ target: { tabId }, files: rule.css });
        }
        if (rule.js && rule.js.length > 0) {
            await chrome.scripting.executeScript({ target: { tabId }, files: rule.js });
        }
    } catch (err) {
        console.error(`ATI Extensão: Falha ao injetar script em ${tabId} (${err.message})`);
    }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        for (const key in INJECTION_RULES) {
            const rule = INJECTION_RULES[key];
            const urlMatches = rule.matches.some(pattern => {
                const regexPattern = pattern.replace(/\*/g, '.*');
                return new RegExp(regexPattern).test(tab.url);
            });
            if (urlMatches) {
                console.log(`ATI Extensão: Injetando script '${key}' na aba ${tabId}`);
                injectFiles(tabId, rule);
            }
        }
    }
});
