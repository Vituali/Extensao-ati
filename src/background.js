// Importa a configuração de um local centralizado.
import { firebaseConfig } from './firebase-config.js';

// --- Funções de Lógica do Firebase (Usando API REST) ---

/**
 * Busca dados genéricos do Firebase via API REST.
 * @param {string} path O caminho para os dados (ex: 'atendentes' ou 'respostas/victorh').
 * @returns {Promise<object|null>} Os dados encontrados ou nulo.
 */
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

/**
 * Carrega e armazena em cache os dados de todos os atendentes.
 */
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


/**
 * Carrega os modelos (respostas e O.S.) para o atendente logado.
 */
async function loadAndCacheTemplates() {
    const { atendenteAtual } = await chrome.storage.local.get('atendenteAtual');
    if (!atendenteAtual) {
        await chrome.storage.local.remove('cachedOsTemplates');
        return [];
    }

    console.log(`ATI Extensão: Carregando modelos para: ${atendenteAtual}`);
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
        console.log(`ATI Extensão: ${validTemplates.length} modelos de '${atendenteAtual}' carregados.`);
        return validTemplates;

    } catch (error) {
        console.error("ATI Extensão: Falha ao carregar do Firebase. Usando cache.", error);
        const { cachedOsTemplates } = await chrome.storage.local.get('cachedOsTemplates');
        return cachedOsTemplates || [];
    }
}

// --- Lógica do SGP ---
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

async function searchClientInSgp(tabId) {
    if (isSearchRunning) return;
    isSearchRunning = true;
    let success = false;
    try {
        const { isLoggedIn, baseUrl } = await getSgpStatusWithCache();
        if (!isLoggedIn) {
            await chrome.tabs.create({ url: `${baseUrl}/accounts/login/?next=/admin/` });
            return;
        }
        const clientData = await chrome.storage.local.get(["cpfCnpj", "fullName", "phoneNumber"]);
        const client = await findClientInSgp(baseUrl, clientData);
        await chrome.tabs.create({ url: client ? `${baseUrl}/admin/cliente/${client.id}/contratos` : `${baseUrl}/admin/` });
        success = true;
    } finally {
        isSearchRunning = false;
        if (tabId) {
            chrome.tabs.sendMessage(tabId, { action: "sgpSearchComplete", success }).catch(() => {});
        }
    }
}

// --- Funções de Criação de O.S. ---
async function getSgpFormParams(clientData) {
    const { isLoggedIn, baseUrl } = await getSgpStatusWithCache();
    if (!isLoggedIn) throw new Error("Você não está logado no SGP.");

    const client = await findClientInSgp(baseUrl, clientData);
    if (!client) throw new Error("Cliente não encontrado no SGP.");
    
    const addOccurrenceUrl = `${baseUrl}/admin/atendimento/cliente/${client.id}/ocorrencia/add/`;
    const responsePage = await fetch(addOccurrenceUrl, { credentials: 'include' });
    const pageHtml = await responsePage.text();

    if (pageHtml.includes('id_username') && pageHtml.includes('id_password')) {
        await chrome.storage.local.remove('sgp_status_cache');
        throw new Error("Sua sessão no SGP expirou. Faça o login novamente.");
    }
    
    // Extrai a lista de responsáveis diretamente do HTML do SGP
    const responsibleUsers = [];
    const responsibleSelectRegex = /<select[^>]+id=['"]id_responsavel['"][^>]*>([\s\S]*?)<\/select>/;
    const responsibleMatch = pageHtml.match(responsibleSelectRegex);
    if (responsibleMatch && responsibleMatch[1]) {
        const optionRegex = /<option[^>]+value=['"](\d+)['"][^>]*>([\s\S]*?)<\/option>/g;
        let match;
        while ((match = optionRegex.exec(responsibleMatch[1])) !== null) {
            if (match[1]) {
                const username = match[2].trim().toLowerCase();
                responsibleUsers.push({ id: match[1], username: username });
            }
        }
    }

    const contracts = [];
    const contractSelectRegex = /<select[^>]+id=['"]id_clientecontrato['"][^>]*>([\s\S]*?)<\/select>/;
    const selectMatch = pageHtml.match(contractSelectRegex);
    if (selectMatch && selectMatch[1]) {
        const optionRegex = /<option[^>]+value=['"](\d+)['"][^>]*>([\s\S]*?)<\/option>/g;
        let match;
        while ((match = optionRegex.exec(selectMatch[1])) !== null) {
            if (match[1]) {
                const contractText = match[2].trim();
                let finalAddress = '';
                try {
                    const servicesResponse = await fetch(`${baseUrl}/admin/clientecontrato/servico/list/ajax/?contrato_id=${match[1]}`, {credentials: 'include'});
                    const services = await servicesResponse.json();
                    if (services && services.length > 0) {
                        const detailsResponse = await fetch(`${baseUrl}/admin/atendimento/ocorrencia/servico/detalhe/ajax/?servico_id=${services[0].id}&contrato_id=${match[1]}`, {credentials: 'include'});
                        const details = await detailsResponse.json();
                        if (details && details[0]?.end_instalacao) {
                           finalAddress = ` - Endereço: ${details[0].end_instalacao}`;
                        }
                    }
                } catch (e) { /* Ignore address fetch error */ }
                contracts.push({ id: match[1], text: `${contractText}${finalAddress}` });
            }
        }
    }
    if (contracts.length === 0) throw new Error("Nenhum contrato ativo para este cliente.");

    const occurrenceTypes = [];
    const typeSelectRegex = /<select[^>]+id=['"]id_tipo['"][^>]*>([\s\S]*?)<\/select>/;
    const typeSelectMatch = pageHtml.match(typeSelectRegex);
     if (typeSelectMatch && typeSelectMatch[1]) {
        const optionRegex = /<option[^>]+value=['"](\d+)['"][^>]*>([\s\S]*?)<\/option>/g;
        let match;
        while ((match = optionRegex.exec(typeSelectMatch[1])) !== null) {
            if (match[1]) {
                occurrenceTypes.push({ id: match[1], text: match[2].trim().replace(/&nbsp;/g, ' ') });
            }
        }
    }

    return { contracts, occurrenceTypes, clientSgpId: client.id, responsibleUsers };
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

// --- Função Injetada no SGP ---
function injectAndFillForm() {
    // A única fonte de verdade é o atendente logado no Painel ATI.
    chrome.storage.local.get(['sgpVisualFillPayload', 'atendenteAtual'], (result) => {
        const { sgpVisualFillPayload, atendenteAtual } = result;

        if (!sgpVisualFillPayload) return alert('ATI Extensão: Dados da O.S. não encontrados.');
        if (!atendenteAtual) return alert('ATI Extensão: Nenhum atendente logado no painel ATI. Faça o login para continuar.');

        // A lista de usuários do SGP agora vem no payload, extraída pelo background
// A lista de usuários do SGP agora vem no payload, extraída pelo background
        const responsibleUsers = sgpVisualFillPayload.responsibleUsers || [];
        
        const currentUser = atendenteAtual.toLowerCase();

        // --- INÍCIO DO CÓDIGO DE DEPURAÇÃO ---
        console.log("ATI DEBUG: Comparando usuário", { 
            currentUser: currentUser,
            tipoDeCurrentUser: typeof currentUser,
            responsibleUsers: responsibleUsers 
        });
        // --- FIM DO CÓDIGO DE DEPURAÇÃO ---
        
        const responsibleUser = responsibleUsers.find(user => user.username === currentUser);
        const attendantSgpId = responsibleUser ? responsibleUser.id : null;
        
        if (!attendantSgpId) return alert(`ATI Extensão: O usuário '${atendenteAtual}' não foi encontrado na lista de responsáveis do SGP. Verifique se os nomes de usuário são idênticos.`);

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

                console.log(`ATI Extensão: Formulário preenchido para ${atendenteAtual} (ID: ${attendantSgpId}).`);
                chrome.storage.local.remove('sgpVisualFillPayload');
            }, 1000);
        }, 500);
    });
}

// --- Listeners Globais ---
chrome.runtime.onInstalled.addListener(() => {
    loadAndCacheAtendentes();
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
        case "getTemplates":
            loadAndCacheTemplates().then(sendResponse);
            return true;
        case "getSgpFormParams":
            getSgpFormParams(request.data)
                .then(response => sendResponse({success: true, data: response}))
                .catch(error => sendResponse({success: false, message: error.message}));
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
    }
    return true;
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

// --- Injeção de Scripts ---
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

