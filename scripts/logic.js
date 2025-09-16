// ===================================================================
// == LOGIC.JS - FUNÇÕES DE LÓGICA DE NEGÓCIO COMPARTILHADAS        ==
// ===================================================================

// -------------------------------------------------------------------
// SEÇÃO: GERENCIAMENTO DE TEMPLATES (FIREBASE E CACHE)
// -------------------------------------------------------------------

/**
 * Carrega os templates (Respostas Rápidas e O.S.) para o atendente logado.
 * Prioriza a busca no Firebase e, em caso de falha, utiliza os dados em cache.
 * @returns {Promise<Array<Object>>} Uma promessa que resolve para um array de objetos de template.
 */
async function loadTemplatesFromStorage() {
    return new Promise((resolve) => {
        // 1. Pega o nome do atendente logado no storage da extensão.
        chrome.storage.local.get('atendenteAtual', async ({ atendenteAtual }) => {
            if (!atendenteAtual) {
                console.log("ATI Extensão: Nenhum atendente definido.");
                if (typeof showNotification === 'function') {
                    showNotification("ATI: Faça o login no painel para carregar seus modelos.", true, 5000);
                }
                resolve([]);
                return;
            }

            console.log(`ATI Extensão: Carregando modelos para: ${atendenteAtual}`);
            try {
                // 2. Tenta buscar simultaneamente as respostas e os modelos de O.S. do Firebase.
                const [quickReplies, osTemplates] = await Promise.all([
                    fetchTemplatesFromFirebase(atendenteAtual, 'respostas'),
                    fetchTemplatesFromFirebase(atendenteAtual, 'modelos_os')
                ]);

                // 3. Junta os resultados, garantindo que sejam arrays válidos.
                const allTemplates = (quickReplies || []).concat(osTemplates || []);
                const validTemplates = Array.isArray(allTemplates) ? allTemplates.filter(t => t && typeof t === 'object') : [];

                // 4. Salva os templates frescos no cache local para uso offline.
                await chrome.storage.local.set({ cachedOsTemplates: validTemplates });
                console.log(`ATI Extensão: ${validTemplates.length} modelos de '${atendenteAtual}' carregados do Firebase.`);
                resolve(validTemplates);

            } catch (error) {
                // 5. Se o Firebase falhar, usa os últimos dados salvos no cache como fallback.
                console.error("ATI Extensão: Falha ao carregar do Firebase. Usando cache.", error);
                chrome.storage.local.get('cachedOsTemplates', (cache) => {
                    const cachedValidTemplates = cache.cachedOsTemplates || [];
                    console.log(`ATI Extensão: ${cachedValidTemplates.length} modelos carregados do cache como fallback.`);
                    resolve(cachedValidTemplates);
                });
            }
        });
    });
}

// -------------------------------------------------------------------
// SEÇÃO: PROCESSAMENTO DE DADOS DO CHAT
// -------------------------------------------------------------------

/**
 * Coleta o texto principal das mensagens no chat, ignorando o conteúdo de citações (replies).
 * @param {HTMLElement} rootElement - O contêiner de mensagens (ex: div.messages ou div#attendanceMessages).
 * @returns {string[]} Um array com os textos limpos de cada mensagem.
 */
function collectTextFromMessages(rootElement) {
    const texts = [];
    if (!rootElement) return texts;

    const messageItems = rootElement.querySelectorAll('.item, div[id^="message-"]'); // Funciona em V1 e V2

    messageItems.forEach(item => {
        const contentDiv = item.querySelector('.content.message_content, .w-full.relative.shadow-md');
        if (contentDiv) {
            // Pega apenas os parágrafos <p> que são filhos diretos do contêiner de conteúdo.
            // Isso efetivamente ignora os <p> dentro de uma div de "reply".
            const directMessageParagraphs = Array.from(contentDiv.children).filter(child => child.tagName === 'P');

            if (directMessageParagraphs.length > 0) {
                const messageText = directMessageParagraphs.map(p => p.textContent.trim()).join(' ');
                texts.push(messageText);
            }
        }
    });
    console.log("ATI Extensão: Textos coletados de forma limpa:", texts);
    return texts;
}

/**
 * Encontra o último CPF ou CNPJ válido dentro de um array de textos.
 * Ignora números que pareçam ser de boletos ou códigos de barras.
 * @param {string[]} allTexts - Array com os textos das mensagens do chat.
 * @returns {string|null} O último CPF/CNPJ válido encontrado, ou nulo.
 */
function findCPF(allTexts) {
    const cpfCnpjRegex = /\b(\d{11}|\d{14})\b/g;
    const validMatches = [];
    const blacklist = ['código de barras', 'boleto', 'fatura', 'pix', 'linha digitável'];

    for (const text of allTexts) {
        const lowerCaseText = text.toLowerCase();
        // Se a mensagem contém palavras da blacklist, pula para a próxima.
        if (blacklist.some(keyword => lowerCaseText.includes(keyword))) {
            continue;
        }

        const cleanText = text.replace(/[.\-\/]/g, "");
        const potentialMatches = cleanText.match(cpfCnpjRegex);

        if (potentialMatches) {
            for (const match of potentialMatches) {
                if (match.length === 11 && isValidCPF(match)) {
                    validMatches.push(match);
                } else if (match.length === 14 && isValidCNPJ(match)) {
                    validMatches.push(match);
                }
            }
        }
    }
    // Retorna o último documento válido encontrado.
    return validMatches.length > 0 ? validMatches[validMatches.length - 1] : null;
}

// -------------------------------------------------------------------
// SEÇÃO: VALIDAÇÃO DE DADOS (CPF E CNPJ)
// -------------------------------------------------------------------

/**
 * Valida um número de CPF.
 * @param {string} cpf - O CPF a ser validado.
 * @returns {boolean} - True se o CPF for válido, false caso contrário.
 */
function isValidCPF(cpf) {
    if (typeof cpf !== 'string') return false;
    cpf = cpf.replace(/[^\d]/g, '');
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
    let sum = 0, remainder;
    for (let i = 1; i <= 9; i++) sum += parseInt(cpf.substring(i - 1, i)) * (11 - i);
    remainder = (sum * 10) % 11;
    if ((remainder === 10) || (remainder === 11)) remainder = 0;
    if (remainder !== parseInt(cpf.substring(9, 10))) return false;
    sum = 0;
    for (let i = 1; i <= 10; i++) sum += parseInt(cpf.substring(i - 1, i)) * (12 - i);
    remainder = (sum * 10) % 11;
    if ((remainder === 10) || (remainder === 11)) remainder = 0;
    if (remainder !== parseInt(cpf.substring(10, 11))) return false;
    return true;
}

/**
 * Valida um número de CNPJ.
 * @param {string} cnpj - O CNPJ a ser validado.
 * @returns {boolean} - True se o CNPJ for válido, false caso contrário.
 */
function isValidCNPJ(cnpj) {
    if (typeof cnpj !== 'string') return false;
    cnpj = cnpj.replace(/[^\d]/g, '');
    if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
    let length = cnpj.length - 2;
    let numbers = cnpj.substring(0,length);
    let digits = cnpj.substring(length);
    let sum = 0;
    let pos = length - 7;
    for (let i = length; i >= 1; i--) {
        sum += numbers.charAt(length - i) * pos--;
        if (pos < 2) pos = 9;
    }
    let result = sum % 11 < 2 ? 0 : 11 - sum % 11;
    if (result != digits.charAt(0)) return false;
    length += 1;
    numbers = cnpj.substring(0,length);
    sum = 0;
    pos = length - 7;
    for (let i = length; i >= 1; i--) {
        sum += numbers.charAt(length - i) * pos--;
        if (pos < 2) pos = 9;
    }
    result = sum % 11 < 2 ? 0 : 11 - sum % 11;
    if (result != digits.charAt(1)) return false;
    return true;
}

// -------------------------------------------------------------------
// SEÇÃO: COMUNICAÇÃO E MANIPULAÇÃO DE TEXTO
// -------------------------------------------------------------------

/**
 * Substitui placeholders dinâmicos em um texto (ex: [SAUDACAO]) pelo valor correspondente.
 * @param {string} text - O texto do template a ser processado.
 * @returns {string} - O texto com os placeholders substituídos.
 */
function processDynamicPlaceholders(text) {
    if (typeof text !== 'string') return '';
    const now = new Date();
    const hour = now.getHours();
    let saudacao = '';
    let despedida = '';

    if (hour >= 5 && hour < 12) {
        saudacao = 'Bom dia';
        despedida = 'Tenha uma excelente manhã';
    } else if (hour >= 12 && hour < 18) {
        saudacao = 'Boa tarde';
        despedida = 'Tenha uma excelente tarde';
    } else {
        saudacao = 'Boa noite';
        despedida = 'Tenha uma excelente noite';
    }

    let processedText = text.replace(/\[SAUDACAO\]/gi, saudacao);
    processedText = processedText.replace(/\[DESPEDIDA\]/gi, despedida);
    return processedText;
}

// -------------------------------------------------------------------
// SEÇÃO: MANIPULAÇÃO DE UI (ELEMENTOS VISUAIS)
// -------------------------------------------------------------------

/**
 * Carrega as configurações de tema salvas e as aplica como variáveis CSS na página.
 * Aplica um tema azul padrão caso nenhum tema customizado seja encontrado.
 */
function applySiteTheme() {
    const defaultTheme = {
        isDarkMode: true,
        neonBorders: true,
        iconColor: '#007DFF',
        borderColor: '#007DFF',
        textColor: '#E5E5E5',
    };

    chrome.storage.local.get('atiSiteTheme', ({ atiSiteTheme }) => {
        const themeToApply = atiSiteTheme || defaultTheme;        
        const styleId = 'ati-site-theme-styles';
        let styleTag = document.getElementById(styleId);

        if (!styleTag) {
            styleTag = document.createElement('style');
            styleTag.id = styleId;
            (document.head || document.documentElement).appendChild(styleTag);
        }

        // Funções auxiliares para manipulação de cores
        const getLuminance = (hex) => {
            if (!hex || hex.length < 4) return 0;
            hex = hex.replace("#", "");
            const r = parseInt(hex.substring(0, 2), 16) / 255, g = parseInt(hex.substring(2, 4), 16) / 255, b = parseInt(hex.substring(4, 6), 16) / 255;
            const a = [r, g, b].map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
            return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
        };
        const lightenColor = (hex, percent) => {
            hex = hex.replace("#", "");
            const r = parseInt(hex.substring(0, 2), 16), g = parseInt(hex.substring(2, 4), 16), b = parseInt(hex.substring(4, 6), 16);
            const increase = percent / 100;
            return `#${Math.min(255,Math.round(r+(255-r)*increase)).toString(16).padStart(2,'0')}${Math.min(255,Math.round(g+(255-g)*increase)).toString(16).padStart(2,'0')}${Math.min(255,Math.round(b+(255-b)*increase)).toString(16).padStart(2,'0')}`;
        };
        const hexToRgba = (hex, alpha) => {
            hex = hex.replace("#", "");
            const r = parseInt(hex.substring(0, 2), 16), g = parseInt(hex.substring(2, 4), 16), b = parseInt(hex.substring(4, 6), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        };
        
        const contrastColorForButtons = getLuminance(themeToApply.borderColor) > 0.5 ? '#111111' : '#FFFFFF';

        styleTag.textContent = `
            :root {
                --theme-font-primary: 'Orbitron', sans-serif;
                --theme-font-secondary: Arial, sans-serif;
                --theme-card-bg: ${themeToApply.isDarkMode ? '#2d2d2d' : '#ffffff'};
                --theme-text-primary: ${themeToApply.isDarkMode ? '#e0e0e0' : '#333333'};
                --theme-text-secondary: ${themeToApply.isDarkMode ? '#a0a0a0' : '#666666'};
                --theme-border-color: ${themeToApply.borderColor};
                --theme-heading-color: ${themeToApply.textColor};
                --theme-button-bg: ${themeToApply.borderColor};
                --theme-button-text: ${contrastColorForButtons};
                --theme-button-hover-bg: ${lightenColor(themeToApply.borderColor, 20)};
                --theme-success-color: #22C55E;
                --theme-error-color: #EF4444;
                --theme-info-color: #3B82F6;
                --theme-shadow-color: ${hexToRgba(themeToApply.borderColor, themeToApply.neonBorders ? 0.4 : 0)};
            }
        `;
    });
}
