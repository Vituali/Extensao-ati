// Correctly import the newly created modal function.
import { createModal } from './modal.js';

/**
 * Displays a temporary notification on the screen.
 * @param {string} message - The message to display.
 * @param {boolean} [isError=false] - If true, styles the notification as an error.
 */
export function showNotification(message, isError = false) {
    const notificationId = 'ati-notification';
    document.getElementById(notificationId)?.remove();

    const notification = document.createElement('div');
    notification.id = notificationId;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background-color: ${isError ? '#dc3545' : '#28a745'};
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        z-index: 10000;
        font-size: 14px;
        font-family: sans-serif;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        opacity: 0;
        transition: opacity 0.3s, transform 0.3s;
        transform: translateY(-20px);
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateY(0)';
    }, 10);

    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateY(-20px)';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

/**
 * Processa placeholders dinâmicos em um texto.
 * @param {string} text - O texto a ser processado.
 * @returns {string} O texto com placeholders substituídos.
 */
function processDynamicPlaceholders(text) {
    if (typeof text !== 'string') return '';
    const hora = new Date().getHours();
    const saudacao = hora >= 5 && hora < 12 ? "Bom dia" :
                     hora >= 12 && hora < 18 ? "Boa tarde" : "Boa noite";
    const despedida = hora >= 5 && hora < 12 ? "Tenha uma excelente manhã" :
                      hora >= 12 && hora < 18 ? "Tenha uma excelente tarde" : "Tenha uma excelente noite";

    return text.replace(/\[SAUDACAO\]/gi, saudacao).replace(/\[DESPEDIDA\]/gi, despedida);
}

/**
 * Encontra um modelo sugerido com base nas palavras-chave do chat.
 * @param {string[]} chatTexts - Textos do chat.
 * @param {object[]} templates - Lista de modelos de O.S.
 * @returns {object|null} O modelo sugerido ou nulo.
 */
function findSuggestedTemplate(chatTexts, templates) {
    const chatContent = chatTexts.join(' ').toLowerCase();
    for (const template of templates) {
        if (template.keywords && template.keywords.some(kw => chatContent.includes(kw.toLowerCase()))) {
            return template;
        }
    }
    return null;
}

/**
 * Popula a seção de contratos no modal com os dados recebidos do SGP.
 * @param {HTMLElement} modalElement - O elemento do modal.
 * @param {object[]} contracts - A lista de contratos.
 */
function populateContracts(modalElement, contracts) {
    const container = modalElement.querySelector('#modal-sgp-contracts-container');
    if (!container) return;
    let contractsHTML = '<div class="modal-loader">Nenhum contrato encontrado.</div>';
    const validContracts = Array.isArray(contracts) ? contracts.filter(c => c && c.id) : [];

    if (validContracts.length > 0) {
        contractsHTML = '<div class="modal-btn-group">' +
            validContracts.map((contract, index) => `
                <label class="template-btn" style="display: block; text-align: left; width: 100%; padding: 10px; line-height: 1.5;">
                    <input type="radio" name="selected_contract" value="${contract.id}" ${index === 0 ? 'checked' : ''} style="vertical-align: middle; margin-right: 8px;">
                    <span style="vertical-align: middle;">${contract.text}</span>
                </label>
            `).join('') + '</div>';
    }
    container.innerHTML = `<h4 class="modal-category-title">Selecione o Contrato</h4>${contractsHTML}`;
}


/**
 * Popula e ativa o seletor de tipos de ocorrência com busca.
 * @param {HTMLElement} modalElement - O elemento do modal.
 * @param {object[]} occurrenceTypes - A lista de tipos de ocorrência.
 */
function populateOccurrenceTypes(modalElement, occurrenceTypes) {
    const container = modalElement.querySelector('#modal-occurrence-types-container');
    if (!container) return;

    let typesHTML = '<div class="modal-loader">Nenhum tipo de ocorrência encontrado.</div>';
    const validTypes = Array.isArray(occurrenceTypes) ? occurrenceTypes.filter(t => t && t.id) : [];

    if (validTypes.length > 0) {
        typesHTML = `
            <div class="searchable-select-container">
                <input type="text" id="occurrenceTypeSearchInput" class="modal-textarea" placeholder="Pesquisar tipo..." autocomplete="off">
                <input type="hidden" id="occurrenceTypeSelectedValue">
                <div id="occurrenceTypeOptions" class="searchable-options-list">
                    ${validTypes.map(type => `<div class="searchable-option" data-value="${type.id}">${type.text}</div>`).join('')}
                </div>
            </div>
        `;
    }
    container.innerHTML = `<h4 class="modal-category-title">Tipo de Ocorrência</h4>${typesHTML}`;

    const searchInput = modalElement.querySelector('#occurrenceTypeSearchInput');
    const hiddenInput = modalElement.querySelector('#occurrenceTypeSelectedValue');
    const optionsContainer = modalElement.querySelector('#occurrenceTypeOptions');
    
    if (searchInput && hiddenInput && optionsContainer) {
        const allOptions = Array.from(optionsContainer.querySelectorAll('.searchable-option'));

        if (validTypes.length > 0) {
            searchInput.value = validTypes[0].text;
            hiddenInput.value = validTypes[0].id;
        }

        searchInput.addEventListener('focus', () => {
            optionsContainer.style.display = 'block';
            searchInput.select();
        });

        document.addEventListener('click', (e) => {
            if (!container.contains(e.target)) {
                 optionsContainer.style.display = 'none';
            }
        });

        searchInput.addEventListener('input', () => {
            const filter = searchInput.value.toUpperCase();
            hiddenInput.value = '';
            let hasVisibleOption = false;
            allOptions.forEach(option => {
                const txtValue = option.textContent || option.innerText;
                if (txtValue.toUpperCase().indexOf(filter) > -1) {
                    option.style.display = "";
                    hasVisibleOption = true;
                } else {
                    option.style.display = "none";
                }
            });
             optionsContainer.style.display = hasVisibleOption ? 'block' : 'none';
        });

        allOptions.forEach(option => {
            option.addEventListener('mousedown', (e) => { // mousedown para executar antes do blur do input
                e.preventDefault();
                hiddenInput.value = option.getAttribute('data-value');
                searchInput.value = option.innerText;
                optionsContainer.style.display = 'none';
            });
        });
    }
}


/**
 * Mostra o modal de O.S. e carrega os dados do SGP em segundo plano.
 */
export async function showOSModal({ allTemplates, extractChatFn, clientData }) {
    const clientChatTexts = extractChatFn();
    const suggestedTemplate = findSuggestedTemplate(clientChatTexts, allTemplates);
    const { firstName, phoneNumber } = clientData;
    const osBaseText = `${phoneNumber || ''} ${firstName || ''} | `;
    const osOnlyTemplates = allTemplates.filter(t => t.category !== 'quick_reply');
    const cacheKey = clientData.cpfCnpj || clientData.fullName || clientData.phoneNumber;

    const templatesByCategory = osOnlyTemplates.reduce((acc, t) => {
        const category = t.category || 'Outros';
        (acc[category] = acc[category] || []).push(t);
        return acc;
    }, {});

    let modelsHTML = '';
    for (const category in templatesByCategory) {
        modelsHTML += `<h4 class="modal-category-title">${category}</h4>`;
        modelsHTML += `<div class="modal-btn-group">` + templatesByCategory[category]
            .map(t => `<button class="template-btn" data-template-text="${t.text.replace(/"/g, '&quot;')}" data-occurrence-type-id="${t.occurrenceTypeId || ''}">${t.title}</button>`)
            .join('') + `</div>`;
    }

    const suggestionHTML = suggestedTemplate ?
        `<div class="modal-suggestion"><strong>Sugestão:</strong><button class="template-btn template-btn--suggestion" data-template-text="${suggestedTemplate.text.replace(/"/g, '&quot;')}" data-occurrence-type-id="${suggestedTemplate.occurrenceTypeId || ''}">${suggestedTemplate.title}</button></div>` :
        '';

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
            <div id="modal-sgp-contracts-container"><div class="modal-loader">Carregando contratos...</div></div>
            <div id="modal-occurrence-types-container"><div class="modal-loader">Carregando tipos de ocorrência...</div></div>
            
            <label for="osTextArea" style="margin-top: 15px; display: block; font-weight: bold;">Descrição:</label>
            <textarea id="osTextArea" class="modal-textarea"></textarea>

            ${statusCheckboxHTML}

            <div class="modal-templates-container" style="margin-top: 20px;"><strong>Modelos:</strong>${modelsHTML}</div>
        `,
        footerButtons: [
            { text: 'Cancelar', className: 'main-btn--cancel', value: 'cancel' },
            { text: 'Copiar', className: 'main-btn--confirm', value: 'copy' },
            { text: 'Preencher no SGP', className: 'main-btn--sgp', value: 'fill_sgp_debug', disabled: true }
        ]
    };
    
    let sgpData = null;

    try {
        const resultPromise = createModal(modalConfig);
        const modalElement = document.querySelector('.ati-os-modal');
        const osTextArea = modalElement.querySelector('#osTextArea');
        const sgpButton = modalElement.querySelector('button[value="fill_sgp_debug"]');

        osTextArea.value = processDynamicPlaceholders(osBaseText).toUpperCase();

        chrome.runtime.sendMessage({ action: "getSgpFormParams", data: clientData })
            .then(response => {
                if (chrome.runtime.lastError) throw new Error(chrome.runtime.lastError.message);
                
                if (response && response.success) {
                    sgpData = response.data;
                    populateContracts(modalElement, sgpData.contracts);
                    populateOccurrenceTypes(modalElement, sgpData.occurrenceTypes);
                    if (sgpButton) sgpButton.disabled = false;
                } else {
                    const errorMsg = response.message || 'Falha ao buscar dados do SGP.';
                    const contractsLoader = modalElement.querySelector('#modal-sgp-contracts-container .modal-loader');
                    const typesLoader = modalElement.querySelector('#modal-occurrence-types-container .modal-loader');
                    if (contractsLoader) contractsLoader.textContent = `Erro: ${errorMsg}`;
                    if (typesLoader) typesLoader.innerHTML = '';
                    if (sgpButton) sgpButton.textContent = 'Falha ao Carregar';
                }
            }).catch(error => {
                 const errorMsg = error.message || 'Falha na comunicação.';
                 const contractsLoader = modalElement.querySelector('#modal-sgp-contracts-container .modal-loader');
                 if (contractsLoader) contractsLoader.textContent = `Erro: ${errorMsg}`;
                 if (sgpButton) sgpButton.textContent = 'Falha ao Carregar';
                 console.error("ATI Extensão: Erro ao buscar dados do SGP.", error);
            });

        modalElement.querySelectorAll('.template-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const buttonElement = e.target.closest('.template-btn');
                if (!buttonElement) return;

                const templateText = buttonElement.getAttribute('data-template-text');
                const fullText = osBaseText + templateText;
                osTextArea.value = processDynamicPlaceholders(fullText).toUpperCase();
                osTextArea.focus();
                
                const occurrenceTypeId = buttonElement.getAttribute('data-occurrence-type-id');
                const searchInput = modalElement.querySelector('#occurrenceTypeSearchInput');
                const hiddenInput = modalElement.querySelector('#occurrenceTypeSelectedValue');

                if (occurrenceTypeId && sgpData && sgpData.occurrenceTypes && searchInput && hiddenInput) {
                    const selectedType = sgpData.occurrenceTypes.find(type => type.id === occurrenceTypeId);
                    if (selectedType) {
                        searchInput.value = selectedType.text;
                        hiddenInput.value = selectedType.id;
                    }
                }
            });
        });

        const userAction = await resultPromise;
        
        if (userAction.action === 'fill_sgp_debug' && !sgpData) {
             showNotification("Aguarde o carregamento dos dados do SGP terminar.", true);
             return;
        }
        
        const validSgpContracts = sgpData?.contracts?.filter(c => c && c.id) || [];
        const submissionData = {
            ...clientData,
            clientSgpId: sgpData?.clientSgpId,
            osText: userAction.data.osText,
            selectedContract: userAction.data.selectedContract || (validSgpContracts.length > 0 ? validSgpContracts[0].id : null),
            occurrenceType: userAction.data.occurrenceType,
            shouldCreateOS: userAction.data.shouldCreateOS,
            occurrenceStatus: userAction.data.occurrenceStatus,
            responsibleUsers: sgpData?.responsibleUsers
        };
        
        if (userAction.action === 'copy') {
            await navigator.clipboard.writeText(submissionData.osText);
            showNotification("O.S. copiada com sucesso!");
        } else if (userAction.action === 'fill_sgp_debug') {
             if (!submissionData.osText || !submissionData.selectedContract || !submissionData.occurrenceType) {
                return showNotification("Descrição, Contrato e Tipo de Ocorrência são obrigatórios.", true);
            }
            showNotification("Abrindo SGP para preenchimento...");
            chrome.runtime.sendMessage({ action: "createOccurrenceVisually", data: submissionData });
        }
    } catch (error) {
        if (error.message !== 'cancel') {
            console.error("ATI Extensão: Modal fechado ou ação cancelada.", error);
        }
    } finally {
        if (cacheKey) {
            chrome.runtime.sendMessage({ action: "clearSgpCache", cacheKey: cacheKey });
        }
    }
}

