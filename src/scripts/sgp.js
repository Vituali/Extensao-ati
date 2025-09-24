import { applySiteTheme } from './logic.js';
import { showNotification } from './utils.js';

// --- Funções Auxiliares ---

const setValue = (selector, value) => {
    const element = document.querySelector(selector);
    if (element) {
        element.value = value;
        element.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
        console.warn(`ATI Extensão: Campo '${selector}' não encontrado.`);
    }
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

/**
 * Preenche o formulário do SGP de forma automática.
 * @param {string} osText - O texto da O.S. a ser inserido.
 */
// Substitua a função original por esta versão async atualizada
async function fillSgpForm(osText) {
    if (!osText) return showNotification('Nenhum texto de O.S. para preencher.', true);

    try {
        const { atendenteAtual } = await chrome.storage.local.get('atendenteAtual');
        if (!atendenteAtual) {
            return showNotification('Nenhum atendente logado no painel ATI. Faça o login para continuar.', true);
        }
        
        const currentUser = atendenteAtual.toLowerCase();
        
        // Extrai os usuários diretamente do dropdown na página do SGP
        const responsibleUsers = [];
        document.querySelectorAll('#id_responsavel option').forEach(option => {
            if (option.value) { // Ignora a primeira opção vazia
                responsibleUsers.push({
                    id: option.value,
                    username: option.textContent.trim().toLowerCase()
                });
            }
        });

        const responsibleUser = responsibleUsers.find(user => user.username === currentUser);
        const sgpId = responsibleUser ? responsibleUser.id : null;

        if (!sgpId) {
            return showNotification(`ID do SGP para '${atendenteAtual}' não foi encontrado no dropdown de Responsáveis.`, true);
        }

        console.log(`ATI Extensão: Preenchendo formulário para ${atendenteAtual} (ID: ${sgpId})`);
        
        // Preenchimento automático dos campos
        setValue('#id_responsavel', sgpId);
        setValue('#id_setor', '2'); // Suporte Tecnico
        setValue('#id_metodo', '3'); // Suporte Online
        setValue('#id_status', '1'); // Encerrada
        setValue('#id_conteudo', osText.toUpperCase());
        
        const agendamentoInput = document.querySelector('#id_data_agendamento');
        if (agendamentoInput) {
            agendamentoInput.value = getCurrentFormattedDateTime();
        }

        const allContractOptions = Array.from(document.querySelectorAll('#id_clientecontrato option'));
        const activeContracts = allContractOptions.filter(opt => opt.value !== '' && !opt.textContent.toUpperCase().includes('CANCELADO'));
        if (activeContracts.length === 1) {
            setValue('#id_clientecontrato', activeContracts[0].value);
        }
        
        const osCheckbox = document.querySelector('#id_os');
        if (osCheckbox) osCheckbox.checked = false;

        const upperCaseText = osText.toUpperCase();
        if (upperCaseText.includes('ENVIO DE COMPROVANTE')) setValue('#id_tipo', '42');
        else if (upperCaseText.includes('PROMESSA DE PAGAMENTO')) setValue('#id_tipo', '41');
        else if (upperCaseText.includes('CLIENTE SEM ACESSO')) setValue('#id_tipo', '1');
        else if (upperCaseText.includes('CLIENTE RELATA LENTIDÃO')) setValue('#id_tipo', '3');
        
        showNotification('Formulário preenchido com sucesso!');
    } catch (error) {
        console.error('ATI Extensão: Erro ao preencher formulário SGP:', error);
        showNotification('Ocorreu um erro ao preencher o formulário.', true);
    }
}

/**
 * Lida com o clique no botão de preenchimento manual (copiar/colar).
 */
async function handleManualFillClick() {
    try {
        const clipboardText = await navigator.clipboard.readText();
        if (!clipboardText) {
            return showNotification('A área de transferência está vazia.', true);
        }
        fillSgpForm(clipboardText);
    } catch (error) {
        showNotification('Falha ao ler da área de transferência.', true);
    }
}

// --- Injeção e Inicialização ---

/**
 * Injeta o botão "Preencher com Dados Copiados" na página.
 */
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

/**
 * Ponto de entrada do script.
 */
async function initializeSgpScript() {
    applySiteTheme();
    injectSgpButton();
    const { pendingOsText } = await chrome.storage.local.get('pendingOsText');
    if (pendingOsText) {
        console.log("ATI Extensão: O.S. pendente encontrada. Preenchende...");
        await fillSgpForm(pendingOsText);
        chrome.storage.local.remove('pendingOsText');
    }
}

// Garante que o script só rode quando a página estiver pronta
const readyCheckInterval = setInterval(() => {
    if (document.getElementById('header-right')) {
        clearInterval(readyCheckInterval);
        initializeSgpScript();
    }
}, 200);

