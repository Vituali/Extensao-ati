// =================================================================================
// == CHATMIX.JS (VERSÃO REESCRITA E OTIMIZADA)                                    ==
// == Responsável por injetar e controlar a UI dentro do site Chatmix.          ==
// =================================================================================

import { showNotification, showOSModal } from './utils.js';
import { findCPF, applySiteTheme, processDynamicPlaceholders } from './logic.js';

// --- Estado Global e Seletores ---
const SELECTORS = {
    chatHeader: 'div.z-10 header',
    chatBody: 'div#attendanceMessages',
    messageContainer: 'div[id^="message-"]',
    messageParagraph: 'p.mensagem',
    sidebar: '.chat_sidebar',
    quickReplyContainer: '.flex-none.p-4.pb-6',
    textarea: 'textarea.chat_textarea',
    messageSentContainer: 'justify-end',
    messageReceivedContainer: 'justify-start',
    mainChatContainer: 'main.flex'
};

// NOVO: Um local central para guardar o texto original dos botões.
const BUTTON_ORIGINAL_TEXT = {
    'ati-copy-contact': '👤 Contato',
    'ati-copy-cpf': '📄 CPF',
    'ati-open-os': '📝 O.S',
    'ati-copy-prompt': '🤖 Chat',
    'ati-open-sgp': '↗️ SGP'
};

let osTemplates = [];
let persistentObserver;

// --- Funções de Extração de Dados (DOM) ---

function findActiveChatHeader() { return document.querySelector(SELECTORS.chatHeader); }
function findActiveChatBody() { return document.querySelector(SELECTORS.chatBody); }

function extractDataFromHeader() {
    const headerElement = findActiveChatHeader();
    if (!headerElement) return { firstName: "", fullName: "", phoneNumber: "" };
    const nameElement = headerElement.querySelector('h2.text-base');
    const phoneElement = headerElement.querySelector('span.text-sm');
    const fullName = nameElement ? (nameElement.textContent || "").trim() : "";
    const firstName = fullName ? fullName.split(' ')[0].toUpperCase() : "";
    let phoneNumber = "";
    if (phoneElement) {
        const phoneDigits = (phoneElement.textContent || "").replace(/\D/g, '');
        if (phoneDigits.startsWith('55') && (phoneDigits.length === 12 || phoneDigits.length === 13)) {
            const ddd = phoneDigits.substring(2, 4);
            const number = phoneDigits.substring(4);
            phoneNumber = `${ddd} ${number.slice(0, number.length - 4)}-${number.slice(number.length - 4)}`;
        } else if (phoneDigits.length === 10 || phoneDigits.length === 11) {
            const ddd = phoneDigits.substring(0, 2);
            const number = phoneDigits.substring(2);
            phoneNumber = `${ddd} ${number.slice(0, number.length - 4)}-${number.slice(number.length - 4)}`;
        } else {
            phoneNumber = phoneDigits;
        }
    }
    return { firstName, fullName, phoneNumber };
}

function collectTextFromMessages() {
    const chatBody = findActiveChatBody();
    if (!chatBody) return [];
    return Array.from(chatBody.querySelectorAll(SELECTORS.messageParagraph)).map(p => p.textContent.trim());
}

function extractAndFormatConversation() {
    const chatBody = findActiveChatBody();
    if (!chatBody) return "";
    const allMessageContainers = Array.from(chatBody.querySelectorAll(SELECTORS.messageContainer));
    const assignmentKeyword = "atendimento atribuído ao atendente";
    let conversationStarted = false;
    const relevantTexts = [];
    for (const container of allMessageContainers) {
        const messageTextElement = container.querySelector(SELECTORS.messageParagraph);
        if (!messageTextElement) continue;
        const text = messageTextElement.textContent.trim();
        if (text.toLowerCase().includes(assignmentKeyword)) {
            conversationStarted = true;
            relevantTexts.length = 0;
            continue;
        }
        if (conversationStarted) {
            const parentDiv = container.querySelector('.justify-start, .justify-end');
            if (parentDiv) {
                if (parentDiv.classList.contains(SELECTORS.messageSentContainer)) {
                     const cleanText = text.replace(/^[A-Z\s]+ disse:\s*/, '').trim();
                    relevantTexts.push(`ATENDENTE: ${cleanText}`);
                } else if (parentDiv.classList.contains(SELECTORS.messageReceivedContainer)) {
                    relevantTexts.push(`CLIENTE: ${text}`);
                }
            }
        }
    }
    return relevantTexts.slice(-10).join('\n');
}


// --- Funções de Ação dos Botões ---

// MODIFICADO: Função de feedback agora é mais robusta
function provideButtonFeedback(button, isSuccess) {
    if (!button) return;

    // Define o estado de feedback (checkmark ou X)
    button.innerHTML = isSuccess ? `<span>✔️</span>` : `<span>✖️</span>`;
    button.className = 'action-btn'; // Reseta para a classe base
    button.classList.add(isSuccess ? 'action-btn--success' : 'action-btn--error');

    // Após 1.5 segundos, restaura o botão para seu estado original
    setTimeout(() => {
        const originalText = BUTTON_ORIGINAL_TEXT[button.id];
        if (originalText) {
            button.innerHTML = originalText;
        }
        button.className = 'action-btn'; // Limpa as classes de sucesso/erro
        button.disabled = false; // Garante que o botão seja reativado
    }, 1500);
}


function copyContactInfo() {
    const button = document.getElementById('ati-copy-contact');
    const { firstName, phoneNumber } = extractDataFromHeader();
    const contactString = `${phoneNumber || ''} ${firstName || ''} |`.trim();
    if (contactString.length > 2) {
        navigator.clipboard.writeText(contactString)
            .then(() => {
                showNotification(`Contato copiado: ${contactString}`);
                provideButtonFeedback(button, true);
            })
            .catch(() => {
                showNotification("Erro ao copiar contato.", true);
                provideButtonFeedback(button, false);
            });
    } else {
        showNotification("Nome ou telefone não encontrado.", true);
        provideButtonFeedback(button, false);
    }
}

function copyCPFFromChat() {
    const button = document.getElementById('ati-copy-cpf');
    const foundCPF = findCPF(collectTextFromMessages());
    if (foundCPF) {
        navigator.clipboard.writeText(foundCPF)
            .then(() => {
                showNotification(`CPF/CNPJ copiado: ${foundCPF}`);
                provideButtonFeedback(button, true);
            })
            .catch(() => {
                showNotification("Erro ao copiar CPF!", true);
                provideButtonFeedback(button, false);
            });
    } else {
        showNotification("Nenhum CPF/CNPJ encontrado no chat!", true);
        provideButtonFeedback(button, false);
    }
}

function openOSModal() {
    const chatBody = findActiveChatBody();
    const chatHeader = findActiveChatHeader();
    if (!chatBody || !chatHeader) return showNotification("Nenhum chat ativo para criar O.S.", true);
    const clientData = extractDataFromHeader();
    clientData.cpfCnpj = findCPF(collectTextFromMessages());
    showOSModal({
        allTemplates: osTemplates,
        extractChatFn: collectTextFromMessages,
        clientData,
    });
}

// MODIFICADO: Lógica de carregamento agora está aqui
async function openInSgp() {
    const button = document.getElementById('ati-open-sgp');
    if (button.disabled) return; // Previne múltiplos cliques

    // Define o estado de carregando
    button.innerHTML = `<span>Buscando...</span>`;
    button.disabled = true;

    const clientData = extractDataFromHeader();
    clientData.cpfCnpj = findCPF(collectTextFromMessages());

    if (!clientData.cpfCnpj && !clientData.fullName && !clientData.phoneNumber) {
        showNotification("Nenhum dado (CPF, Nome ou Telefone) para buscar.", true);
        // Restaura o botão imediatamente em caso de erro
        provideButtonFeedback(button, false);
        return;
    }

    try {
        await chrome.storage.local.set(clientData);
        chrome.runtime.sendMessage({ action: "openInSgp" });
    } catch (error) {
        showNotification("Erro ao iniciar a busca no SGP.", true);
        provideButtonFeedback(button, false);
    }
}

async function handleCopyPromptClick() {
    const button = document.getElementById('ati-copy-prompt');
    const conversation = extractAndFormatConversation();
    if (!conversation) {
        showNotification("Não há conversa suficiente para gerar um prompt.", true);
        provideButtonFeedback(button, false);
        return;
    }
    const prompt = `
Você é um atendente de suporte da empresa 'ATI Internet'.
Sua resposta deve ser profissional, amigável e resolver o problema do cliente.
---
REGRAS IMPORTANTES:
1. Gere respostas CURTAS e DIRETAS, ideais para um chat.
2. Se uma explicação for longa, divida-a em 2 mensagens curtas e sequenciais.
---
CONVERSA COM O CLIENTE:
${conversation}
---
Sugira a resposta ideal seguindo TODAS as regras:
    `;
    try {
        await navigator.clipboard.writeText(prompt.trim());
        showNotification("✅ Prompt para IA copiado!", false);
        provideButtonFeedback(button, true);
    } catch (error) {
        showNotification("Falha ao copiar o prompt.", true);
        provideButtonFeedback(button, false);
    }
}


// --- Funções de Renderização da UI ---

function insertReplyText(text) {
    const textarea = document.querySelector(SELECTORS.textarea);
    if (textarea) {
        textarea.value = processDynamicPlaceholders(text);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.focus();
    }
}

function renderReplyUI(container, groupedReplies, activeCategory = null) {
    container.innerHTML = '';
    if (activeCategory && groupedReplies[activeCategory]) {
        const backButton = document.createElement('button');
        backButton.className = 'qr-btn qr-btn--back';
        backButton.textContent = '↩️ Voltar';
        backButton.addEventListener('click', (event) => {
            event.stopPropagation();
            renderReplyUI(container, groupedReplies, null);
        });
        container.appendChild(backButton);
        groupedReplies[activeCategory].forEach(reply => {
            const button = document.createElement('button');
            button.className = 'qr-btn';
            button.textContent = reply.title;
            button.title = reply.text;
            button.onclick = () => insertReplyText(reply.text);
            container.appendChild(button);
        });
    } else {
        Object.keys(groupedReplies).forEach(subCategory => {
            const button = document.createElement('button');
            button.className = 'qr-btn qr-btn--category';
            button.textContent = subCategory;
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                renderReplyUI(container, groupedReplies, subCategory);
            });
            container.appendChild(button);
        });
    }
}

function injectUIElements() {
    const sidebar = document.querySelector(SELECTORS.sidebar);
    if (sidebar && !document.getElementById('actionsContainerV2')) {
        const container = document.createElement("div");
        container.id = "actionsContainerV2";
        sidebar.appendChild(container);
        container.innerHTML = `
            <button class="action-btn" id="ati-copy-contact">${BUTTON_ORIGINAL_TEXT['ati-copy-contact']}</button>
            <button class="action-btn" id="ati-copy-cpf">${BUTTON_ORIGINAL_TEXT['ati-copy-cpf']}</button>
            <button class="action-btn" id="ati-open-os">${BUTTON_ORIGINAL_TEXT['ati-open-os']}</button>
            <button class="action-btn" id="ati-copy-prompt">${BUTTON_ORIGINAL_TEXT['ati-copy-prompt']}</button>
            <button class="action-btn" id="ati-open-sgp">${BUTTON_ORIGINAL_TEXT['ati-open-sgp']}</button>
        `;
        document.getElementById('ati-copy-contact').onclick = copyContactInfo;
        document.getElementById('ati-copy-cpf').onclick = copyCPFFromChat;
        document.getElementById('ati-open-os').onclick = openOSModal;
        document.getElementById('ati-copy-prompt').onclick = handleCopyPromptClick;
        document.getElementById('ati-open-sgp').onclick = openInSgp;
    }

    const injectionParent = document.querySelector(SELECTORS.quickReplyContainer);
    if (injectionParent && !document.getElementById('atiQuickRepliesContainerV2')) {
        const quickReplies = osTemplates.filter(t => t.category === 'quick_reply');
        if (quickReplies.length > 0) {
            const repliesByCategory = quickReplies.reduce((acc, reply) => {
                const key = reply.subCategory || 'Geral';
                (acc[key] = acc[key] || []).push(reply);
                return acc;
            }, {});
            const buttonContainer = document.createElement('div');
            buttonContainer.id = 'atiQuickRepliesContainerV2';
            buttonContainer.className = 'quick-replies-container';
            injectionParent.prepend(buttonContainer);
            renderReplyUI(buttonContainer, repliesByCategory, null);
        }
    }
}

async function reloadAndInject() {
    osTemplates = await new Promise(resolve => {
        chrome.runtime.sendMessage({ action: "getTemplates" }, response => {
            resolve(response || []);
        });
    });
    document.getElementById('actionsContainerV2')?.remove();
    document.getElementById('atiQuickRepliesContainerV2')?.remove();
    injectUIElements();
}

// --- Ponto de Entrada e Listeners ---

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "reloadTemplates") {
        console.log("ATI Extensão: Recarregando templates e re-injetando UI.");
        reloadAndInject();
        sendResponse({ status: "Templates recarregados." });
    } else if (request.action === "applyTheme") {
        console.log("ATI Extensão: Aviso para aplicar tema recebido.");
        applySiteTheme();
        sendResponse({ status: "Tema aplicado." });
    } else if (request.action === "executeCopy") {
        copyContactInfo();
    }
    // MODIFICADO: Recebe a resposta do background e finaliza o feedback
    else if (request.action === "sgpSearchComplete") {
        const button = document.getElementById('ati-open-sgp');
        if (button) {
            provideButtonFeedback(button, request.success);
        }
    }
    // Adicione um else if para "sgpCreateComplete" se o botão da modal também precisar disso
    return true;
});


(async function main() {
    applySiteTheme();
    await reloadAndInject();
    const observerCallback = () => injectUIElements();
    persistentObserver = new MutationObserver(observerCallback);
    const MAX_ATTEMPTS = 50;
    let attempts = 0;
    function setupObserver() {
        const targetNode = document.querySelector(SELECTORS.mainChatContainer);
        if (targetNode) {
            console.log("ATI Extensão: Observador inteligente ativado em um alvo específico.");
            persistentObserver.observe(targetNode, { childList: true });
            return;
        }
        attempts++;
        if (attempts < MAX_ATTEMPTS) {
            setTimeout(setupObserver, 100);
        } else {
            console.warn("ATI Extensão: Alvo específico não encontrado após 5 segundos. Usando observador genérico (menos otimizado).");
            persistentObserver.observe(document.body, { childList: true, subtree: true });
        }
    }
    setupObserver();
})();

