function handleLastError(msg) {
  if (chrome.runtime.lastError) {
    console.log(msg);
  }
}

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

// Listener para mudança de usuário e para abrir no SGP
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

  return true;
});

/**
 * Busca o cliente no SGP usando a API de autocomplete e abre sua página.
 */
async function searchClientInSgp() {
    // Pega o CPF/CNPJ salvo pelo content script
    const { cpfCnpj } = await chrome.storage.local.get(["cpfCnpj"]);
    
    if (!cpfCnpj) {
        console.error("[SGP] CPF/CNPJ não encontrado no storage.");
        return;
    }

    const searchUrl = `https://sgp.atiinternet.com.br/public/autocomplete/ClienteAutocomplete?tconsulta=cpfcnpj&term=${cpfCnpj}`;

    try {
        const response = await fetch(searchUrl);
        const data = await response.json();

        if (data && data.length > 0) {
            const client = data[0];
            const clientId = client.id;
            const clientPageUrl = `https://sgp.atiinternet.com.br/admin/cliente/${clientId}/contratos`;
            
            // A linha que preparava o preenchimento automático foi removida daqui.
            
            chrome.tabs.create({ url: clientPageUrl });
        } else {
            console.log("[SGP] Nenhum cliente encontrado para o CPF/CNPJ:", cpfCnpj);
        }
    } catch (error) {
        console.error("[SGP] Erro ao buscar cliente:", error);
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