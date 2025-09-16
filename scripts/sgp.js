// ===================================================================
// == SGP.JS - (VERSÃO FINAL COM LEITURA CORRETA DO ENDEREÇO)       ==
// ===================================================================

const ATTENDANTS = {
    'VICTORH': '99',
    'LUCASJ': '100',
    'HELIO': '77',
    'IGORMAGALHAES': '68',
    'JEFFERSON': '62',
};

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
                const element = document.querySelector(selector);
                if (element) {
                    element.value = value;
                    const event = new Event('change', { bubbles: true });
                    element.dispatchEvent(event);
                }
                resolve();
            } catch (error) {
                console.error(`ATI Extensão: Erro ao preencher o campo ${selector}:`, error);
                resolve();
            }
        }, delay);
    });
};

/**
 * [CORRIGIDO] Pede ao usuário que selecione um contrato, buscando o endereço de INSTALAÇÃO correto.
 * @param {Array<{id: string, text: string}>} contracts - Lista de contratos disponíveis.
 * @returns {Promise<string>} - O ID do contrato selecionado.
 */
async function promptForContractSelection(contracts) {
    // ## INÍCIO DA CORREÇÃO ##
    // A lógica agora faz 2 chamadas: 1 para pegar o serviço, e outra para pegar o endereço do serviço.
    const contractDetailPromises = contracts.map(async (contract) => {
        try {
            // Passo 1: Buscar a lista de serviços para o contrato.
            const servicesResponse = await fetch(`/admin/clientecontrato/servico/list/ajax/?contrato_id=${contract.id}`);
            const services = await servicesResponse.json();

            let enrichedText = contract.text; // Começa com o texto original

            // Se houver serviços, pega o primeiro e busca seus detalhes.
            if (services && services.length > 0) {
                const primaryServiceId = services[0].id;
                const detailsResponse = await fetch(`/admin/atendimento/ocorrencia/servico/detalhe/ajax/?servico_id=${primaryServiceId}&contrato_id=${contract.id}`);
                const details = await detailsResponse.json();

                // Se os detalhes contiverem o endereço de instalação, adicione-o.
                if (details && details.length > 0 && details[0] && details[0].end_instalacao) {
                    const address = details[0].end_instalacao;
                    enrichedText += ` <br><b>Endereço:</b> ${address}`;
                }
            }
            
            return { id: contract.id, text: enrichedText };

        } catch (error) {
            console.error(`ATI Extensão: Falha ao buscar detalhes para o contrato ${contract.id}`, error);
            // Em caso de erro, retorna o texto original sem endereço.
            return { ...contract };
        }
    });

    // Espera todas as buscas terminarem.
    const enrichedContracts = await Promise.all(contractDetailPromises);
    // ## FIM DA CORREÇÃO ##

    const contractOptionsHTML = enrichedContracts.map((contract, index) => `
        <label class="template-btn" style="display: block; text-align: left; margin-bottom: 8px; padding: 10px;">
            <input type="radio" name="selected_contract" value="${contract.id}" ${index === 0 ? 'checked' : ''}>
            <span style="vertical-align: middle;">${contract.text}</span>
        </label>
    `).join('');

    const modalConfig = {
        title: 'Selecione o Contrato Correto',
        bodyHTML: `
            <p>Este cliente possui múltiplos contratos ativos. Por favor, escolha qual deles deve ser associado a esta ocorrência.</p>
            <div style="margin-top: 15px;">${contractOptionsHTML}</div>
        `,
        footerButtons: [
            { text: 'Cancelar', className: 'main-btn--cancel', value: 'cancel' },
            { text: 'Confirmar', className: 'main-btn--confirm', value: 'confirm' }
        ]
    };
    
    try {
        const result = await createModal(modalConfig);
        if (result.action === 'confirm' && result.data.selectedValue) {
            return result.data.selectedValue;
        } else {
            throw new Error('Nenhum contrato foi selecionado.');
        }
    } catch (error) {
        throw new Error('Seleção de contrato cancelada pelo usuário.');
    }
}


async function fillSgpForm(osText) {
    try {
        if (!osText) {
            return showNotification('ATI Extensão: Nenhum texto de O.S. para preencher.', true);
        }
        const upperCaseText = osText.toUpperCase();
        console.log('ATI Extensão: Iniciando preenchimento do formulário...');

        const selectedAttendant = localStorage.getItem('sgp_selected_attendant');
        if (selectedAttendant) {
            await setValueWithDelay('#id_responsavel', selectedAttendant, 50);
        }

        const allContractOptions = Array.from(document.querySelectorAll('#id_clientecontrato option'));
        const activeContracts = allContractOptions.filter(option => {
            return option.value !== '' && !option.textContent.toUpperCase().includes('CANCELADO');
        });

        if (activeContracts.length === 1) {
            await setValueWithDelay('#id_clientecontrato', activeContracts[0].value, 50);
        } else if (activeContracts.length > 1) {
            const contractsForModal = activeContracts.map(option => ({ id: option.value, text: option.textContent }));
            try {
                const selectedContractId = await promptForContractSelection(contractsForModal);
                await setValueWithDelay('#id_clientecontrato', selectedContractId, 50);
            } catch (errorMsg) {
                showNotification(errorMsg.message, true);
                return;
            }
        }
        
        await setValueWithDelay('#id_setor', '2', 100);
        await setValueWithDelay('#id_metodo', '3', 100);
        await setValueWithDelay('#id_status', '1', 100);
        
        document.querySelector('#id_data_agendamento').value = getCurrentFormattedDateTime();
        
        const osCheckbox = document.querySelector('#id_os');
        if (osCheckbox) osCheckbox.checked = false;

        document.querySelector('#id_conteudo').value = upperCaseText;

        const isComprovante = upperCaseText.includes('ENVIO DE COMPROVANTE');
        const isPromessa = upperCaseText.includes('PROMESSA DE PAGAMENTO');
        const isSemAcesso = upperCaseText.includes('CLIENTE SEM ACESSO');
        const isLento = upperCaseText.includes('CLIENTE RELATA LENTIDÃO');

        if (isComprovante) await setValueWithDelay('#id_tipo', '42', 100);
        else if (isPromessa) await setValueWithDelay('#id_tipo', '41', 100);
        else if (isSemAcesso) await setValueWithDelay('#id_tipo', '1', 100);
        else if (isLento) await setValueWithDelay('#id_tipo', '3', 100);

        showNotification('ATI Extensão: Formulário preenchido com sucesso!');
    } catch (error) {
        console.error('ATI Extensão: Erro ao preencher formulário SGP:', error);
    }
}

async function handleManualFillClick() {
    console.log('ATI Extensão: Botão de preenchimento manual clicado.');
    try {
        const clipboardText = await navigator.clipboard.readText();
        if (!clipboardText) {
            showNotification('A área de transferência está vazia.', true);
            return;
        }
        fillSgpForm(clipboardText);
    } catch (error) {
        console.error('ATI Extensão: Falha ao ler da área de transferência:', error);
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
        console.log("ATI Extensão: Texto de O.S. pendente encontrado. Preenchendo formulário.");
        await fillSgpForm(data.pendingOsText);
        chrome.storage.local.remove('pendingOsText');
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "fillSgpForm") {
        console.log("ATI Extensão: Preenchendo via mensagem (aba já aberta).");
        fillSgpForm(request.osText);
        sendResponse({ status: "Formulário preenchido." });
    }
    return true;
});

const readyCheckInterval = setInterval(() => {
    const submitBtn = document.getElementById('btacao');
    const headerRight = document.getElementById('header-right');
    if (submitBtn && headerRight) {
        clearInterval(readyCheckInterval);
        initializeSgpScript();
    }
}, 500);