// logic.js - VERSÃO COM COLETA DE TEXTO CORRIGIDA

async function loadTemplatesFromStorage() {
  return new Promise((resolve) => {
    chrome.storage.local.get('atendenteAtual', async ({
      atendenteAtual
    }) => {
      if (!atendenteAtual) {
        console.log("[Extensão ATI] Nenhum atendente definido. Use o site-painel para fazer login.");
        if (typeof showNotification === 'function') {
          showNotification("ATI: Faça o login no painel para carregar seus modelos.", true, 5000);
        }
        resolve([]);
        return;
      }

      console.log(`[Extensão ATI] Tentando carregar modelos para: ${atendenteAtual}`);
      try {
        const firebaseTemplates = await fetchTemplatesFromFirebase(atendenteAtual);
        await chrome.storage.local.set({
          cachedOsTemplates: firebaseTemplates
        });
        console.log(`[Extensão ATI] ${firebaseTemplates.length} modelos de '${atendenteAtual}' carregados do Firebase.`);
        resolve(firebaseTemplates);

      } catch (error) {
        console.error("[Extensão ATI] Falha ao carregar do Firebase. Tentando usar o cache local.", error);
        chrome.storage.local.get('cachedOsTemplates', (cache) => {
          if (cache.cachedOsTemplates) {
            console.log("[Extensão ATI] Modelos carregados do cache como fallback.");
            resolve(cache.cachedOsTemplates);
          } else {
            console.error("[Extensão ATI] Cache também está vazio. Nenhum modelo carregado.");
            resolve([]);
          }
        });
      }
    });
  });
}
/**
 * [NOVO]
 * Armazena o CPF/CNPJ e o texto da O.S. no storage local para
 * que o background script possa acessá-los e realizar a busca no SGP.
 * @param {string} cpfCnpj - O CPF ou CNPJ do cliente.
 * @param {string} osText - O texto completo da O.S. a ser colado.
 */
async function storeDataForSgp(cpfCnpj, osText) {
    await chrome.storage.local.set({ cpfCnpj, osText });
}
function findActiveAttendanceElement() {
    // CORREÇÃO: O seletor agora busca por CADA painel de atendimento individual
    // que tenha o atributo 'data-message_to'.
    const allChatPanels = document.querySelectorAll('section.chat .attendance[data-message_to]');

    // Itera sobre cada painel encontrado para verificar qual está visível.
    for (const panel of allChatPanels) {
        const style = window.getComputedStyle(panel);
        
        // A condição para ser o "ativo" é simplesmente estar visível na tela.
        if (style.display !== 'none' && style.visibility !== 'hidden' && panel.offsetHeight > 0) {
            // Encontramos o painel ativo! Retornamos ele imediatamente.
            // No seu HTML, o painel da "Heglaia" vai passar aqui, e o da "Valeria" não.
            return panel; 
        }
    }

    // Se, por algum motivo, nenhum chat ativo for encontrado, retorna nulo.
    return null;
}

function findActiveChatHeader() {
    const activeAttendance = findActiveAttendanceElement();
    return activeAttendance ? activeAttendance.querySelector('header') : null;
}

function findActiveChatBody() {
    const activeAttendance = findActiveAttendanceElement();
    return activeAttendance ? activeAttendance.querySelector('.messages') : null;
}

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

// ===================================================================================
// ## INÍCIO DA CORREÇÃO ##
// ===================================================================================

/**
 * Coleta APENAS o texto principal das mensagens, ignorando lixo de UI e replies.
 * @param {HTMLElement} rootElement O contêiner de mensagens (div.messages).
 * @returns {string[]} Um array com os textos limpos de cada mensagem.
 */
function collectTextFromMessages(rootElement) {
    const texts = [];
    if (!rootElement) return texts;

    // Seleciona todos os blocos de mensagem visíveis
    const messageItems = rootElement.querySelectorAll('.item');
    messageItems.forEach(item => {
        const contentDiv = item.querySelector('.content.message_content');
        if (contentDiv) {
            // Pega todos os parágrafos (<p>) que são filhos DIRETOS do 'content'.
            // Isso inteligentemente ignora os parágrafos que estão dentro de uma citação (div.reply).
            const directMessageParagraphs = Array.from(contentDiv.children).filter(child => child.tagName === 'P');
            
            if (directMessageParagraphs.length > 0) {
                const messageText = directMessageParagraphs.map(p => p.textContent.trim()).join(' ');
                texts.push(messageText);
            }
        }
    });

    console.log("Textos coletados de forma limpa:", texts); // Log para depuração
    return texts;
}

function findCPF(allTexts) {
    const cpfCnpjRegex = /\b(\d{11}|\d{14})\b/g;
    const validMatches = [];
    const blacklist = ['código de barras', 'boleto', 'fatura', 'pix', 'linha digitável'];
    
    console.log("Textos recebidos para análise de CPF:", allTexts); // Log 1: Ver o que a função recebe

    for (const text of allTexts) {
        // Converte para minúsculas ANTES de verificar a blacklist
        const lowerCaseText = text.toLowerCase();
        
        if (blacklist.some(keyword => lowerCaseText.includes(keyword))) {
            console.log("Texto ignorado pela blacklist:", text); // Log 2: Ver o que está sendo pulado
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

    // Retorna o último CPF/CNPJ válido encontrado no chat
    return validMatches.length > 0 ? validMatches[validMatches.length - 1] : null;
}

// ===================================================================================
// ## FIM DA CORREÇÃO ##
// ===================================================================================


function extractDataFromHeader(headerElement) {
    let firstName = "", phoneNumber = "";
    if (headerElement) {
        let nameElement = headerElement.querySelector('.client_name');
        let phoneElement = headerElement.querySelector('.client_user');
        if (nameElement) firstName = (nameElement.textContent || "").trim().split(' ')[0].toUpperCase();
        if (phoneElement) {
            const phoneDigits = (phoneElement.textContent || "").replace(/\D/g, '');
            if (phoneDigits.startsWith('55') && (phoneDigits.length === 12 || phoneDigits.length === 13)) {
                const ddd = phoneDigits.substring(2, 4);
                const number = phoneDigits.substring(4);
                const part1 = number.length === 9 ? number.slice(0, 5) : number.slice(0, 4);
                const part2 = number.length === 9 ? number.slice(5) : number.slice(4);
                phoneNumber = `${ddd} ${part1}-${part2}`;
            } else if (phoneDigits.length === 10 || phoneDigits.length === 11) {
                const ddd = phoneDigits.substring(0, 2);
                const number = phoneDigits.substring(2);
                const part1 = number.length === 9 ? number.slice(0, 5) : number.slice(0, 4);
                const part2 = number.length === 9 ? number.slice(5) : number.slice(4);
                phoneNumber = `${ddd} ${part1}-${part2}`;
            }
        }
    }
    return { firstName, phoneNumber };
}

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

function extractClientChatAfterAssignment(chatContainerElement) {
    const assignmentKeyword = "atendimento atribuído ao atendente";
    let assignmentMessageFound = false;
    const clientTexts = [];
    if (!chatContainerElement) return [];
    const allMessageItems = Array.from(chatContainerElement.querySelectorAll('.item'));
    for (const item of allMessageItems) {
        const itemText = item.textContent.toLowerCase();
        if (!assignmentMessageFound && itemText.includes(assignmentKeyword)) {
            assignmentMessageFound = true;
            continue;
        }
        if (assignmentMessageFound) {
            if (!item.classList.contains('sent')) {
                clientTexts.push(item.textContent.trim());
            }
        }
    }
    return clientTexts;
}
/**
 * [NOVO] Armazena os dados necessários para o background script abrir o SGP.
 * @param {string} cpfCnpj O CPF ou CNPJ do cliente.
 * @param {string} osText O texto da Ordem de Serviço para o clipboard do SGP.
 */
async function storeDataForSgp(cpfCnpj, osText) {
  try {
    await chrome.storage.local.set({
      cpfCnpj: cpfCnpj,
      osText: osText
    });
    console.log("[Extensão ATI] Dados para o SGP salvos no storage local.");
  } catch (error) {
    console.error("[Extensão ATI] Erro ao salvar dados para o SGP.", error);
  }
}

function injectCSS(filePath) {
    const cssFileId = 'extension-styles';
    if (document.getElementById(cssFileId)) return;
    const link = document.createElement('link');
    link.id = cssFileId;
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = chrome.runtime.getURL(filePath);
    (document.head || document.documentElement).appendChild(link);
    console.log("ATI Extensão: Arquivo de estilo injetado com sucesso.");
}