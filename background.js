// ===================================================================================
// == BACKGROUND.JS (COM CACHE DIÁRIO, VERIFICAÇÃO DE LOGIN E FALLBACK)             ==
// ===================================================================================

function handleLastError(msg) {
  if (chrome.runtime.lastError) {
    console.log(`ATI Extensão: Erro não tratado: ${msg}`);
  }
}

let isSearchRunning = false;

async function performLoginCheck(baseUrl) {
    try {
        const response = await fetch(`${baseUrl}/admin/`, {
            credentials: 'include',
            signal: AbortSignal.timeout(3000)
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
    
    console.log('ATI Extensão: [SGP Fallback] Não logado em nenhum domínio. Usando DNS como padrão para login.');
    return { isLoggedIn: false, baseUrl: dnsUrl };
}

async function getSgpStatusWithCache() {
    const today = new Date().toISOString().slice(0, 10);
    const cache = await chrome.storage.local.get('sgp_status_cache');
    
    if (cache.sgp_status_cache && cache.sgp_status_cache.date === today) {
        console.log(`ATI Extensão: [SGP Cache] Usando status salvo de hoje: ${cache.sgp_status_cache.baseUrl}`);
        return cache.sgp_status_cache;
    }

    console.log('ATI Extensão: [SGP Cache] Cache expirado ou inexistente. Realizando verificação completa...');
    const currentStatus = await checkSgpStatus();

    if (currentStatus.isLoggedIn) {
        await chrome.storage.local.set({
            sgp_status_cache: {
                isLoggedIn: true,
                baseUrl: currentStatus.baseUrl,
                date: today
            }
        });
    } else {
        await chrome.storage.local.remove('sgp_status_cache');
    }
    return currentStatus;
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "copy-data") {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        chrome.tabs.sendMessage(tab.id, { action: "executeCopy" });
      }
    } catch {
      handleLastError("Atalho pressionado em aba não compatível.");
    }
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "userChanged") {
    console.log("ATI Extensão: Usuário mudou. Recarregando abas do Chatmix...");
    chrome.tabs.query({ url: "*://*.chatmix.com.br/*" }, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { action: "reloadTemplates" }, () => handleLastError(`A aba ${tab.id} não estava pronta.`));
      });
    });
    return true;
  }
  if (request.action === "createOccurrenceInSgp") {
    createOccurrenceInSgp();
    return true;
  }
  if (request.action === "openInSgp") {
    searchClientInSgp();
    return true; 
  }
  if (request.action === "themeUpdated") {
    console.log("ATI Extensão: Tema mudou. Avisando abas do Chatmix...");
    chrome.tabs.query({ url: "*://*.chatmix.com.br/*" }, (tabs) => {
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, { action: "applyTheme", settings: request.settings }, () => handleLastError(`A aba ${tab.id} não estava pronta para aplicar o tema.`));
        });
    });
    return true;
  }
  if (request.action === "templatesUpdated") {
      console.log("ATI Extensão: Templates foram atualizados. Avisando as abas do Chatmix...");
      chrome.tabs.query({ url: "*://*.chatmix.com.br/*" }, (tabs) => {
          tabs.forEach(tab => {
              chrome.tabs.sendMessage(tab.id, { action: "reloadTemplates" });
          });
      });
      return true;
  }
  return true; 
});


async function openOrFocusTab(url, titleQuery) {
    const urlPattern = `*://*/*admin/*`;
    const tabs = await chrome.tabs.query({ url: urlPattern });
    const matchingTab = tabs.find(tab => tab.title && tab.title.includes(titleQuery));

    if (matchingTab) {
        console.log(`ATI Extensão: [SGP] Aba para "${titleQuery}" encontrada. Atualizando e focando.`);
        await chrome.tabs.update(matchingTab.id, { url: url, active: true });
        await chrome.windows.update(matchingTab.windowId, { focused: true });
        return matchingTab;
    } else {
        console.log(`ATI Extensão: [SGP] Nenhuma aba para "${titleQuery}" encontrada. Criando uma nova.`);
        const newTab = await chrome.tabs.create({ url: url });
        return newTab;
    }
}

async function searchClientInSgp() {
    if (isSearchRunning) {
        console.log("ATI Extensão: [SGP] Busca já em andamento. Ignorando clique duplicado.");
        return;
    }
    isSearchRunning = true;

    try {
        const { isLoggedIn, baseUrl } = await getSgpStatusWithCache();
        if (!isLoggedIn) {
            console.log(`ATI Extensão: [SGP] Usuário não está logado em ${baseUrl}. Redirecionando para login.`);
            const loginUrl = `${baseUrl}/accounts/login/?next=/admin/`;
            await openOrFocusTab(loginUrl, "SGP"); 
            return;
        }

        const { cpfCnpj, fullName, phoneNumber } = await chrome.storage.local.get(["cpfCnpj", "fullName", "phoneNumber"]);
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
        const openClientPage = (client) => {
            const titleQuery = `${client.label.split(' - ')[0].trim()} (${client.id})`;
            const clientPageUrl = `${baseUrl}/admin/cliente/${client.id}/contratos`;
            openOrFocusTab(clientPageUrl, titleQuery);
        };

        if (cpfCnpj) {
            const client = await executeSearch(`${baseUrl}/public/autocomplete/ClienteAutocomplete?tconsulta=cpfcnpj&term=${cpfCnpj}`);
            if (client) { console.log(`ATI Extensão: [SGP] Sucesso na Etapa 1 (CPF/CNPJ). Cliente ID: ${client.id}`); openClientPage(client); return; }
        }
        if (fullName) {
            const client = await executeSearch(`${baseUrl}/public/autocomplete/ClienteAutocomplete?tconsulta=nome&term=${encodeURIComponent(fullName)}`);
            if (client) { console.log(`ATI Extensão: [SGP] Sucesso na Etapa 2 (Nome). Cliente ID: ${client.id}`); openClientPage(client); return; }
        }
        if (phoneNumber) {
            let cleanPhoneNumber = phoneNumber.replace(/\D/g, '').substring(2);
            const client = await executeSearch(`${baseUrl}/public/autocomplete/ClienteAutocomplete?tconsulta=telefone&term=${cleanPhoneNumber}`);
            if (client) { console.log(`ATI Extensão: [SGP] Sucesso na Etapa 3 (Telefone). Cliente ID: ${client.id}`); openClientPage(client); return; }
        }

        console.log("ATI Extensão: [SGP] Nenhum cliente encontrado. Abrindo a página de busca geral.");
        await openOrFocusTab(`${baseUrl}/admin/`, "SGP");
    } finally {
        isSearchRunning = false;
    }
}

async function createOccurrenceInSgp() {
    if (isSearchRunning) {
        console.log("ATI Extensão: [SGP] Busca já em andamento. Ignorando clique duplicado.");
        return;
    }
    isSearchRunning = true;

    try {
        const { isLoggedIn, baseUrl } = await getSgpStatusWithCache();
        if (!isLoggedIn) {
            console.log(`ATI Extensão: [SGP] Usuário não está logado em ${baseUrl}. Redirecionando para login.`);
            const loginUrl = `${baseUrl}/accounts/login/?next=/admin/`;
            await openOrFocusTab(loginUrl, "SGP");
            return;
        }

        const { cpfCnpj, fullName, phoneNumber, osText } = await chrome.storage.local.get(["cpfCnpj", "fullName", "phoneNumber", "osText"]);
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
        const openAndFillOccurrencePage = async (client) => {
            const titleQuery = `${client.label.split(' - ')[0].trim()} (${client.id})`;
            const occurrencePageUrl = `${baseUrl}/admin/atendimento/cliente/${client.id}/ocorrencia/add/`;
            await chrome.storage.local.set({ pendingOsText: osText });
            const sgpTab = await openOrFocusTab(occurrencePageUrl, titleQuery);
            chrome.tabs.sendMessage(sgpTab.id, { action: "fillSgpForm", osText: osText }, (response) => {
                if (chrome.runtime.lastError) console.log("ATI Extensão: Aba do SGP é nova, o preenchimento ocorrerá ao carregar.");
                else console.log("ATI Extensão: Aba do SGP já estava aberta, preenchimento enviado por mensagem.");
            });
        };

        if (cpfCnpj) {
            const client = await executeSearch(`${baseUrl}/public/autocomplete/ClienteAutocomplete?tconsulta=cpfcnpj&term=${cpfCnpj}`);
            if (client) { await openAndFillOccurrencePage(client); return; }
        }
        if (fullName) {
             const client = await executeSearch(`${baseUrl}/public/autocomplete/ClienteAutocomplete?tconsulta=nome&term=${encodeURIComponent(fullName)}`);
             if (client) { await openAndFillOccurrencePage(client); return; }
        }
        if (phoneNumber) {
            let cleanPhoneNumber = phoneNumber.replace(/\D/g, '').substring(2);
            const client = await executeSearch(`${baseUrl}/public/autocomplete/ClienteAutocomplete?tconsulta=telefone&term=${cleanPhoneNumber}`);
            if (client) { await openAndFillOccurrencePage(client); return; }
        }
        console.log("ATI Extensão: [SGP] Nenhum cliente encontrado. Abrindo busca geral.");
        await openOrFocusTab(`${baseUrl}/admin/`, "SGP");
    } finally {
        isSearchRunning = false;
    }
}

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

