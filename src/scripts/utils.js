import { processDynamicPlaceholders } from './logic.js';

const ATI_EXTENSION_CONTAINER_ID = 'ati-extension-root-container';

// Mapeamento de títulos de template para o texto exato do tipo de ocorrência no SGP.
const TEMPLATE_TO_OCCURRENCE_MAP = {
    'COMPROVANTE': 'ENVIO DE COMPROVANTE',
    'PROMESSA': 'PROMESSA DE PAGAMENTO',
    'LENTO': 'CLIENTE RELATA LENTIDÃO',
    'LENTIDÃO': 'CLIENTE RELATA LENTIDÃO',
    'SEM CONEXÃO': 'CLIENTE SEM ACESSO',
    'SEM ACESSO': 'CLIENTE SEM ACESSO',
    'POSTE': 'POSTE QUEIMADO/CAIDO',
    'WI-FI': 'TROCA DE SENHA WIFI',
    'WIFI': 'TROCA DE SENHA WIFI',
    'QUEDA DE LUZ': 'QUEDA DE ENERGIA/POSTE QUEIMADO',
    'ENERGIA': 'QUEDA DE ENERGIA/POSTE QUEIMADO',
    'FIBRA': 'FIBRA ROMPIDA',
    'ROMPIDA': 'FIBRA ROMPIDA'
};


/**
 * Injeta os estilos CSS necessários para o modal, incluindo o dropdown.
 */
function injectModalStyles() {
    const styleId = 'ati-modal-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
        .searchable-select-container { position: relative; }
        .searchable-options-list {
            display: none; position: absolute; background-color: #ffffff; color: #212529;
            width: 100%; border: 1px solid #ced4da; border-radius: 5px; z-index: 10001;
            max-height: 150px; overflow-y: auto; box-sizing: border-box; margin-top: -1px;
        }
        html.dark .searchable-options-list { background-color: #3a3a3a; border-color: #555; color: #e0e0e0; }
        .searchable-option { padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #dee2e6; }
        html.dark .searchable-option { border-bottom: 1px solid #444; }
        .searchable-option:last-child { border-bottom: none; }
        .searchable-option:hover { background-color: #e9ecef; }
        html.dark .searchable-option:hover { background-color: #555; color: white; }

        /* CORREÇÃO: Aplica a altura mínima apenas ao <textarea> de descrição, e não ao <input> de busca. */
        .ati-os-modal textarea.modal-textarea {
            min-height: 120px;
        }
    `;
    document.head.appendChild(style);
}


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
                const isStatusClosed = modalContent.querySelector('#occurrenceStatusCheckbox')?.checked;
                const data = {
                    osText: modalContent.querySelector('#osTextArea')?.value,
                    selectedContract: modalContent.querySelector('input[name="selected_contract"]:checked')?.value,
                    occurrenceType: modalContent.querySelector('#occurrenceTypeSelectedValue')?.value, 
                    shouldCreateOS: modalContent.querySelector('#shouldCreateOSCheckbox')?.checked,
                    occurrenceStatus: isStatusClosed ? '1' : '0',
                };
                modalBackdrop.remove();
                resolve({ action, data });
            });
        });
        modalBackdrop.addEventListener('click', (e) => {
            if (e.target === modalBackdrop) closeModal();
        });
    });
}


export async function showOSModal({ allTemplates, extractChatFn, clientData, sgpData }) {
    injectModalStyles();
    const clientChatTexts = extractChatFn();
    const suggestedTemplate = findSuggestedTemplate(clientChatTexts, allTemplates);
    const { firstName, phoneNumber } = clientData;
    const osBaseText = `${phoneNumber || ''} ${firstName || ''} | `;
    const osOnlyTemplates = allTemplates.filter(t => t.category !== 'quick_reply');

    const templatesByCategory = osOnlyTemplates.reduce((acc, t) => {
        const category = t.category || 'Outros';
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

    let contractHTML = '';
    if (sgpData.contracts.length > 0) {
        contractHTML = `<h4 class="modal-category-title">Selecione o Contrato</h4><div class="modal-btn-group">` +
            sgpData.contracts.map((contract, index) => `
                <label class="template-btn" style="display: block; text-align: left; width: 100%; padding: 10px; line-height: 1.5;">
                    <input type="radio" name="selected_contract" value="${contract.id}" ${index === 0 ? 'checked' : ''} style="vertical-align: middle; margin-right: 8px;">
                    <span style="vertical-align: middle;">${contract.text}</span>
                </label>
            `).join('') + `</div>`;
    }

    const occurrenceTypesHTML = `
        <h4 class="modal-category-title">Tipo de Ocorrência</h4>
        <div class="searchable-select-container">
            <input type="text" id="occurrenceTypeSearchInput" class="modal-textarea" placeholder="Pesquisar tipo..." autocomplete="off">
            <input type="hidden" id="occurrenceTypeSelectedValue">
            <div id="occurrenceTypeOptions" class="searchable-options-list">
                ${sgpData.occurrenceTypes.map(type => `<div class="searchable-option" data-value="${type.id}">${type.text}</div>`).join('')}
            </div>
        </div>
    `;

    const statusCheckboxHTML = `
        <div style="margin-top: 15px; display: grid; grid-template-columns: auto 1fr; gap: 10px; align-items: center;">
             <label style="display: flex; align-items: center; gap: 5px; cursor: pointer;">
                <input type="checkbox" id="occurrenceStatusCheckbox" checked>
                <span>Ocorrência Encerrada?</span>
            </label>
             <label style="display: flex; align-items: center; gap: 5px; cursor: pointer;">
                <input type="checkbox" id="shouldCreateOSCheckbox">
                <span>Gerar O.S.?</span>
            </label>
        </div>`;


    const modalConfig = {
        title: 'Criar Ordem de Serviço',
        bodyHTML: `
            ${suggestionHTML}
            ${contractHTML}
            ${occurrenceTypesHTML}
            
            <label for="osTextArea" style="margin-top: 15px; display: block; font-weight: bold;">Descrição:</label>
            <textarea id="osTextArea" class="modal-textarea"></textarea>

            ${statusCheckboxHTML}

            <div class="modal-templates-container" style="margin-top: 20px;"><strong>Modelos:</strong>${modelsHTML}</div>
        `,
        footerButtons: [
            { text: 'Cancelar', className: 'main-btn--cancel', value: 'cancel' },
            { text: 'Copiar', className: 'main-btn--confirm', value: 'copy' },
            { text: 'Preencher no SGP', className: 'main-btn--sgp', value: 'fill_sgp_debug' }
        ]
    };

    try {
        const resultPromise = createModal(modalConfig);
        const modalElement = document.querySelector('.ati-os-modal');
        const osTextArea = modalElement.querySelector('#osTextArea');
        const searchInput = modalElement.querySelector('#occurrenceTypeSearchInput');
        const hiddenInput = modalElement.querySelector('#occurrenceTypeSelectedValue');

        osTextArea.value = processDynamicPlaceholders(osBaseText).toUpperCase();

        const updateOccurrenceType = (templateTitle) => {
            const upperCaseTitle = templateTitle.toUpperCase();
            const mapKey = Object.keys(TEMPLATE_TO_OCCURRENCE_MAP).find(key => upperCaseTitle.includes(key));
            
            if (mapKey) {
                const targetText = TEMPLATE_TO_OCCURRENCE_MAP[mapKey];
                const occurrenceType = sgpData.occurrenceTypes.find(type => type.text.toUpperCase() === targetText.toUpperCase());
                
                if (occurrenceType) {
                    searchInput.value = occurrenceType.text;
                    hiddenInput.value = occurrenceType.id;
                }
            }
        };

        modalElement.querySelectorAll('.template-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (e.target.tagName === 'BUTTON') {
                    const templateText = btn.getAttribute('data-template-text');
                    const fullText = osBaseText + templateText;
                    osTextArea.value = processDynamicPlaceholders(fullText).toUpperCase();
                    osTextArea.focus();
                    
                    updateOccurrenceType(btn.textContent);
                }
            });
        });

        const optionsContainer = modalElement.querySelector('#occurrenceTypeOptions');
        const allOptions = optionsContainer.querySelectorAll('.searchable-option');

        if (sgpData.occurrenceTypes.length > 0) {
            searchInput.value = sgpData.occurrenceTypes[0].text;
            hiddenInput.value = sgpData.occurrenceTypes[0].id;
        }

        searchInput.addEventListener('focus', () => {
            optionsContainer.style.display = 'block';
            searchInput.select();
        });

        document.addEventListener('click', (e) => {
            if (!searchInput.contains(e.target) && !optionsContainer.contains(e.target)) {
                 optionsContainer.style.display = 'none';
            }
        });

        searchInput.addEventListener('input', () => {
            const filter = searchInput.value.toUpperCase();
            hiddenInput.value = '';
            allOptions.forEach(option => {
                const txtValue = option.textContent || option.innerText;
                if (txtValue.toUpperCase().indexOf(filter) > -1) {
                    option.style.display = "";
                } else {
                    option.style.display = "none";
                }
            });
        });

        allOptions.forEach(option => {
            option.addEventListener('mousedown', (e) => {
                e.preventDefault();
                hiddenInput.value = option.getAttribute('data-value');
                searchInput.value = option.innerText;
                optionsContainer.style.display = 'none';
            });
        });

        const userAction = await resultPromise;
        
        const submissionData = {
            ...clientData,
            clientSgpId: sgpData.clientSgpId,
            osText: userAction.data.osText,
            selectedContract: userAction.data.selectedContract || sgpData.contracts[0]?.id,
            occurrenceType: userAction.data.occurrenceType,
            shouldCreateOS: userAction.data.shouldCreateOS,
            occurrenceStatus: userAction.data.occurrenceStatus,
            responsibleUsers: sgpData.responsibleUsers
        };

        if (userAction.action === 'copy') {
            await navigator.clipboard.writeText(submissionData.osText);
            showNotification("O.S. copiada com sucesso!");

        } else if (userAction.action === 'fill_sgp_debug') {
            if (!submissionData.osText || submissionData.osText.trim() === '|') {
                return showNotification("A descrição da O.S. está vazia.", true);
            }
            if (!submissionData.selectedContract) {
                return showNotification("Nenhum contrato foi selecionado.", true);
            }
            if (!submissionData.occurrenceType) {
                return showNotification("Selecione um Tipo de Ocorrência válido.", true);
            }
            showNotification("Abrindo SGP para preenchimento de depuração...");
            chrome.runtime.sendMessage({ action: "createOccurrenceVisually", data: submissionData });
        }
    } catch (error) {
        if (error.message !== 'cancel') {
            console.log("ATI Extensão: Modal fechado ou ação cancelada.", error);
        }
    }
}

