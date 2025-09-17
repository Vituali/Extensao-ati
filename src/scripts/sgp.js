import { showNotification, createModal } from './utils.js';

const ATTENDANTS = {
    'VICTORH': '99',
    'LUCASJ': '100',
    'HELIO': '77',
    'IGORMAGALHAES': '68',
    'JEFFERSON': '62',
};

// --- Funções Auxiliares ---

const setValue = (selector, value) => {
    return new Promise(resolve => {
        setTimeout(() => {
            try {
                const element = document.querySelector(selector);
                if (element) {
                    element.value = value;
                    element.dispatchEvent(new Event('change', { bubbles: true }));
                }
            } catch (error) {
                console.error(`ATI Extensão: Erro ao preencher o campo ${selector}:`, error);
            }
            resolve();
        }, 50);
    });
};

function getCurrentFormattedDateTime() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
}

async function promptForContractSelection(contracts) {
    const contractDetailPromises = contracts.map(async (contract) => {
        try {
            const servicesResponse = await fetch(`/admin/clientecontrato/servico/list/ajax/?contrato_id=${contract.id}`);
            const services = await servicesResponse.json();
            let enrichedText = contract.text;
            if (services && services.length > 0) {
                const primaryServiceId = services[0].id;
                const detailsResponse = await fetch(`/admin/atendimento/ocorrencia/servico/detalhe/ajax/?servico_id=${primaryServiceId}&contrato_id=${contract.id}`);
                const details = await detailsResponse.json();
                if (details && details.length > 0 && details[0]?.end_instalacao) {
                    enrichedText += ` <br><b>Endereço:</b> ${details[0].end_instalacao}`;
                }
            }
            return { id: contract.id, text: enrichedText };
        } catch (error) {
            return { ...contract };
        }
    });
    const enrichedContracts = await Promise.all(contractDetailPromises);
    const contractOptionsHTML = enrichedContracts.map((contract, index) => `
        <label class="template-btn" style="display: block; text-align: left; margin-bottom: 8px; padding: 10px;">
            <input type="radio" name="selected_contract" value="${contract.id}" ${index === 0 ? 'checked' : ''}>
            <span style="vertical-align: middle;">${contract.text}</span>
        </label>
    `).join('');
    const modalConfig = {
        title: 'Selecione o Contrato',
        bodyHTML: `<p>Este cliente possui múltiplos contratos ativos. Escolha o correto.</p><div style="margin-top: 15px;">${contractOptionsHTML}</div>`,
        footerButtons: [
            { text: 'Cancelar', className: 'main-btn--cancel', value: 'cancel' },
            { text: 'Confirmar', className: 'main-btn--confirm', value: 'confirm' }
        ]
    };
    try {
        const result = await createModal(modalConfig);
        if (result.action === 'confirm' && result.data.selectedValue) return result.data.selectedValue;
        throw new Error('Nenhum contrato selecionado.');
    } catch (error) {
        throw new Error('Seleção de contrato cancelada.');
    }
}

async function fillSgpForm(osText) {
    try {
        if (!osText) return showNotification('Nenhum texto de O.S. para preencher.', true);
        const upperCaseText = osText.toUpperCase();
        console.log('ATI Extensão: Preenchendo formulário SGP...');
        const selectedAttendant = localStorage.getItem('sgp_selected_attendant');
        if (selectedAttendant) await setValue('#id_responsavel', selectedAttendant);
        const allContractOptions = Array.from(document.querySelectorAll('#id_clientecontrato option'));
        const activeContracts = allContractOptions.filter(opt => opt.value !== '' && !opt.textContent.toUpperCase().includes('CANCELADO'));
        if (activeContracts.length === 1) {
            await setValue('#id_clientecontrato', activeContracts[0].value);
        } else if (activeContracts.length > 1) {
            const contractsForModal = activeContracts.map(opt => ({ id: opt.value, text: opt.textContent }));
            try {
                const selectedContractId = await promptForContractSelection(contractsForModal);
                await setValue('#id_clientecontrato', selectedContractId);
            } catch (error) {
                showNotification(error.message, true);
                return;
            }
        }
        await setValue('#id_setor', '2');
        await setValue('#id_metodo', '3');
        await setValue('#id_status', '1');
        document.querySelector('#id_data_agendamento').value = getCurrentFormattedDateTime();
        const osCheckbox = document.querySelector('#id_os');
        if (osCheckbox) osCheckbox.checked = false;
        document.querySelector('#id_conteudo').value = upperCaseText;
        if (upperCaseText.includes('ENVIO DE COMPROVANTE')) await setValue('#id_tipo', '42');
        else if (upperCaseText.includes('PROMESSA DE PAGAMENTO')) await setValue('#id_tipo', '41');
        else if (upperCaseText.includes('CLIENTE SEM ACESSO')) await setValue('#id_tipo', '1');
        else if (upperCaseText.includes('CLIENTE RELATA LENTIDÃO')) await setValue('#id_tipo', '3');
        showNotification('Formulário preenchido com sucesso!');
    } catch (error) {
        console.error('ATI Extensão: Erro ao preencher formulário SGP:', error);
        showNotification('Ocorreu um erro ao preencher o formulário.', true);
    }
}

// [RESTAURADO] Função para o botão de preenchimento manual
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
        showNotification('Falha ao ler da área de transferência. Verifique as permissões.', true);
    }
}

// --- Injeção e Inicialização ---

// [RESTAURADO] Função que injeta o botão manual
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
    const headerRight = document.getElementById('header-right');
    if (!headerRight) return;
    const container = document.createElement('div');
    container.id = 'attendant-selector-container';
    container.style.cssText = 'position: absolute; top: 10px; right: 450px; z-index: 9999; display: flex; align-items: center; color: white; font-family: Arial, sans-serif;';
    const label = document.createElement('label');
    label.innerText = 'Atendente:';
    label.style.marginRight = '8px';
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
    if (savedAttendant) select.value = savedAttendant;
    else localStorage.setItem('sgp_selected_attendant', select.value);
    select.addEventListener('change', () => {
        localStorage.setItem('sgp_selected_attendant', select.value);
        showNotification(`Atendente padrão definido como: ${select.options[select.selectedIndex].text}`);
    });
    container.appendChild(label);
    container.appendChild(select);
    headerRight.prepend(container);
}

async function initializeSgpScript() {
    injectSgpButton(); // [RESTAURADO] Chamada para a função
    injectAttendantSelector();
    
    const data = await chrome.storage.local.get('pendingOsText');
    if (data.pendingOsText) {
        console.log("ATI Extensão: Texto de O.S. pendente encontrado. Preenchendo...");
        await fillSgpForm(data.pendingOsText);
        chrome.storage.local.remove('pendingOsText');
    }
}

const readyCheckInterval = setInterval(() => {
    if (document.getElementById('header-right')) {
        clearInterval(readyCheckInterval);
        initializeSgpScript();
    }
}, 200);