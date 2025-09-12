// v1.js - SCRIPT DE UI PARA CHATMIX V1 - ATI EXTENSÃO

const V1_TEXTAREA_SELECTOR = 'textarea[placeholder="Digite aqui sua mensagem..."]';
var osTemplates = []; // Esta variável será preenchida pelo runExtension() em content.js

// ===================================================================================
// LÓGICA DE "SEQUESTRO" DO MODAL NATIVO (Específica da V1)
// ===================================================================================

function selectReplyAndClose(text) {
    const activeChat = findActiveAttendanceElement();
    if (!activeChat) return;
    const textarea = activeChat.querySelector(V1_TEXTAREA_SELECTOR);
    if (textarea) {
        textarea.value = processDynamicPlaceholders(text);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.focus();
    }
    const closeButton = document.querySelector('.modal_msg_model .modal-footer a.button');
    if (closeButton) {
        closeButton.click();
    }
}

function rebuildNativeModal(modal) {
    const quickReplies = osTemplates.filter(t => t.category === 'quick_reply');
    if (quickReplies.length === 0) return;
    const titleElement = modal.querySelector('.modal-header h1');
    const listElement = modal.querySelector('.modal-content ul');
    if (!titleElement || !listElement) return;

    titleElement.textContent = 'Respostas Rápidas (Extensão)';
    modal.querySelector('.modal-header p.tagline')?.remove();
    modal.querySelector('.modal-content mark')?.remove();
    listElement.innerHTML = '';

    const repliesByCategory = quickReplies.reduce((acc, reply) => {
        const subCategory = reply.subCategory || 'Geral';
        if (!acc[subCategory]) acc[subCategory] = [];
        acc[subCategory].push(reply);
        return acc;
    }, {});

    for (const subCategory in repliesByCategory) {
        const categoryTitle = document.createElement('li');
        categoryTitle.innerHTML = `<b>${subCategory}</b>`;
        listElement.appendChild(categoryTitle);
        repliesByCategory[subCategory].forEach(reply => {
            const listItem = document.createElement('li');
            const paragraph = document.createElement('p');
            paragraph.className = 'message_model';
            paragraph.textContent = reply.title;
            paragraph.title = reply.text;
            paragraph.onclick = (event) => {
                event.stopPropagation();
                event.preventDefault();
                selectReplyAndClose(reply.text);
            };
            listItem.appendChild(paragraph);
            listElement.appendChild(listItem);
        });
    }
}

function initializeModalHijacker() {
    const nativeModalSelector = 'section[data-modal="msg_model"]';
    let isHijacked = false;
    const observer = new MutationObserver((mutationsList) => {
        for (const mutation of mutationsList) {
            if (mutation.attributeName === 'style') {
                const modal = document.querySelector(nativeModalSelector);
                if (modal && modal.style.display !== 'none' && !isHijacked) {
                    isHijacked = true;
                    rebuildNativeModal(modal);
                } else if (modal && modal.style.display === 'none') {
                    isHijacked = false;
                }
            }
        }
    });
    const modalNode = document.querySelector(nativeModalSelector);
    if (modalNode) {
        observer.observe(modalNode, { attributes: true, attributeFilter: ['style'] });
        console.log("ATI Extensão (V1): 'Sequestrador de Modal' inicializado.");
    }
}

// ===================================================================================
// FUNÇÕES PRINCIPAIS DA EXTENSÃO (Específicas da V1)
// ===================================================================================

function showOSModalV1() {
    showOSModal({
        modalId: 'osModal',
        chatHeader: findActiveChatHeader(),
        chatBody: findActiveChatBody(),
        allTemplates: osTemplates,
        extractDataFn: extractDataFromHeader,
        extractChatFn: extractClientChatAfterAssignment
    });
}

function createActionsContainer() {
    if (document.getElementById("actionsContainer")) return;
    const container = document.createElement("div");
    container.id = "actionsContainer";
    getOrCreateExtensionContainer().appendChild(container);
}

function initializeActions() {
    if (!document.getElementById("actionsContainer")) {
        createActionsContainer();
    }
    const container = document.getElementById("actionsContainer");
    if (!container || container.childElementCount > 0) return;
    container.innerHTML = `
        <button class="action-btn action-btn--contact">Copiar Contato</button>
        <button class="action-btn action-btn--cpf">Copiar CPF</button>
        <button class="action-btn action-btn--os">Criar O.S.</button>
    `;
    container.querySelector('.action-btn--contact').onclick = copyContactInfo;
    container.querySelector('.action-btn--cpf').onclick = copyCPFFromChat;
    container.querySelector('.action-btn--os').onclick = showOSModalV1;
}

function copyContactInfo() {
  const header = findActiveChatHeader();
  if (!header) { showNotification("Nenhum chat ativo encontrado!", true); return; }
  const { firstName, phoneNumber } = extractDataFromHeader(header);
  if (phoneNumber || firstName) {
    const contactString = `${phoneNumber || ''} ${firstName || ''} |`.trim();
    navigator.clipboard.writeText(contactString)
        .then(() => showNotification(`Contato copiado: ${contactString}`))
        .catch(err => showNotification("Erro ao copiar dados!", true));
  } else {
    showNotification("Nenhum nome ou telefone encontrado no cabeçalho!", true);
  }
}

function copyCPFFromChat() {
    const chatBody = findActiveChatBody();
    if (!chatBody) { showNotification("Nenhum chat ativo encontrado!", true); return; }
    const allMessageTexts = collectTextFromMessages(chatBody);
    const foundCPF = findCPF(allMessageTexts);
    if (foundCPF) {
        navigator.clipboard.writeText(foundCPF)
            .then(() => showNotification(`CPF/CNPJ copiado: ${foundCPF}`))
            .catch(err => showNotification("Erro ao copiar CPF!", true));
    } else {
        showNotification("Nenhum CPF/CNPJ encontrado nas mensagens do chat!", true);
    }
}
