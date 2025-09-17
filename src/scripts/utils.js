import { processDynamicPlaceholders } from './logic.js';

const ATI_EXTENSION_CONTAINER_ID = 'ati-extension-root-container';

function getOrCreateExtensionContainer() {
    let container = document.getElementById(ATI_EXTENSION_CONTAINER_ID);
    if (!container) {
        container = document.createElement('div');
        container.id = ATI_EXTENSION_CONTAINER_ID;
        Object.assign(container.style, {
            position: 'fixed', top: '0', left: '0',
            width: '0', height: '0', zIndex: '2147483647',
        });
        document.body.appendChild(container);
    }
    return container;
}

export function showNotification(message, isError = false, duration = 3000) {
    const notification = document.createElement("div");
    notification.textContent = message;
    notification.className = `notification ${isError ? 'error' : 'success'}`;
    getOrCreateExtensionContainer().appendChild(notification);
    setTimeout(() => { notification.remove(); }, duration);
}

function findSuggestedTemplate(allTexts, allTemplates) {
    const osTemplates = allTemplates.filter(t => t.category !== 'quick_reply');
    if (osTemplates.length === 0) return null;
    const chatContent = allTexts.join(' ').toLowerCase();
    for (const template of osTemplates) {
        const keywords = template.keywords || [];
        if (keywords.some(keyword => chatContent.includes(keyword.toLowerCase()))) {
            return template;
        }
    }
    return null;
}

export function createModal({ title, bodyHTML, footerButtons }) {
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
            reject(new Error(reason));
        };
        modalBackdrop.querySelectorAll('button[data-value]').forEach(button => {
            button.addEventListener('click', () => {
                const action = button.getAttribute('data-value');
                if (action === 'cancel') {
                    closeModal();
                    return;
                }
                const data = {};
                const textarea = modalContent.querySelector('.modal-textarea');
                const radio = modalContent.querySelector('input[type="radio"]:checked');
                if (textarea) data.textValue = textarea.value;
                if (radio) data.selectedValue = radio.value;
                modalBackdrop.remove();
                resolve({ action, data });
            });
        });
        modalBackdrop.addEventListener('click', (e) => {
            if (e.target === modalBackdrop) closeModal();
        });
    });
}


export async function showOSModal({ allTemplates, extractChatFn, clientData }) {
    const clientChatTexts = extractChatFn();
    const suggestedTemplate = findSuggestedTemplate(clientChatTexts, allTemplates);
    const { firstName, phoneNumber } = clientData;
    const osBaseText = `${phoneNumber || ''} ${firstName || ''} | `;
    const osOnlyTemplates = allTemplates.filter(t => t.category !== 'quick_reply');

    // =======================================================================
    // == CORREÇÃO APLICADA AQUI                                            ==
    // =======================================================================
    // Alterado de 't.subCategory' para 't.category' para corresponder
    // à forma como o seu site salva os dados no Firebase.
    const templatesByCategory = osOnlyTemplates.reduce((acc, t) => {
        const category = t.category || 'Outros'; // <-- Linha corrigida
        (acc[category] = acc[category] || []).push(t);
        return acc;
    }, {});

    let modelsHTML = '';
    for (const category in templatesByCategory) {
        modelsHTML += `<h4 class="modal-category-title">${category}</h4>`;
        modelsHTML += `<div class="modal-btn-group">` + templatesByCategory[category]
            .map(t => `<button class="template-btn" data-template-text="${t.text.replace(/"/g, '&quot;')}">${t.title}</button>`)
            .join('') + `</div>`;
    }

    const suggestionHTML = suggestedTemplate ?
        `<div class="modal-suggestion"><strong>Sugestão:</strong><button class="template-btn template-btn--suggestion" data-template-text="${suggestedTemplate.text.replace(/"/g, '&quot;')}">${suggestedTemplate.title}</button></div>` :
        '';

    const modalConfig = {
        title: 'Criar Ordem de Serviço',
        bodyHTML: `
            ${suggestionHTML}
            <label for="osTextArea">Descrição da O.S.:</label>
            <textarea id="osTextArea" class="modal-textarea"></textarea>
            <div class="modal-templates-container"><strong>Modelos:</strong>${modelsHTML}</div>
        `,
        footerButtons: [
            { text: 'Cancelar', className: 'main-btn--cancel', value: 'cancel' },
            { text: 'Copiar O.S.', className: 'main-btn--confirm', value: 'copy' },
            { text: 'Criar no SGP', className: 'main-btn--sgp', value: 'send_sgp' }
        ]
    };

    try {
        const resultPromise = createModal(modalConfig);
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
        const osText = userAction.data.textValue.toUpperCase();

        if (userAction.action === 'copy') {
            await navigator.clipboard.writeText(osText);
            showNotification("O.S. copiada com sucesso!");
        } else if (userAction.action === 'send_sgp') {
            if (!osText || osText.trim() === '|') {
                showNotification("A descrição da O.S. está vazia.", true);
                return;
            }
            if (!clientData || (!clientData.cpfCnpj && !clientData.fullName && !clientData.phoneNumber)) {
                showNotification("Nenhum dado do cliente encontrado para buscar no SGP.", true);
                return;
            }
            showNotification("Preparando para abrir SGP...");
            await chrome.storage.local.set({ ...clientData, osText: osText });
            chrome.runtime.sendMessage({ action: "createOccurrenceInSgp" });
        }
    } catch (error) {
        console.log("ATI Extensão: Modal fechado ou ação cancelada.");
    }
}

