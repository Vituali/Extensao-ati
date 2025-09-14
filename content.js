// content.js - VERSÃO FINAL (ESTRATÉGIA DE HIJACK DE MODAL)

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "executeCopy") {
    if (typeof copyContactInfo === "function") {
      copyContactInfo();
      sendResponse({ status: "Cópia executada." });
    } else {
      sendResponse({ status: "Erro: Função de cópia não encontrada." });
    }
  } else if (request.action === "reloadTemplates") {
    console.log("ATI Extensão: Aviso de recarregamento recebido. Buscando novos templates...");
    runExtension();
    sendResponse({ status: "Templates recarregados." });
  }
  return true;
});

async function runExtension() {
  injectCSS('injected.css');
  
  if (typeof initializeActions === "function" && typeof loadTemplatesFromStorage === "function") {
    
    if (!document.getElementById('actionsContainer')) {
        initializeActions();
    }

    console.log("ATI Extensão: runExtension iniciada.");
    try {
      // Aplica o tema visual do site-painel
      if (typeof applySiteTheme === "function") applySiteTheme();

      // Carrega os modelos de O.S. e Respostas
      const templates = await loadTemplatesFromStorage();
      console.log("ATI Extensão: Templates carregados.");
      window.osTemplates = templates;
      
      // Inicia a lógica de interface (botões, modal, etc.)
      initializeModalHijacker();
      console.log("ATI Extensão: Funções de UI inicializadas com sucesso.");

    } catch (error) {
      console.error("ATI Extensão: Erro fatal durante a inicialização.", error);
    }
  }
}
async function runExtension() {
  injectCSS('injected.css');
  if (typeof initializeActions === "function" && typeof loadTemplatesFromStorage === "function") {

    if (!document.getElementById('actionsContainer')) {
        initializeActions();
[cite: 32] }

    console.log("ATI Extensão: runExtension iniciada.");
    try {
      // --- ADICIONE A LINHA ABAIXO ---
      if (typeof applySiteTheme === "function") applySiteTheme();
[cite: 33] const templates = await loadTemplatesFromStorage();
      console.log("ATI Extensão: Templates carregados.");
      window.osTemplates = templates;

      initializeModalHijacker();
[cite: 34] console.log("ATI Extensão: Funções de UI inicializadas com sucesso.");
    } catch (error) {
      console.error("ATI Extensão: Erro fatal durante a inicialização.", error);
}
  }
}
const startupInterval = setInterval(() => {
    const targetElement = document.querySelector("section.attendances");
    if (targetElement) {
        clearInterval(startupInterval);
        runExtension();
    } 
}, 500);