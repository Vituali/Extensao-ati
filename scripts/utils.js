/* =================================================================== */
/* == ARQUIVO DE FUNÇÕES UTILITÁRIAS COMPARTILHADAS - ATI EXTENSÃO  == */
/* =================================================================== */

const ATI_EXTENSION_CONTAINER_ID = 'ati-extension-root-container';

/**
 * Cria um contêiner raiz para todos os elementos da extensão, evitando
 * manipulação direta do document.body que pode quebrar a aplicação do site.
 * @returns {HTMLElement} - O elemento do contêiner da extensão.
 */
function getOrCreateExtensionContainer() {
    let container = document.getElementById(ATI_EXTENSION_CONTAINER_ID);
    if (!container) {
        container = document.createElement('div');
        container.id = ATI_EXTENSION_CONTAINER_ID;
        // Estilo para garantir que o contêiner não afete o layout da página
        container.style.position = 'fixed';
        container.style.top = '0';
        container.style.left = '0';
        container.style.width = '0';
        container.style.height = '0';
        container.style.zIndex = '2147483647'; // O z-index máximo possível
        document.body.appendChild(container);
    }
    return container;
}

/**
 * Exibe uma notificação flutuante na tela, agora dentro do contêiner seguro.
 * @param {string} message - A mensagem a ser exibida.
 * @param {boolean} [isError=false] - Se a notificação é de erro.
 * @param {number} [duration=3000] - Duração da notificação em ms.
 */
function showNotification(message, isError = false, duration = 3000) {
    const notificationId = 'ati-notification';
    document.getElementById(notificationId)?.remove();

    const notification = document.createElement("div");
    notification.id = notificationId;
    notification.textContent = message;
    notification.className = `notification ${isError ? 'error' : 'success'}`;
    
    // Anexa ao contêiner seguro
    getOrCreateExtensionContainer().appendChild(notification);

    setTimeout(() => { notification.remove(); }, duration);
}


/**
 * Procura por um template sugerido com base nas palavras-chave encontradas no chat.
 * @param {string[]} allTexts - Um array com todas as mensagens do chat.
 * @param {object[]} allTemplates - A lista completa de templates carregados.
 * @returns {object|null} - O template sugerido ou null se nenhum for encontrado.
 */
function findSuggestedTemplate(allTexts, allTemplates) {
    const osOnlyTemplates = allTemplates.filter(t => t.category !== 'quick_reply');
    if (osOnlyTemplates.length === 0) return null;

    const chatContent = allTexts.join(' ').toLowerCase();
    for (const template of osOnlyTemplates) {
        if (!template.keywords || template.keywords.length === 0) continue;
        for (const keyword of template.keywords) {
            if (chatContent.includes(keyword.toLowerCase())) {
                return template;
            }
        }
    }
    return null;
}

/**
 * Cria e exibe um modal genérico para criação de Ordem de Serviço dentro do contêiner seguro.
 * @param {object} config - Objeto de configuração para o modal.
 * @param {string} config.modalId - ID único para o modal (ex: 'osModalV1', 'osModalV2').
 * @param {HTMLElement} config.chatHeader - Elemento do cabeçalho do chat.
 * @param {HTMLElement} config.chatBody - Elemento do corpo do chat.
 * @param {object[]} config.allTemplates - Array com todos os templates de O.S.
 * @param {function} config.extractDataFn - Função para extrair dados do cabeçalho (nome, telefone).
 * @param {function} config.extractChatFn - Função para extrair o texto da conversa.
 */
function showOSModal({ modalId, chatHeader, chatBody, allTemplates, extractDataFn, extractChatFn, clientData }) {
    if (document.getElementById(modalId)) return;
    if (!chatHeader || !chatBody) {
        showNotification("Nenhum chat ativo encontrado para criar O.S.", true);
        return;
    }

    // ===============================================================================
    // ## INÍCIO DA CORREÇÃO ##
    // Adicionamos um filtro para remover quaisquer templates nulos ou inválidos da lista.
    // Isso impede que o código quebre ao tentar ler propriedades de 'null'.
    // ===============================================================================
    const validTemplates = allTemplates.filter(t => t && typeof t === 'object');

    const clientChatTexts = extractChatFn(chatBody);
    // Usamos a lista 'validTemplates' a partir de agora
    const suggestedTemplate = findSuggestedTemplate(clientChatTexts, validTemplates);
    const { firstName, phoneNumber } = extractDataFn(chatHeader);
    const osBaseText = `${phoneNumber || ''} ${firstName || ''} | `;
    // Usamos a lista 'validTemplates' aqui também
    const osOnlyTemplates = validTemplates.filter(t => t.category !== 'quick_reply');

    const templatesByCategory = osOnlyTemplates.reduce((acc, t) => {
        (acc[t.category || 'Outros'] = acc[t.category || 'Outros'] || []).push(t);
        return acc;
    }, {});
    // ===============================================================================
    // ## FIM DA CORREÇÃO ##
    // O resto da função continua como antes.
    // ===============================================================================

    let modelsHTML = '';
    for (const category in templatesByCategory) {
        modelsHTML += `<h4 class="modal-category-title">${category}</h4>`;
        const buttonsHTML = templatesByCategory[category]
            .map(t => `<button class="template-btn" data-template-text="${t.text.replace(/"/g, '&quot;')}">${t.title}</button>`)
            .join('');
        modelsHTML += `<div class="modal-btn-group">${buttonsHTML}</div>`;
    }

    const modalBackdrop = document.createElement('div');
    modalBackdrop.id = modalId;
    modalBackdrop.className = 'modal-backdrop ati-os-modal';

    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';

    const suggestionHTML = suggestedTemplate ?
        `<div class="modal-suggestion"><strong>Sugestão:</strong><button class="template-btn template-btn--suggestion" 
 data-template-text="${suggestedTemplate.text.replace(/"/g, '&quot;')}">${suggestedTemplate.title}</button></div>` :
        '';
    modalContent.innerHTML = `
        <div class="modal-header">
            <h3>Criar Ordem de Serviço</h3>
            <button class="modal-close-btn">&times;</button>
        </div>
        <div class="modal-body">
            ${suggestionHTML}
            <label for="osTextArea">Descrição da O.S.:</label>
            <textarea id="osTextArea" class="modal-textarea"></textarea>
   
             <div class="modal-templates-container"><strong>TODOS OS MODELOS:</strong>${modelsHTML}</div>
        </div>
        <div class="modal-footer">
    <button class="main-btn main-btn--cancel">Cancelar</button>
    <button class="main-btn main-btn--confirm">Copiar O.S.</button>
    <button class="main-btn main-btn--sgp" style="background-color: #ff8c00;">Criar Ocorrência no SGP</button>
        </div>`;
    modalBackdrop.appendChild(modalContent);
    
    getOrCreateExtensionContainer().appendChild(modalBackdrop);

    const osTextArea = modalContent.querySelector('#osTextArea');
    osTextArea.value = processDynamicPlaceholders(osBaseText).toUpperCase();
    osTextArea.addEventListener('input', function() { this.value = this.value.toUpperCase(); });

    modalContent.querySelectorAll('.template-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const templateText = btn.getAttribute('data-template-text');
            const fullText = osBaseText + templateText;
            osTextArea.value = processDynamicPlaceholders(fullText).toUpperCase();
            osTextArea.focus();
        });
    });
    const closeModal = () => modalBackdrop.remove();

    modalContent.querySelector('.main-btn--confirm').onclick = () => {
        navigator.clipboard.writeText(osTextArea.value).then(() => {
            showNotification("O.S. copiada com sucesso!");
            closeModal();
        }).catch(err => showNotification("Falha ao copiar O.S.", true));
    };
    
    modalContent.querySelector('.main-btn--sgp').onclick = async () => {
        const osText = osTextArea.value;
        if (!osText || osText.trim() === '|') {
            showNotification("A descrição da O.S. está vazia.", true);
            return;
        }

        if (!clientData || !clientData.cpfCnpj) {
            showNotification("CPF/CNPJ do cliente não encontrado no chat. Não é possível abrir o SGP.", true);
            return;
        }

        showNotification("Preparando para abrir SGP...");
        try {
            await chrome.storage.local.set({ 
                cpfCnpj: clientData.cpfCnpj, 
                fullName: clientData.fullName,
                phoneNumber: clientData.phoneNumber,
                osText: osText 
            });
            chrome.runtime.sendMessage({ action: "createOccurrenceInSgp" });
            closeModal();
        } catch (error) {
            console.error("Erro ao enviar dados para o SGP:", error);
            showNotification("Erro ao iniciar a busca no SGP.", true);
        }
    };
    
    modalContent.querySelector('.modal-close-btn').onclick = closeModal;
    modalContent.querySelector('.main-btn--cancel').onclick = closeModal;
    modalBackdrop.addEventListener('click', (e) => {
        if (e.target === modalBackdrop) {
            closeModal();
        }
    });
}
/**
 * Carrega as configurações de tema salvas do site-painel e as injeta no Chatmix.
 * Se nenhum tema for encontrado, aplica um tema azul padrão.
 */
function applySiteTheme() {
    // Define um tema padrão azul caso nada seja encontrado no storage.
    const defaultTheme = {
        isDarkMode: true, // Chatmix V2 é escuro por padrão
        neonBorders: true,
        iconColor: '#007DFF',      // Azul (RGB 0, 125, 255)
        borderColor: '#007DFF',    // Azul (RGB 0, 125, 255)
        textColor: '#E5E5E5',
    };

    chrome.storage.local.get('atiSiteTheme', ({ atiSiteTheme }) => {
        // Usa o tema do storage OU o tema padrão azul.
        const themeToApply = atiSiteTheme || defaultTheme;
        
        // --- ADICIONADO LOG PARA VERIFICAÇÃO ---
        console.log('[ATI EXTENSION] Puxando esquema de cores:', themeToApply);
        
        const styleId = 'ati-site-theme-styles';
        let styleTag = document.getElementById(styleId);
        if (!styleTag) {
            styleTag = document.createElement('style');
            styleTag.id = styleId;
            (document.head || document.documentElement).appendChild(styleTag);
        }

        // Funções auxiliares de cor
        const getLuminance = (hex) => {
            if (!hex || hex.length < 4) return 0;
            hex = hex.replace("#", "");
            const r = parseInt(hex.substring(0, 2), 16) / 255, g = parseInt(hex.substring(2, 4), 16) / 255, b = parseInt(hex.substring(4, 6), 16) / 255;
            const a = [r, g, b].map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
            return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
        };
        const lightenColor = (hex, percent) => {
            hex = hex.replace("#", "");
            const r = parseInt(hex.substring(0, 2), 16), g = parseInt(hex.substring(2, 4), 16), b = parseInt(hex.substring(4, 6), 16);
            const increase = percent / 100;
            return `#${Math.min(255,Math.round(r+(255-r)*increase)).toString(16).padStart(2,'0')}${Math.min(255,Math.round(g+(255-g)*increase)).toString(16).padStart(2,'0')}${Math.min(255,Math.round(b+(255-b)*increase)).toString(16).padStart(2,'0')}`;
        };
        const hexToRgba = (hex, alpha) => {
            hex = hex.replace("#", "");
            const r = parseInt(hex.substring(0, 2), 16), g = parseInt(hex.substring(2, 4), 16), b = parseInt(hex.substring(4, 6), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        };
        
        const contrastColorForButtons = getLuminance(themeToApply.borderColor) > 0.5 ? '#111111' : '#FFFFFF';
        
        styleTag.textContent = `
            :root {
                --theme-font-primary: 'Orbitron', sans-serif;
                --theme-font-secondary: Arial, sans-serif;
                --theme-card-bg: ${themeToApply.isDarkMode ? '#2d2d2d' : '#ffffff'};
                --theme-text-primary: ${themeToApply.isDarkMode ? '#e0e0e0' : '#333333'};
                --theme-text-secondary: ${themeToApply.isDarkMode ? '#a0a0a0' : '#666666'};
                --theme-border-color: ${themeToApply.borderColor};
                --theme-heading-color: ${themeToApply.textColor};
                --theme-button-bg: ${themeToApply.borderColor};
                --theme-button-text: ${contrastColorForButtons};
                --theme-button-hover-bg: ${lightenColor(themeToApply.borderColor, 20)};
                --theme-success-color: #22C55E;
                --theme-error-color: #EF4444;
                --theme-info-color: #3B82F6;
                --theme-shadow-color: ${hexToRgba(themeToApply.borderColor, themeToApply.neonBorders ? 0.4 : 0)};
            }
        `;
    });
}
