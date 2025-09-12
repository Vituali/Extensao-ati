// --- Extensao-ati\background.js ---

function handleLastError(msg) {
  if (chrome.runtime.lastError) {
    console.log(msg);
  }
}

// Trava para impedir execuções simultâneas da busca.
let isSearchRunning = false;

// Listener para atalho
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

// Listener para mensagens da extensão
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "userChanged") {
    console.log("[Background] Usuário mudou. Recarregando abas do Chatmix...");
    chrome.tabs.query({ url: "*://*.chatmix.com.br/*" }, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { action: "reloadTemplates" }, () => {
          handleLastError(`A aba ${tab.id} não estava pronta.`);
        });
      });
    });
  }

  if (request.action === "openInSgp") {
    searchClientInSgp();
    return true; 
  }

  // [MODIFICADO] Retransmite a mensagem de atualização de tema para todas as abas do Chatmix
  if (request.action === "themeUpdated") {
    console.log("[Background] Tema mudou. Avisando abas do Chatmix...");
    chrome.tabs.query({ url: "*://*.chatmix.com.br/*" }, (tabs) => {
        tabs.forEach(tab => {
            // Inclui as configurações no payload da mensagem
            chrome.tabs.sendMessage(tab.id, { action: "applyTheme", settings: request.settings }, () => {
                handleLastError(`A aba ${tab.id} não estava pronta para aplicar o tema.`);
            });
        });
    });
  }

  return true;
});

/**
 * Procura por uma aba que corresponda a um padrão de URL e/ou
 * contenha um texto específico no título. Se encontrar, foca nela. Senão, cria uma nova.
 */
async function openOrFocusTab(url, urlPattern, titleQuery) {
  const tabs = await chrome.tabs.query({ url: urlPattern });

  const matchingTab = tabs.find(tab => tab.title && tab.title.includes(titleQuery));

  if (matchingTab) {
    await chrome.tabs.highlight({ windowId: matchingTab.windowId, tabs: matchingTab.index });
    await chrome.windows.update(matchingTab.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: url });
  }
}

/**
 * Busca o cliente no SGP com lógica de fallback e trava de segurança.
 */
async function searchClientInSgp() {
    if (isSearchRunning) {
        console.log("[SGP] Busca já em andamento. Ignorando clique duplicado.");
        return;
    }
    isSearchRunning = true;

    try {
        const { cpfCnpj, fullName, phoneNumber } = await chrome.storage.local.get([
            "cpfCnpj", "fullName", "phoneNumber"
        ]);

        const executeSearch = async (url) => {
            try {
                const response = await fetch(url, { credentials: 'include' });
                const data = await response.json();
                return (data && data.length > 0) ? data[0] : null;
            } catch (error) {
                console.error("[SGP] Erro na requisição para a API:", error);
                return null;
            }
        };
        
        const openClientPage = (client) => {
            const clientId = client.id;
            const clientNameFromApi = client.label.split(' - ')[0].trim();
            const titleQuery = `${clientNameFromApi} (${clientId})`;
            const clientPageUrl = `https://sgp.atiinternet.com.br/admin/cliente/${clientId}/contratos`;
            const urlPattern = `https://sgp.atiinternet.com.br/admin/*`;
            openOrFocusTab(clientPageUrl, urlPattern, titleQuery);
        };

        if (cpfCnpj) {
            const searchUrl = `https://sgp.atiinternet.com.br/public/autocomplete/ClienteAutocomplete?tconsulta=cpfcnpj&term=${cpfCnpj}`;
            const client = await executeSearch(searchUrl);
            if (client) {
                console.log(`[SGP] Sucesso na Etapa 1 (CPF/CNPJ). Cliente ID: ${client.id}`);
                openClientPage(client);
                return;
            }
        }

        if (fullName) {
            const searchUrl = `https://sgp.atiinternet.com.br/public/autocomplete/ClienteAutocomplete?tconsulta=nome&term=${encodeURIComponent(fullName)}`;
            const client = await executeSearch(searchUrl);
            if (client) {
                console.log(`[SGP] Sucesso na Etapa 2 (Nome). Cliente ID: ${client.id}`);
                openClientPage(client);
                return;
            }
        }

        if (phoneNumber) {
            let cleanPhoneNumber = phoneNumber.replace(/\D/g, '');
            if (cleanPhoneNumber.startsWith('55') && cleanPhoneNumber.length > 11) {
                cleanPhoneNumber = cleanPhoneNumber.substring(2);
            }
            const searchUrl = `https://sgp.atiinternet.com.br/public/autocomplete/ClienteAutocomplete?tconsulta=telefone&term=${cleanPhoneNumber}`;
            const client = await executeSearch(searchUrl);
            if (client) {
                console.log(`[SGP] Sucesso na Etapa 3 (Telefone). Cliente ID: ${client.id}`);
                openClientPage(client);
                return;
            }
        }

        console.log("[SGP] Nenhum cliente encontrado. Abrindo a página de busca geral.");
        const sgpSearchPageUrl = 'https://sgp.atiinternet.com.br/admin/';
        const urlPattern = 'https://sgp.atiinternet.com.br/admin/*';
        await openOrFocusTab(sgpSearchPageUrl, urlPattern, "SGP");

    } finally {
        isSearchRunning = false;
    }
}

// Listener para o clique no ícone da extensão
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

