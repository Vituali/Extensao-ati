// Importa a configuração de um local centralizado.
import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set } from "firebase/database";

// --- INICIALIZAÇÃO DO FIREBASE ---
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// --- Lógica de Cache Temporário ---
const sgpCache = new Map();

/**
 * Salva a lista de tipos de ocorrência no Firebase para o painel usar.
 * @param {Array} types - A lista de tipos extraída do SGP.
 */
async function saveOccurrenceTypesToFirebase(types) {
    if (!types || types.length === 0) return;
    try {
        const dbRef = ref(db, 'sgp_cache/occurrenceTypes');
        await set(dbRef, types);
        console.log('ATI Extensão: Tipos de ocorrência do SGP foram sincronizados com o Firebase.');
    } catch (error) {
        console.error('ATI Extensão: Falha ao salvar tipos de ocorrência no Firebase.', error);
    }
}

// --- FUNÇÕES DE BUSCA DE DADOS ---

async function fetchFromFirebaseRest(path) {
  if (!path) return null;
  const dbURL = firebaseConfig.databaseURL;
  const url = `${dbURL}${path}.json`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Erro de rede: ${response.statusText}`);
    return await response.json();
  } catch (error) {
    console.error(`ATI Extensão: Falha ao buscar dados em '${path}'.`, error);
    throw error;
  }
}

async function loadAndCacheAtendentes() {
    try {
        const atendentes = await fetchFromFirebaseRest('atendentes');
        if (atendentes) {
            await chrome.storage.local.set({ cachedAtendentes: atendentes });
            console.log("ATI Extensão: Dados dos atendentes carregados e salvos em cache.");
            return atendentes;
        }
        return null;
    } catch (error) {
        console.error("ATI Extensão: Falha crítica ao carregar dados dos atendentes.", error);
        return null;
    }
}

async function loadAndCacheTemplates() {
    const { atendenteAtual } = await chrome.storage.local.get('atendenteAtual');
    if (!atendenteAtual) {
        await chrome.storage.local.remove('cachedOsTemplates');
        return [];
    }
    try {
        const [quickRepliesData, osTemplatesData] = await Promise.all([
            fetchFromFirebaseRest(`respostas/${atendenteAtual}`),
            fetchFromFirebaseRest(`modelos_os/${atendenteAtual}`)
        ]);
        const quickReplies = quickRepliesData ? Object.values(quickRepliesData) : [];
        const osTemplates = osTemplatesData ? Object.values(osTemplatesData) : [];
        const allTemplates = [
            ...quickReplies.map(t => ({ ...t, type: 'quick_reply' })),
            ...osTemplates.map(t => ({ ...t, type: 'os_template' }))
        ];
        const validTemplates = Array.isArray(allTemplates) ? allTemplates.filter(t => t && typeof t === 'object') : [];
        await chrome.storage.local.set({ cachedOsTemplates: validTemplates });
        return validTemplates;
    } catch (error) {
        console.error("ATI Extensão: Falha ao carregar do Firebase. Usando cache.", error);
        const { cachedOsTemplates } = await chrome.storage.local.get('cachedOsTemplates');
        return cachedOsTemplates || [];
    }
}

// --- LÓGICA DE INTERAÇÃO COM O SGP ---
let isSearchRunning = false;

async function performLoginCheck(baseUrl) {
    try {
        const response = await fetch(`${baseUrl}/admin/`, { credentials: 'include', signal: AbortSignal.timeout(4000) });
        return { isLoggedIn: !response.url.includes('/accounts/login'), baseUrl };
    } catch (error) {
        console.error(`ATI Extensão: Falha ao verificar login em ${baseUrl}.`, error.message);
        throw error;
    }
}

async function checkSgpStatus() {
    const dnsUrl = 'https://sgp.atiinternet.com.br';
    const ipUrl = 'http://201.158.20.35:8000';
    try {
        const dnsStatus = await performLoginCheck(dnsUrl);
        if (dnsStatus.isLoggedIn) return dnsStatus;
    } catch (e) { /* Fallback */ }
    try {
        const ipStatus = await performLoginCheck(ipUrl);
        if (ipStatus.isLoggedIn) return ipStatus;
    } catch (e) { /* Final failure */ }
    return { isLoggedIn: false, baseUrl: dnsUrl };
}

async function getSgpStatusWithCache() {
    const today = new Date().toISOString().slice(0, 10);
    const cache = await chrome.storage.local.get('sgp_status_cache');
    if (cache.sgp_status_cache && cache.sgp_status_cache.date === today && cache.sgp_status_cache.isLoggedIn) {
        try {
            const cachedStatus = await performLoginCheck(cache.sgp_status_cache.baseUrl);
            if (cachedStatus.isLoggedIn) return cachedStatus;
        } catch (e) { /* Cache invalid */ }
    }
    const currentStatus = await checkSgpStatus();
    await chrome.storage.local.set({ sgp_status_cache: { ...currentStatus, date: today } });
    return currentStatus;
}

async function findClientInSgp(baseUrl, { cpfCnpj, fullName, phoneNumber }) {
    const executeSearch = async (url) => {
        try {
            const response = await fetch(url, { credentials: 'include' });
            const data = await response.json();
            return (data && data.length > 0) ? data[0] : null;
        } catch (error) { return null; }
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

async function getSgpDataForClient(baseUrl, client, cacheKey) {
    const cachedData = sgpCache.get(cacheKey);
    if (cachedData) {
        console.log(`ATI Extensão: Usando dados do SGP do cache para: ${cacheKey}.`);
        return cachedData;
    }

    console.log(`ATI Extensão: Buscando novos dados do SGP para: ${cacheKey}.`);
    const url = `${baseUrl}/admin/atendimento/cliente/${client.id}/ocorrencia/add/`;
    try {
        const response = await fetch(url, { credentials: 'include' });
        const htmlText = await response.text();

        if (htmlText.includes('id_username') && htmlText.includes('id_password')) {
            await chrome.storage.local.remove('sgp_status_cache');
            throw new Error("Sua sessão no SGP expirou. Faça o login novamente.");
        }
        
        const extractOptions = (selectIdRegex) => {
            const match = htmlText.match(selectIdRegex);
            const options = [];
            if (match && match[1]) {
                const optionRegex = /<option[^>]+value=['"](\d+)['"][^>]*>([\s\S]*?)<\/option>/g;
                let optMatch;
                while ((optMatch = optionRegex.exec(match[1])) !== null) {
                    if (optMatch[1]) {
                        options.push({ id: optMatch[1], text: optMatch[2].trim().replace(/&nbsp;/g, ' ') });
                    }
                }
            }
            return options;
        };

        const initialContracts = extractOptions(/<select[^>]+id=['"]id_clientecontrato['"][^>]*>([\s\S]*?)<\/select>/);
        const responsibleUsers = extractOptions(/<select[^>]+id=['"]id_responsavel['"][^>]*>([\s\S]*?)<\/select>/).map(u => ({ id: u.id, username: u.text.toLowerCase() }));
        const occurrenceTypes = extractOptions(/<select[^>]+id=['"]id_tipo['"][^>]*>([\s\S]*?)<\/select>/);

        await saveOccurrenceTypesToFirebase(occurrenceTypes);

        const contractDetailPromises = initialContracts.map(async (contract) => {
            try {
                const servicesResponse = await fetch(`${baseUrl}/admin/clientecontrato/servico/list/ajax/?contrato_id=${contract.id}`, { credentials: 'include' });
                const services = await servicesResponse.json();
                if (services && services.length > 0 && services[0].id) {
                    const detailsResponse = await fetch(`${baseUrl}/admin/atendimento/ocorrencia/servico/detalhe/ajax/?servico_id=${services[0].id}&contrato_id=${contract.id}`, { credentials: 'include' });
                    const details = await detailsResponse.json();
                    if (details && details.length > 0 && details[0]?.end_instalacao) {
                        return { ...contract, text: `${contract.text} - Endereço: ${details[0].end_instalacao}` };
                    }
                }
            } catch (e) {
                console.warn(`ATI Extensão: Não foi possível buscar o endereço para o contrato ${contract.id}.`, e);
            }
            return contract;
        });

        const contracts = await Promise.all(contractDetailPromises);
        const sgpData = { clientSgpId: client.id, contracts, responsibleUsers, occurrenceTypes };
        
        sgpCache.set(cacheKey, sgpData);
        return sgpData;

    } catch (error) {
        console.error(`ATI Extensão: Falha ao buscar dados do SGP para o cliente ${client.id}.`, error);
        throw error;
    }
}

async function searchClientInSgp(tabId) {
    if (isSearchRunning) return;
    isSearchRunning = true;
    let success = false;
    try {
        const { isLoggedIn, baseUrl } = await getSgpStatusWithCache();
        if (!isLoggedIn) {
            const loginUrl = `${baseUrl}/accounts/login/`;
            const existingLoginTabs = await chrome.tabs.query({ url: `${loginUrl}*` });
            if (existingLoginTabs.length > 0) {
                await chrome.tabs.update(existingLoginTabs[0].id, { active: true });
                await chrome.windows.update(existingLoginTabs[0].windowId, { focused: true });
            } else {
                await chrome.tabs.create({ url: loginUrl });
            }
            return;
        }
        const clientData = await chrome.storage.local.get(["cpfCnpj", "fullName", "phoneNumber"]);
        const client = await findClientInSgp(baseUrl, clientData);
        if (client && client.id) {
            const titlePattern = `*SGP*(${client.id})*`;
            const existingClientTabs = await chrome.tabs.query({ title: titlePattern });
            if (existingClientTabs.length > 0) {
                const tab = existingClientTabs[0];
                await chrome.tabs.update(tab.id, { active: true });
                await chrome.windows.update(tab.windowId, { focused: true });
            } else {
                const targetUrl = `${baseUrl}/admin/cliente/${client.id}/contratos`;
                await chrome.tabs.create({ url: targetUrl });
            }
        } else {
            const adminUrl = `${baseUrl}/admin/`;
            const existingAdminTabs = await chrome.tabs.query({ url: `${adminUrl}*` });
            if (existingAdminTabs.length > 0) {
                const tab = existingAdminTabs[0];
                await chrome.tabs.update(tab.id, { active: true });
                await chrome.windows.update(tab.windowId, { focused: true });
            } else {
                await chrome.tabs.create({ url: adminUrl });
            }
        }
        success = true;
    } catch (error) {
        console.error("ATI Extensão: Erro durante a busca no SGP.", error);
    } finally {
        isSearchRunning = false;
        if (tabId) {
            chrome.tabs.sendMessage(tabId, { action: "sgpSearchComplete", success }).catch(() => {});
        }
    }
}

async function createOccurrenceVisually(data) {
    const { isLoggedIn, baseUrl } = await getSgpStatusWithCache();
    if (!isLoggedIn) throw new Error("Não está logado no SGP.");

    const addOccurrenceUrl = `${baseUrl}/admin/atendimento/cliente/${data.clientSgpId}/ocorrencia/add/`;
    await chrome.storage.local.set({ sgpVisualFillPayload: data });

    const newTab = await chrome.tabs.create({ url: addOccurrenceUrl, active: true });
    chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
        if (tabId === newTab.id && changeInfo.status === 'complete') {
            chrome.scripting.executeScript({ target: { tabId: newTab.id }, func: injectAndFillForm });
            chrome.tabs.onUpdated.removeListener(listener);
        }
    });
}

function injectAndFillForm() {
    chrome.storage.local.get(['sgpVisualFillPayload', 'atendenteAtual'], (result) => {
        const { sgpVisualFillPayload, atendenteAtual } = result;
        if (!sgpVisualFillPayload) return alert('ATI Extensão: Dados da O.S. não encontrados.');
        if (!atendenteAtual) return alert('ATI Extensão: Nenhum atendente logado no painel ATI.');

        const responsibleUsers = sgpVisualFillPayload.responsibleUsers || [];
        const currentUser = atendenteAtual.toLowerCase();
        const responsibleUser = responsibleUsers.find(user => user.username === currentUser);
        const attendantSgpId = responsibleUser ? responsibleUser.id : null;
        if (!attendantSgpId) return alert(`ATI Extensão: O usuário '${atendenteAtual}' não foi encontrado na lista de responsáveis do SGP.`);

        const data = sgpVisualFillPayload;
        const setValue = (selector, value, isCheckbox = false) => {
            const element = document.querySelector(selector);
            if (element) {
                if(isCheckbox) element.checked = value;
                else element.value = value;
                element.dispatchEvent(new Event('change', { bubbles: true }));
            }
        };
        
        setTimeout(() => {
            setValue('#id_clientecontrato', data.selectedContract);
            setTimeout(() => {
                setValue('#id_tipo', data.occurrenceType);
                setValue('#id_conteudo', data.osText.toUpperCase());
                setValue('#id_responsavel', attendantSgpId);
                setValue('#id_setor', '2'); 
                setValue('#id_metodo', '3'); 
                setValue('#id_status', data.occurrenceStatus);
                
                const now = new Date();
                const day = String(now.getDate()).padStart(2, '0');
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const year = now.getFullYear();
                const hours = String(now.getHours()).padStart(2, '0');
                const minutes = String(now.getMinutes()).padStart(2, '0');
                setValue('#id_data_agendamento', `${day}/${month}/${year} ${hours}:${minutes}`);
                setValue('#id_os', data.shouldCreateOS, true);

                chrome.storage.local.remove('sgpVisualFillPayload');
            }, 1000);
        }, 500);
    });
}

// --- LISTENERS DE EVENTOS DA EXTENSÃO ---

chrome.runtime.onInstalled.addListener(() => {
    loadAndCacheAtendentes();
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getSgpFormParams") {
        (async () => {
            try {
                const clientInfo = request.data;
                const cacheKey = clientInfo.cpfCnpj || clientInfo.fullName || clientInfo.phoneNumber;
                if (!cacheKey) throw new Error("Dados do cliente insuficientes para busca.");

                const { isLoggedIn, baseUrl } = await getSgpStatusWithCache();
                if (!isLoggedIn) throw new Error("Você não está logado no SGP.");

                const client = await findClientInSgp(baseUrl, clientInfo);
                if (!client) throw new Error("Cliente não encontrado no SGP.");

                const sgpData = await getSgpDataForClient(baseUrl, client, cacheKey);
                sendResponse({ success: true, data: sgpData });
            } catch (error) {
                sendResponse({ success: false, message: error.message });
            }
        })();
        return true;
    }

    switch (request.action) {
        case "getTemplates":
            loadAndCacheTemplates().then(sendResponse);
            return true;
        case "createOccurrenceVisually":
            createOccurrenceVisually(request.data).catch(err => console.error(err));
            break;
        case "userChanged":
            Promise.all([loadAndCacheAtendentes(), loadAndCacheTemplates()]).then(() => {
                chrome.tabs.query({ url: "*://*.chatmix.com.br/*" }, (tabs) => {
                    tabs.forEach(tab => chrome.tabs.sendMessage(tab.id, { action: "reloadTemplates" }).catch(() => {}));
                });
            });
            break;
        case "themeUpdated":
            chrome.tabs.query({ url: "*://*.chatmix.com.br/*" }, (tabs) => {
                tabs.forEach(tab => chrome.tabs.sendMessage(tab.id, { action: "applyTheme" }).catch(() => {}));
            });
            break;
        case "openInSgp":
            searchClientInSgp(sender.tab.id);
            break;
        case "clearSgpCache":
            if (request.cacheKey) {
                sgpCache.delete(request.cacheKey);
                console.log(`ATI Extensão: Cache limpo para: ${request.cacheKey}.`);
            }
            break;
    }
});

chrome.action.onClicked.addListener(() => {
    const panelUrl = "https://vituali.github.io/ATI/";
    chrome.tabs.query({ url: panelUrl }, (tabs) => {
        if (tabs.length > 0) {
            chrome.windows.update(tabs[0].windowId, { focused: true });
            chrome.tabs.update(tabs[0].id, { active: true });
        } else {
            chrome.tabs.create({ url: panelUrl });
        }
    });
});

chrome.commands.onCommand.addListener(async (command) => {
    if (command === "copy-data") {
        const [tab] = await chrome.tabs.query({ active: true, url: "*://*.chatmix.com.br/*" });
        if (tab) {
            chrome.tabs.sendMessage(tab.id, { action: "executeCopy" }).catch(() => {});
        }
    }
});

const INJECTION_RULES = {
    CHATMIX: { 
        matches: ["https://www.chatmix.com.br/v2/chat*"], 
        js: ["scripts/chatmix.js"], 
        css: ["css/common.css", "css/chatmix.css", "css/modal.css"] 
    },
    SGP_OCORRENCIA: { 
        matches: ["https://sgp.atiinternet.com.br/admin/atendimento/cliente/*/ocorrencia/add/"], 
        js: ["scripts/sgp.js"], 
        css: ["css/common.css", "css/modal.css"] 
    },
    BRIDGE: { 
        matches: ["https://vituali.github.io/ATI/"], 
        js: ["bridge-listener.js"], 
        css: [] 
    }
};

async function injectFiles(tabId, rule) {
    try {
        if (rule.css?.length) await chrome.scripting.insertCSS({ target: { tabId }, files: rule.css });
        if (rule.js?.length) await chrome.scripting.executeScript({ target: { tabId }, files: rule.js });
    } catch (err) { /* Ignora erros de injeção em abas protegidas */ }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        for (const key in INJECTION_RULES) {
            const rule = INJECTION_RULES[key];
            if (rule.matches.some(pattern => new RegExp(pattern.replace(/\*/g, '.*')).test(tab.url))) {
                injectFiles(tabId, rule);
            }
        }
    }
});

