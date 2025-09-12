// sgp.js - Versão com preenchimento padrão unificado (v11)

// --- CONFIGURAÇÃO DOS ATENDENTES ---
const ATTENDANTS = {
    'VICTORH': '99',
    'LUCASJ': '100',
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

/**
 * Função principal que lê os dados do clipboard e preenche o formulário.
 */
async function fillSgpForm() {
    try {
        const clipboardText = await navigator.clipboard.readText();
        if (!clipboardText) {
            return alert('[Extensão ATI] A área de transferência está vazia.');
        }

        const upperCaseText = clipboardText.toUpperCase();
        console.log('[Extensão ATI] Iniciando preenchimento manual...');

        // --- PREENCHIMENTO PADRÃO PARA TODOS OS FLUXOS ---
        
        // 1. Usuário/Responsável
        const selectedAttendant = localStorage.getItem('sgp_selected_attendant');
        if (selectedAttendant) {
            await setValueWithDelay('#id_responsavel', selectedAttendant, 50);
        }

        // 2. Contrato
        const validContracts = $('#id_clientecontrato option').filter(function() {
            return $(this).val() !== '' && !$(this).text().toUpperCase().includes('CANCELADO');
        });
        if (validContracts.length === 1) {
            await setValueWithDelay('#id_clientecontrato', validContracts.val(), 50);
        } else if (validContracts.length > 1) {
            alert('[Extensão ATI] Múltiplos contratos ativos. Selecione o correto manualmente.');
        }
        
        // 3. Setor, Método e Status (padrão para Suporte Técnico)
        await setValueWithDelay('#id_setor', '2', 100);    // Suporte Tecnico / Financeiro (usa o mesmo ID)
        await setValueWithDelay('#id_metodo', '3', 100);   // Suporte Online
        await setValueWithDelay('#id_status', '1', 100);   // Encerrada
        
        // 4. Data de Agendamento e Checkbox "Gerar O.S."
        $('#id_data_agendamento').val(getCurrentFormattedDateTime());
        $('#id_os').prop('checked', false);

        // 5. Conteúdo da Ocorrência
        $('#id_conteudo').val(upperCaseText);
        
        // --- LÓGICA ESPECÍFICA PARA O TIPO DE OCORRÊNCIA ---
        const isComprovante = upperCaseText.includes('ENVIO DE COMPROVANTE');
        const isPromessa = upperCaseText.includes('PROMESSA DE PAGAMENTO');
        const isSemAcesso = upperCaseText.includes('CLIENTE SEM ACESSO')

        if (isComprovante) {
            console.log('[Extensão ATI] Detectado fluxo de "Envio de Comprovante". Alterando tipo...');
            await wait(500); // Pausa estratégica para o SGP carregar os tipos do setor
            await setValueWithDelay('#id_tipo', '42', 100); // Financeiro - Comunicação de pagamento
        
        } else if (isPromessa) {
            console.log('[Extensão ATI] Detectado fluxo de "Promessa de Pagamento". Alterando tipo...');
            await wait(500); // Pausa estratégica
            await setValueWithDelay('#id_tipo', '41', 100); // Financeiro - Promessa de pagamento
        
        } else if (isSemAcesso) {
            console.log('[Extensão ATI] Detectado fluxo de "CLIENTE SEM ACESSO". Alterando tipo...');
            await wait(500);
            await setValueWithDelay('#id_tipo', 1);
            
        } else {
            console.log('[Extensão ATI] Fluxo padrão de O.S. (nenhum tipo específico será selecionado).');
            if (!clipboardText.includes(' | ')) {
                alert('O texto na área de transferência não parece ser uma O.S. válida.');
            }
        }

        console.log('[Extensão ATI] Preenchimento concluído!');

    } catch (error) {
        console.error('[Extensão ATI] Erro ao preencher formulário SGP:', error);
        alert('Ocorreu um erro ao tentar preencher o formulário.');
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

function injectSgpButton() {
    if (document.getElementById('fill-from-chatmix-btn')) return;
    
    const submitButton = document.getElementById('btacao');
    if (submitButton) {
        const customButton = document.createElement('input');
        customButton.id = 'fill-from-chatmix-btn';
        customButton.type = 'button';
        customButton.value = 'Preencher com Dados do Chatmix';
        customButton.className = 'button blue';
        customButton.style.marginLeft = '10px';
        customButton.addEventListener('click', fillSgpForm);
        submitButton.parentNode.insertBefore(customButton, submitButton.nextSibling);
    }
}

// Inicia o script injetando apenas os elementos manuais
const readyCheckInterval = setInterval(() => {
    if (document.getElementById('btacao') && document.getElementById('header-right')) {
        clearInterval(readyCheckInterval);
        injectSgpButton();
        injectAttendantSelector();
    }
}, 500);