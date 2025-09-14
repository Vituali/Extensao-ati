// --- sgp.js (VERSÃO 100% COMPLETA E FINAL) ---
// Inclui preenchimento automático, fallback manual, seletor de contrato e verificação de O.S. pendente.

const ATTENDANTS = {
    'VICTORH': '99',
    'LUCASJ': '100',
    'HELIO': '77',
    'IGORMAGALHAES': '68',
    'JEFFERSON': '62',
};

// ------------------------------------

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function getCurrentFormattedDateTime() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

const setValueWithDelay = (selector, value, delay) => {
    return new Promise(resolve => {
        setTimeout(() => {
            try {
                const element = $(selector);
                if (element.length > 0) {
                    element.val(value);
                    const event = new Event('change', { bubbles: true });
                    element[0].dispatchEvent(event);
                }
                resolve();
            } catch (error) {
                console.error(`[Extensão ATI] Erro ao preencher o campo ${selector}:`, error);
                resolve();
            }
        }, delay);
    });
};

function injectContractModalStyles() {
    const styleId = 'ati-contract-modal-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
        .contract-options-container {
            display: flex;
            flex-direction: column;
            gap: 10px;
            margin-top: 15px;
        }
        .contract-option {
            display: block;
            padding: 12px;
            border: 1px solid var(--theme-border-color, #555);
            border-radius: 5px;
            cursor: pointer;
            transition: background-color 0.2s;
        }
        .contract-option:hover {
            background-color: var(--theme-button-hover-bg, #0056b3);
        }
        .contract-option input[type="radio"] {
            margin-right: 10px;
        }
    `;
    document.head.appendChild(style);
}

function promptForContractSelection(contracts) {
    return new Promise((resolve, reject) => {
        if (document.getElementById('ati-contract-modal')) return reject('Modal já está aberto.');

        injectContractModalStyles();

        const modalBackdrop = document.createElement('div');
        modalBackdrop.id = 'ati-contract-modal';
        modalBackdrop.className = 'modal-backdrop ati-os-modal';

        const contractOptionsHTML = contracts.map((contract, index) => `
            <label class="contract-option">
                <input type="radio" name="selected_contract" value="${contract.id}" ${index === 0 ? 'checked' : ''}>
                <span>${contract.text}</span>
            </label>
        `).join('');

        modalBackdrop.innerHTML = `
            <div class="modal-content" style="max-width: 550px;">
                <div class="modal-header">
                    <h3>Selecione o Contrato Correto</h3>
                </div>
                <div class="modal-body">
                    <p>Este cliente possui múltiplos contratos ativos. Por favor, escolha qual deles deve ser associado a esta ocorrência.</p>
                    <div class="contract-options-container">${contractOptionsHTML}</div>
                </div>
                <div class="modal-footer">
                    <button id="cancel-contract-selection" class="main-btn main-btn--cancel">Cancelar</button>
                    <button id="confirm-contract-selection" class="main-btn main-btn--confirm">Confirmar</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modalBackdrop);

        const confirmBtn = document.getElementById('confirm-contract-selection');
        const cancelBtn = document.getElementById('cancel-contract-selection');

        const closeModal = () => modalBackdrop.remove();

        cancelBtn.onclick = () => {
            closeModal();
            reject('Seleção de contrato cancelada.');
        };

        confirmBtn.onclick = () => {
            const selectedRadio = document.querySelector('input[name="selected_contract"]:checked');
            if (selectedRadio) {
                closeModal();
                resolve(selectedRadio.value);
            } else {
                showNotification('Por favor, selecione um contrato.', true);
            }
        };
    });
}

async function fillSgpForm(osText) {
    try {
        if (!osText) {
            return showNotification('[Extensão ATI] Nenhum texto de O.S. para preencher.', true);
        }
        const upperCaseText = osText.toUpperCase();
        console.log('[Extensão ATI] Iniciando preenchimento do formulário...');

        const selectedAttendant = localStorage.getItem('sgp_selected_attendant');
        if (selectedAttendant) {
            await setValueWithDelay('#id_responsavel', selectedAttendant, 50);
        }

        const contractOptions = $('#id_clientecontrato option').filter(function() {
            return $(this).val() !== '' && !$(this).text().toUpperCase().includes('CANCELADO');
        });

        if (contractOptions.length === 1) {
            await setValueWithDelay('#id_clientecontrato', contractOptions.val(), 50);
        } else if (contractOptions.length > 1) {
            const contracts = contractOptions.map(function() { return { id: $(this).val(), text: $(this).text() }; }).get();
            try {
                const selectedContractId = await promptForContractSelection(contracts);
                await setValueWithDelay('#id_clientecontrato', selectedContractId, 50);
            } catch (errorMsg) {
                showNotification(errorMsg, true);
                return;
            }
        }
        
        await setValueWithDelay('#id_setor', '2', 100);
        await setValueWithDelay('#id_metodo', '3', 100);
        await setValueWithDelay('#id_status', '1', 100);
        $('#id_data_agendamento').val(getCurrentFormattedDateTime());
        $('#id_os').prop('checked', false);
        $('#id_conteudo').val(upperCaseText);

        const isComprovante = upperCaseText.includes('ENVIO DE COMPROVANTE');
        const isPromessa = upperCaseText.includes('PROMESSA DE PAGAMENTO');
        const isSemAcesso = upperCaseText.includes('CLIENTE SEM ACESSO');
        const isLento = upperCaseText.includes('CLIENTE RELATA LENTIDÃO');
        if (isComprovante) await setValueWithDelay('#id_tipo', '42', 100);
        else if (isPromessa) await setValueWithDelay('#id_tipo', '41', 100);
        else if (isSemAcesso) await setValueWithDelay('#id_tipo', '1', 100);
        else if (isLento) await setValueWithDelay('#id_tipo', '3', 100);

        showNotification('[Extensão ATI] Formulário preenchido com sucesso!');
    } catch (error) {
        console.error('[Extensão ATI] Erro ao preencher formulário SGP:', error);
    }
}

async function handleManualFillClick() {
    console.log('[Extensão ATI] Botão de preenchimento manual clicado.');
    try {
        const clipboardText = await navigator.clipboard.readText();
        if (!clipboardText) {
            showNotification('A área de transferência está vazia.', true);
            return;
        }
        fillSgpForm(clipboardText);
    } catch (error) {
        console.error('[Extensão ATI] Falha ao ler da área de transferência:', error);
        showNotification('Falha ao ler da área de transferência. Verifique as permissões do navegador.', true);
    }
}

function injectSgpButton() {
    if (document.getElementById('fill-from-chatmix-btn')) return;
    const submitButton = document.getElementById('btacao');
    if (submitButton) {
        const customButton = document.createElement('input');
        customButton.id = 'fill-from-chatmix-btn';
        customButton.type = 'button';
        customButton.value = 'Preencher com Dados Copiados';
        customButton.className = 'button blue';
        customButton.style.marginLeft = '10px';
        customButton.addEventListener('click', handleManualFillClick);
        submitButton.parentNode.insertBefore(customButton, submitButton.nextSibling);
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "fillSgpForm") {
        console.log("[Extensão ATI] Preenchendo via mensagem (aba já aberta).");
        fillSgpForm(request.osText);
        sendResponse({ status: "Formulário preenchido." });
    }
    return true;
});

function injectAttendantSelector() {
    if (document.getElementById('attendant-selector-container')) return;
    const container = document.createElement('div');
    container.id = 'attendant-selector-container';
    container.style.cssText = 'position: absolute; top: 10px; right: 450px; z-index: 9999; display: flex; align-items: center; color: white;';
    const label = document.createElement('label');
    label.innerText = 'Atendente da Extensão:';
    label.style.marginRight = '10px';
    label.style.fontWeight = 'bold';
    const select = document.createElement('select');
    select.id = 'sgp-attendant-selector';
    select.style.padding = '5px';
    select.style.borderRadius = '4px';
    Object.keys(ATTENDANTS).forEach(name => {
        const option = document.createElement('option');
        option.value = ATTENDANTS[name];
        option.innerText = name;
        select.appendChild(option);
    });
    const savedAttendant = localStorage.getItem('sgp_selected_attendant');
    if (savedAttendant) {
        select.value = savedAttendant;
    } else {
        localStorage.setItem('sgp_selected_attendant', select.value);
    }
    select.addEventListener('change', () => {
        localStorage.setItem('sgp_selected_attendant', select.value);
    });
    container.appendChild(label);
    container.appendChild(select);
    document.getElementById('header-right').prepend(container);
}

async function initializeSgpScript() {
    injectSgpButton();
    injectAttendantSelector();
    
    const data = await chrome.storage.local.get('pendingOsText');
    if (data.pendingOsText) {
        console.log("[Extensão ATI] Texto de O.S. pendente encontrado. Preenchendo formulário.");
        await fillSgpForm(data.pendingOsText);
        chrome.storage.local.remove('pendingOsText');
    }
}

const readyCheckInterval = setInterval(() => {
    if (document.getElementById('btacao') && document.getElementById('header-right')) {
        clearInterval(readyCheckInterval);
        initializeSgpScript();
    }
}, 500);