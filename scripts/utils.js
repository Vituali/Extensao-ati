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
function showOSModal({ modalId, chatHeader, chatBody, allTemplates, extractDataFn, extractChatFn }) {
    if (document.getElementById(modalId)) return;

    if (!chatHeader || !chatBody) {
        showNotification("Nenhum chat ativo encontrado para criar O.S.", true);
        return;
    }

    const clientChatTexts = extractChatFn(chatBody);
    const suggestedTemplate = findSuggestedTemplate(clientChatTexts, allTemplates);
    const { firstName, phoneNumber } = extractDataFn(chatHeader);
    const osBaseText = `${phoneNumber || ''} ${firstName || ''} | `;
    const osOnlyTemplates = allTemplates.filter(t => t.category !== 'quick_reply');

    const templatesByCategory = osOnlyTemplates.reduce((acc, t) => {
        (acc[t.category || 'Outros'] = acc[t.category || 'Outros'] || []).push(t);
        return acc;
    }, {});

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
        `<div class="modal-suggestion"><strong>Sugestão:</strong><button class="template-btn template-btn--suggestion" data-template-text="${suggestedTemplate.text.replace(/"/g, '&quot;')}">${suggestedTemplate.title}</button></div>` :
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
            <button class="main-btn main-btn--confirm">Copiar O.S. e Fechar</button>
            <button class="main-btn main-btn--cancel">Cancelar</button>
        </div>`;

    modalBackdrop.appendChild(modalContent);
    
    // Anexa o modal ao contêiner seguro
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
 */
function applySiteTheme() {
    chrome.storage.local.get('atiSiteTheme', ({ atiSiteTheme }) => {
        if (!atiSiteTheme) return; // Se não houver tema salvo, não faz nada

        const styleId = 'ati-site-theme-styles';
        let styleTag = document.getElementById(styleId);
        if (!styleTag) {
            styleTag = document.createElement('style');
            styleTag.id = styleId;
            (document.head || document.documentElement).appendChild(styleTag);
        }

        // --- LÓGICA SIMPLIFICADA ---
        // Agora, apenas definimos as variáveis de cor que o v2.css irá usar.
        styleTag.textContent = `
            :root {
                --theme-icon-color: ${atiSiteTheme.iconColor};
                --theme-button-color: ${atiSiteTheme.borderColor};
                --theme-button-hover-bg: ${hexToRgba(atiSiteTheme.borderColor, 0.1)};
                --theme-button-hover-border: ${lightenColor(atiSiteTheme.borderColor, 20)};
                --theme-glow-color: ${hexToRgba(atiSiteTheme.borderColor, 0.3)};
                --theme-inset-glow-color: ${hexToRgba(atiSiteTheme.borderColor, 0.2)};
            }
        `;

        // Funções auxiliares de cor (ainda necessárias)
        function lightenColor(hex, percent) {
            hex = hex.replace("#", "");
            const r = parseInt(hex.substring(0, 2), 16), g = parseInt(hex.substring(2, 4), 16), b = parseInt(hex.substring(4, 6), 16);
            const increase = percent / 100;
            return `#${Math.min(255, Math.round(r + (255 - r) * increase)).toString(16).padStart(2, '0')}${Math.min(255, Math.round(g + (255 - g) * increase)).toString(16).padStart(2, '0')}${Math.min(255, Math.round(b + (255 - b) * increase)).toString(16).padStart(2, '0')}`;
        }
        function hexToRgba(hex, alpha) {
            hex = hex.replace("#", "");
            const r = parseInt(hex.substring(0, 2), 16), g = parseInt(hex.substring(2, 4), 16), b = parseInt(hex.substring(4, 6), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
    });
}