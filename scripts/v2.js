// v2.js - Versão Final Corrigida (v14)

const SELECTORS = {
    chatHeader: 'div.z-10 header',
    chatBody: 'div#attendanceMessages',
    messageContainer: 'div[id^="message-"]',
    messageParagraph: 'p.mensagem',
    messageSentContainer: 'justify-end',
    messageReceivedContainer: 'justify-start',
    sidebar: '.chat_sidebar',
    quickReplyContainer: '.flex-none.p-4.pb-6',
    textarea: 'textarea.chat_textarea',
    mainChatContent: '.chat_content'
};

console.log("ATI Extensão: Script V2 carregado!");

var osTemplates = [];

// --- Funções de Lógica da Interface ---

function findActiveChatHeaderV2() {
    return document.querySelector(SELECTORS.chatHeader);
}

function findActiveChatBodyV2() {
    return document.querySelector(SELECTORS.chatBody);
}

function provideButtonFeedback(button, isSuccess) {
    if (!button) return;
    const originalContent = button.innerHTML;
    const originalClasses = button.className;
    button.innerHTML = isSuccess ? `<span>✔️</span>` : `<span>✖️</span>`;
    button.classList.add(isSuccess ? 'action-btn--success' : 'action-btn--error');
    setTimeout(() => {
        button.innerHTML = originalContent;
        button.className = originalClasses;
    }, 1500);
}

function extractDataFromHeaderV2(headerElement) {
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

function collectTextFromMessagesV2(chatBody) {
    const texts = [];
    if (!chatBody) return texts;
    chatBody.querySelectorAll(SELECTORS.messageParagraph).forEach(p => {
        texts.push(p.textContent.trim());
    });
    return texts;
}

function extractAndFormatConversationV2(chatBody) {
    if (!chatBody) return "";
    const allMessageContainers = Array.from(chatBody.querySelectorAll(SELECTORS.messageContainer));
    const assignmentKeyword = "atendimento atribuído ao atendente";
    let conversationStarted = false;
    const relevantTexts = [];
    for (const container of allMessageContainers) {
        const messageTextElement = container.querySelector(SELECTORS.messageParagraph);
        if (!messageTextElement) continue;
        const text = messageTextElement.textContent.trim();
        const lowerCaseText = text.toLowerCase();
        if (lowerCaseText.includes(assignmentKeyword)) {
            conversationStarted = true;
            continue;
        }
        if (conversationStarted) {
            const parentJustifyDiv = container.querySelector('.justify-start, .justify-end');
            if (parentJustifyDiv) {
                if (parentJustifyDiv.classList.contains(SELECTORS.messageSentContainer)) {
                    const cleanText = text.replace(/^[A-Z\s]+ disse:\s*/, '').trim();
                    relevantTexts.push(`ATENDENTE: ${cleanText}`);
                } else if (parentJustifyDiv.classList.contains(SELECTORS.messageReceivedContainer)) {
                    relevantTexts.push(`CLIENTE: ${text}`);
                }
            }
        }
    }
    if (!conversationStarted && allMessageContainers.length > 0) {
        return allMessageContainers.slice(-10).map(m => m.querySelector(SELECTORS.messageParagraph)?.textContent.trim() || '').join('\n');
    }
    return relevantTexts.join('\n');
}

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
            requestAnimationFrame(() => {
                renderReplyUI(container, groupedReplies, null);
            });
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
                requestAnimationFrame(() => {
                    renderReplyUI(container, groupedReplies, subCategory);
                });
            });
            container.appendChild(button);
        });
    }
}

function copyContactInfoV2() {
    const button = document.querySelector('#actionsContainerV2 .action-btn--contact');
    const header = findActiveChatHeaderV2();
    if (!header) {
        showNotification("Nenhum chat ativo para copiar contato.", true);
        provideButtonFeedback(button, false);
        return;
    }
    const { firstName, phoneNumber } = extractDataFromHeaderV2(header);
    const contactString = `${phoneNumber || ''} ${firstName || ''} |`.trim();
    if (contactString.length > 2) {
        navigator.clipboard.writeText(contactString).then(() => {
            showNotification(`Contato copiado: ${contactString}`);
            provideButtonFeedback(button, true);
        }).catch(err => {
            showNotification("Erro ao copiar para a área de transferência.", true);
            provideButtonFeedback(button, false);
        });
    } else {
        showNotification("Nome ou telefone não encontrado no cabeçalho.", true);
        provideButtonFeedback(button, false);
    }
}

function copyCPFFromChatV2() {
    const button = document.querySelector('#actionsContainerV2 .action-btn--cpf');
    const chatBody = findActiveChatBodyV2();
    if (!chatBody) {
        showNotification("Nenhum chat ativo para procurar CPF.", true);
        provideButtonFeedback(button, false);
        return;
    }
    const allMessageTexts = collectTextFromMessagesV2(chatBody);
    const foundCPF = findCPF(allMessageTexts);
    if (foundCPF) {
        navigator.clipboard.writeText(foundCPF).then(() => {
            showNotification(`CPF/CNPJ copiado: ${foundCPF}`);
            provideButtonFeedback(button, true);
        }).catch(err => {
            showNotification("Erro ao copiar CPF!", true);
            provideButtonFeedback(button, false);
        });
    } else {
        showNotification("Nenhum CPF/CNPJ encontrado nas mensagens do chat!", true);
        provideButtonFeedback(button, false);
    }
}

function showOSModalV2() {
    const chatBody = findActiveChatBodyV2();
    const chatHeader = findActiveChatHeaderV2();

    if (!chatBody || !chatHeader) {
        showNotification("Nenhum chat ativo para criar O.S.", true);
        return;
    }

    // [MODIFICADO] Coleta todos os dados necessários antes de chamar o modal
    const allMessageTexts = collectTextFromMessagesV2(chatBody);
    const cpfCnpj = findCPF(allMessageTexts);
    const { fullName, phoneNumber } = extractDataFromHeaderV2(chatHeader);
    
    showOSModal({
        modalId: 'osModalV2',
        chatHeader: chatHeader,
        chatBody: chatBody,
        allTemplates: osTemplates,
        extractDataFn: extractDataFromHeaderV2,
        extractChatFn: collectTextFromMessagesV2,
        // [NOVO] Passa um objeto com os dados do cliente
        clientData: {
            cpfCnpj: cpfCnpj,
            fullName: fullName,
            phoneNumber: phoneNumber
        }
    });
}

async function handleOpenInSgpClick() {
    const button = document.querySelector('#actionsContainerV2 .action-btn--sgp');
    showNotification("Buscando cliente no SGP...");
    const chatBody = findActiveChatBodyV2();
    const chatHeader = findActiveChatHeaderV2();

    if (!chatBody || !chatHeader) {
        showNotification("Nenhum chat ativo para buscar no SGP.", true);
        provideButtonFeedback(button, false);
        return;
    }

    const allMessageTexts = collectTextFromMessagesV2(chatBody);
    const cpfCnpj = findCPF(allMessageTexts);

    const { fullName, phoneNumber } = extractDataFromHeaderV2(chatHeader);
    let osText = `${phoneNumber || ''} ${fullName || ''} | `.trim();
    osText = processDynamicPlaceholders(osText).toUpperCase();
    
    console.log('[SGP Debug] Dados capturados da página:', { 
        cpfCnpj: cpfCnpj, 
        fullName: fullName, 
        phoneNumber: phoneNumber 
    });
    
    try {
        await chrome.storage.local.set({ 
            cpfCnpj: cpfCnpj, 
            fullName: fullName,
            phoneNumber: phoneNumber,
            osText: osText 
        });
        
        chrome.runtime.sendMessage({ action: "openInSgp" });
        provideButtonFeedback(button, true);
    } catch (error) {
        console.error("Erro ao comunicar com o background script:", error);
        showNotification("Erro ao iniciar a busca no SGP.", true);
        provideButtonFeedback(button, false);
    }
}

async function handleCopyPromptClick() {
    const button = document.querySelector('#actionsContainerV2 .action-btn--ai');
    showNotification("🤖 Copiando prompt filtrado...");
    const chatBody = findActiveChatBodyV2();
    if (!chatBody) {
        provideButtonFeedback(button, false);
        return showNotification("Nenhum chat ativo para copiar.", true);
    }
    const customerText = extractAndFormatConversationV2(chatBody);
    if (!customerText) {
        provideButtonFeedback(button, false);
        return showNotification("Não há mensagens de cliente para analisar.", true);
    }
    const companyProceduresContext = `
- O horário do suporte é de Seg a Sab de 08:00 as 21:00 e Dom/Feriados de 09:00 as 21:00.
- O horário do suporte de rua é de Seg a dom de 09:00 as 17:00.
- O horário do financeiro é de Seg a Sab de 09:00 as 18:00.
- O horário do Comercial e da loja é de Seg a Sex de 09:00 as 18:00 e aos Sab 09:00 as 13:00.
- Ajude a entender o problema do cliente e a dar uma possivel solução para o cliente.
`;
    const prompt = `
Você é um atendente de suporte da empresa 'ATI Internet'.
Sua resposta deve ser profissional, amigável e resolver o problema do cliente.
---
REGRAS IMPORTANTES:
1. Gere respostas CURTAS e DIRETAS, ideais para um chat.
2. Se uma explicação for longa, divida-a em 2 mensagens curtas e sequenciais.
3. Siga estritamente os procedimentos e informações da empresa listados abaixo.
---
PROCEDIMENTOS E INFORMAÇÕES DA EMPRESA:
${companyProceduresContext}
---
CONVERSA COM O CLIENTE:
${customerText}
---
Sugira a resposta ideal seguindo TODAS as regras:
    `;
    try {
        await navigator.clipboard.writeText(prompt.trim());
        showNotification("✅ Prompt para IA copiado!", false);
        provideButtonFeedback(button, true);
    } catch (error) {
        console.error("Erro ao copiar o prompt:", error);
        showNotification("Falha ao copiar o prompt.", true);
        provideButtonFeedback(button, false);
    }
}


function injectUIElements() {
    const sidebar = document.querySelector(SELECTORS.sidebar);
    if (sidebar && !document.getElementById('actionsContainerV2')) {
        const container = document.createElement("div");
        container.id = "actionsContainerV2";
        sidebar.appendChild(container);
        container.innerHTML = `
            <button class="action-btn action-btn--contact">👤 Contato</button>
            <button class="action-btn action-btn--cpf">📄 CPF</button>
            <button class="action-btn action-btn--os">📝 O.S</button>
            <button class="action-btn action-btn--ai">🤖 Chat</button>
            <button class="action-btn action-btn--sgp">↗️ SGP</button>
        `;
        container.querySelector('.action-btn--contact').onclick = copyContactInfoV2;
        container.querySelector('.action-btn--cpf').onclick = copyCPFFromChatV2;
        container.querySelector('.action-btn--os').onclick = showOSModalV2;
        container.querySelector('.action-btn--ai').onclick = handleCopyPromptClick;
        container.querySelector('.action-btn--sgp').onclick = handleOpenInSgpClick;
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

// --- PONTO DE ENTRADA E LISTENERS ---

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "reloadTemplates") {
        console.log("ATI Extensão: Recarregando templates e re-injetando UI.");
        document.getElementById('actionsContainerV2')?.remove();
        document.getElementById('atiQuickRepliesContainerV2')?.remove();
        loadTemplatesFromStorage().then(templates => {
            osTemplates = templates;
            injectUIElements();
        });
        sendResponse({ status: "Templates recarregados." });
    } 
    // [NOVO] Listener para a mensagem de atualização de tema
    else if (request.action === "applyTheme") {
        console.log("ATI Extensão: Aviso para aplicar tema recebido.");
        applySiteTheme();
        sendResponse({ status: "Tema aplicado." });
    }
    return true;
});

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.atiSiteTheme) {
        console.log('ATI Extensão: Tema mudou (via storage), aplicando novo estilo.');
        applySiteTheme();
    }
});

const observer = new MutationObserver(injectUIElements);

(async function main() {
    getOrCreateExtensionContainer();
    applySiteTheme();
    
    await loadTemplatesFromStorage().then(templates => {
        osTemplates = templates;
    });
    
    injectUIElements();
    
    observer.observe(document.body, { childList: true, subtree: true });
})();
