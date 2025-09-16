// ===================================================================
// == UTILS.JS - (REESCRITO COM COMPONENTE DE MODAL REUTILIZÁVEL)   ==
// ===================================================================

const ATI_EXTENSION_CONTAINER_ID = 'ati-extension-root-container';

/**
 * Cria um contêiner raiz para todos os elementos da extensão.
 * @returns {HTMLElement} - O elemento do contêiner da extensão.
 */
function getOrCreateExtensionContainer() {
    let container = document.getElementById(ATI_EXTENSION_CONTAINER_ID);
    if (!container) {
        container = document.createElement('div');
        container.id = ATI_EXTENSION_CONTAINER_ID;
        container.style.position = 'fixed';
        container.style.top = '0';
        container.style.left = '0';
        container.style.width = '0';
        container.style.height = '0';
        container.style.zIndex = '2147483647';
        document.body.appendChild(container);
    }
    return container;
}

/**
 * Exibe uma notificação flutuante na tela.
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

// =================================================================================
// ## INÍCIO DA ALTERAÇÃO: COMPONENTE DE MODAL GENÉRICO ##
// =================================================================================

/**
 * [NOVO] Cria e gerencia um modal genérico, retornando uma Promise com a ação do usuário.
 * Inspirado na arquitetura de componentes como React.
 * @param {object} config - Objeto de configuração do modal.
 * @param {string} config.title - O título que aparecerá no cabeçalho.
 * @param {string} config.bodyHTML - O conteúdo HTML a ser injetado no corpo do modal.
 * @param {Array<{text: string, className: string, value: string}>} config.footerButtons - Array de objetos para criar os botões.
 * @returns {Promise<{action: string, data: object}>} - Uma promessa que resolve com a ação e dados do modal.
 */
function createModal({ title, bodyHTML, footerButtons }) {
    return new Promise((resolve, reject) => {
        const modalId = `ati-modal-${Date.now()}`;
        if (document.getElementById(modalId)) return reject('Modal já existe.');

        const modalBackdrop = document.createElement('div');
        modalBackdrop.id = modalId;
        modalBackdrop.className = 'modal-backdrop ati-os-modal';

        const buttonsHTML = footerButtons.map(btn => 
            `<button class="main-btn ${btn.className}" data-value="${btn.value}">${btn.text}</button>`
        ).join('');

        modalBackdrop.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>${title}</h3>
                    <button class="modal-close-btn" data-value="cancel">&times;</button>
                </div>
                <div class="modal-body">${bodyHTML}</div>
                <div class="modal-footer">${buttonsHTML}</div>
            </div>
        `;
        
        getOrCreateExtensionContainer().appendChild(modalBackdrop);
        const modalContent = modalBackdrop.querySelector('.modal-content');

        const closeModal = (reason = 'cancel') => {
            modalBackdrop.remove();
            reject(reason);
        };

        // Adiciona listeners a todos os botões clicáveis
        modalBackdrop.querySelectorAll('button[data-value]').forEach(button => {
            button.addEventListener('click', () => {
                const action = button.getAttribute('data-value');
                if (action === 'cancel') {
                    closeModal();
                    return;
                }
                
                // Coleta dados dos inputs do modal, se houver
                const data = {};
                const textarea = modalContent.querySelector('.modal-textarea');
                const radio = modalContent.querySelector('input[type="radio"]:checked');
                if (textarea) data.textValue = textarea.value;
                if (radio) data.selectedValue = radio.value;
                
                modalBackdrop.remove();
                resolve({ action, data });
            });
        });
        
        // Permite fechar clicando fora do modal
        modalBackdrop.addEventListener('click', (e) => {
            if (e.target === modalBackdrop) closeModal();
        });
    });
}

/**
 * [REESCRITO] Prepara e exibe o modal de Ordem de Serviço usando o novo componente createModal.
 * A responsabilidade desta função agora é apenas ORQUESTRAR os dados.
 */
async function showOSModal({ chatHeader, chatBody, allTemplates, extractDataFn, extractChatFn, clientData }) {
    if (!chatHeader || !chatBody) {
        showNotification("Nenhum chat ativo encontrado para criar O.S.", true);
        return;
    }
    
    // 1. Prepara todos os dados e o HTML necessário para o corpo do modal.
    const validTemplates = allTemplates.filter(t => t && typeof t === 'object');
    const clientChatTexts = extractChatFn(chatBody);
    const suggestedTemplate = findSuggestedTemplate(clientChatTexts, validTemplates);
    const { firstName, phoneNumber } = extractDataFn(chatHeader);
    const osBaseText = `${phoneNumber || ''} ${firstName || ''} | `;
    const osOnlyTemplates = validTemplates.filter(t => t.category !== 'quick_reply');
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

    const suggestionHTML = suggestedTemplate ?
        `<div class="modal-suggestion"><strong>Sugestão:</strong><button class="template-btn template-btn--suggestion" data-template-text="${suggestedTemplate.text.replace(/"/g, '&quot;')}">${suggestedTemplate.title}</button></div>` :
        '';

    // 2. Define a configuração do modal.
    const modalConfig = {
        title: 'Criar Ordem de Serviço',
        bodyHTML: `
            ${suggestionHTML}
            <label for="osTextArea">Descrição da O.S.:</label>
            <textarea id="osTextArea" class="modal-textarea"></textarea>
            <div class="modal-templates-container"><strong>TODOS OS MODELOS:</strong>${modelsHTML}</div>
        `,
        footerButtons: [
            { text: 'Cancelar', className: 'main-btn--cancel', value: 'cancel' },
            { text: 'Copiar O.S.', className: 'main-btn--confirm', value: 'copy' },
            { text: 'Criar no SGP', className: 'main-btn--sgp', value: 'send_sgp' }
        ]
    };

    try {
        // 3. Chama o componente e espera a interação do usuário.
        const resultPromise = createModal(modalConfig);
        
        // Pós-renderização: Adiciona listeners específicos para este modal
        const modalElement = document.querySelector('.ati-os-modal');
        const osTextArea = modalElement.querySelector('#osTextArea');
        osTextArea.value = processDynamicPlaceholders(osBaseText).toUpperCase();

        modalElement.querySelectorAll('.template-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const templateText = btn.getAttribute('data-template-text');
                const fullText = osBaseText + templateText;
                osTextArea.value = processDynamicPlaceholders(fullText).toUpperCase();
                osTextArea.focus();
            });
        });

        const userAction = await resultPromise;
        
        // 4. Processa a ação do usuário.
        const osText = userAction.data.textValue.toUpperCase();

        if (userAction.action === 'copy') {
            await navigator.clipboard.writeText(osText);
            showNotification("O.S. copiada com sucesso!");
        } else if (userAction.action === 'send_sgp') {
            if (!osText || osText.trim() === '|') {
                showNotification("A descrição da O.S. está vazia.", true);
                return;
            }
            if (!clientData || !clientData.cpfCnpj) {
                showNotification("CPF/CNPJ do cliente não encontrado no chat. Não é possível abrir o SGP.", true);
                return;
            }
            showNotification("Preparando para abrir SGP...");
            await chrome.storage.local.set({ ...clientData, osText: osText });
            chrome.runtime.sendMessage({ action: "createOccurrenceInSgp" });
        }
    } catch (error) {
        console.log("ATI Extensão: Modal fechado ou ação cancelada. " + error);
    }
}