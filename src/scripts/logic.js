// ===================================================================
// == LOGIC.JS - FUNÇÕES DE LÓGICA PURAS E COMPARTILHADAS           ==
// ===================================================================

/**
 * Encontra o último CPF ou CNPJ válido dentro de um array de textos.
 * @param {string[]} allTexts - Array com os textos das mensagens do chat.
 * @returns {string|null} O último CPF/CNPJ válido encontrado, ou nulo.
 */
export function findCPF(allTexts) {
    const cpfCnpjRegex = /\b(\d{11}|\d{14})\b/g;
    const validMatches = [];
    const blacklist = ['código de barras', 'boleto', 'fatura', 'pix', 'linha digitável'];

    for (const text of allTexts) {
        const lowerCaseText = text.toLowerCase();
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
    return validMatches.length > 0 ? validMatches[validMatches.length - 1] : null;
}

/**
 * Substitui placeholders dinâmicos em um texto (ex: [SAUDACAO]).
 * @param {string} text - O texto do template a ser processado.
 * @returns {string} - O texto com os placeholders substituídos.
 */
export function processDynamicPlaceholders(text) {
    if (typeof text !== 'string') return '';
    const hour = new Date().getHours();
    let saudacao = '';
    let despedida = '';

    if (hour >= 5 && hour < 12) {
        saudacao = 'Bom dia';
        despedida = 'tenha um excelente dia';
    } else if (hour >= 12 && hour < 18) {
        saudacao = 'Boa tarde';
        despedida = 'tenha uma excelente tarde';
    } else {
        saudacao = 'Boa noite';
        despedida = 'tenha uma excelente noite';
    }

    return text
        .replace(/\[SAUDACAO\]/gi, saudacao)
        .replace(/\[DESPEDIDA\]/gi, despedida);
}
/**
 * Carrega as configurações de tema salvas e as aplica como variáveis CSS na página.
 */
export function applySiteTheme() {
    chrome.storage.local.get('atiSiteTheme', ({ atiSiteTheme }) => {
        // **A CORREÇÃO:** Detecta o modo atual diretamente da página
        const isCurrentlyDark = document.documentElement.classList.contains('dark');

        const theme = atiSiteTheme || {};
        
        const chatPrimaryAlpha = theme.chatPrimaryAlpha ?? 0.377;
        const borderColor = theme.borderColor || '#007DFF';

        const styleId = 'ati-site-theme-styles';
        let styleTag = document.getElementById(styleId);
        if (!styleTag) {
            styleTag = document.createElement('style');
            styleTag.id = styleId;
            (document.head || document.documentElement).appendChild(styleTag);
        }

        const getLuminance = (hex) => {
            if (!hex || hex.length < 4) return 0;
            const rgb = parseInt(hex.slice(1), 16);
            const r = (rgb >> 16) & 0xff, g = (rgb >> 8) & 0xff, b = (rgb >> 0) & 0xff;
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const contrastColor = getLuminance(borderColor) > 128 ? '#111' : '#FFF';
        
        styleTag.textContent = `
            :root {
                --theme-font-primary: 'Orbitron', sans-serif;
                --theme-font-secondary: Arial, sans-serif;
                --theme-card-bg: ${isCurrentlyDark ? '#2d2d2d' : '#ffffff'};
                --theme-text-primary: ${isCurrentlyDark ? '#e0e0e0' : '#333333'};
                --theme-border-color: ${borderColor};
                --theme-heading-color: ${isCurrentlyDark ? '#e0e0e0' : '#333333'};
                --theme-button-bg: ${borderColor};
                --theme-button-text: ${contrastColor};
                --theme-success-color: #22C55E;
                --theme-error-color: #EF4444;
                --theme-info-color: #3B82F6;
                --theme-shadow-color: ${isCurrentlyDark ? borderColor + '66' : '#00000033'};
                --theme-button-hover-bg: ${contrastColor === '#FFF' ? '#3399ff' : '#0056b3'};
            }

            ${isCurrentlyDark ? `
            html.dark body {
                --chatPrimary: rgba(0, 110, 255, ${chatPrimaryAlpha}) !important;
            }
            ` : ''}
        `;
    });
}

// --- Funções de Validação (Internas, não precisam de export) ---
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
    return remainder === parseInt(cpf.substring(10, 11));
}

function isValidCNPJ(cnpj) {
    if (typeof cnpj !== 'string') return false;
    cnpj = cnpj.replace(/[^\d]/g, '');
    if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
    let length = cnpj.length - 2, numbers = cnpj.substring(0, length), digits = cnpj.substring(length), sum = 0, pos = length - 7;
    for (let i = length; i >= 1; i--) {
        sum += numbers.charAt(length - i) * pos--;
        if (pos < 2) pos = 9;
    }
    let result = sum % 11 < 2 ? 0 : 11 - sum % 11;
    if (result != digits.charAt(0)) return false;
    length += 1;
    numbers = cnpj.substring(0, length);
    sum = 0;
    pos = length - 7;
    for (let i = length; i >= 1; i--) {
        sum += numbers.charAt(length - i) * pos--;
        if (pos < 2) pos = 9;
    }
    result = sum % 11 < 2 ? 0 : 11 - sum % 11;
    return result == digits.charAt(1);
}
