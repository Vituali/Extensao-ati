// bridge-listener.js
console.log('[Extensão ATI] Listener da ponte INICIADO.');

const s = document.createElement('script');
s.src = chrome.runtime.getURL('bridge-injected.js');
(document.head || document.documentElement).appendChild(s);
s.onload = () => console.log('[Extensão ATI] Script injetado com sucesso no site.');

window.addEventListener('message', (event) => {
    // Verificação de segurança básica
    if (event.source !== window || !event.data.type) return;

    // Roteador de mensagens
    switch (event.data.type) {
        case 'ATI_ATTENDANT_UPDATE': {
            const attendantKey = event.data.attendant;
            console.log(`[Extensão ATI] MENSAGEM RECEBIDA: Atendente é '${attendantKey}'.`);
            chrome.storage.local.set({ atendenteAtual: attendantKey }, () => {
                // Avisa o background para recarregar templates em outras abas do Chatmix
                chrome.runtime.sendMessage({ action: "userChanged" });
            });
            break;
        }
        // ---> NOVO BLOCO PARA O TEMA <---
        case 'ATI_THEME_UPDATE': {
            const themeSettings = event.data.themeSettings;
            console.log('[Extensão ATI] MENSAGEM RECEBIDA: Tema atualizado.');
            // Salva as configurações de tema para a extensão usar
            chrome.storage.local.set({ atiSiteTheme: themeSettings });
            break;
        }
    }
}, false);