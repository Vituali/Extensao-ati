// bridge-listener.js
console.log('ATI Extensão: Listener da ponte INICIADO.');

const s = document.createElement('script');
s.src = chrome.runtime.getURL('bridge-injected.js');
(document.head || document.documentElement).appendChild(s);
s.onload = () => console.log('ATI Extensão: Script injetado com sucesso no site.');

window.addEventListener('message', (event) => {
    // Verificação de segurança básica
    if (event.source !== window || !event.data.type) return;

    // Roteador de mensagens
    switch (event.data.type) {
        case 'ATI_ATTENDANT_UPDATE': {
            const attendantKey = event.data.attendant;
            console.log(`ATI Extensão: MENSAGEM RECEBIDA: Atendente é '${attendantKey}'.`);
            chrome.storage.local.set({ atendenteAtual: attendantKey }, () => {
                // Avisa o background para recarregar templates em outras abas do Chatmix
                chrome.runtime.sendMessage({ action: "userChanged" });
            });
            break;
        }
        case 'ATI_THEME_UPDATE': {
            const themeSettings = event.data.themeSettings;
            console.log('ATI Extensão: MENSAGEM RECEBIDA: Tema atualizado.', themeSettings);
            // Salva as configurações de tema para a extensão usar
            chrome.storage.local.set({ atiSiteTheme: themeSettings }, () => {
                // Avisa o background que o tema mudou para que ele avise as outras abas
                chrome.runtime.sendMessage({ action: "themeUpdated" });
            });
            break;
        }
    }
}, false);

