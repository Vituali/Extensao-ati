// ===================================================================================
// == POPUP.JS - PAINEL DE GERENCIAMENTO DE MODELOS (REORGANIZADO)                  ==
// ===================================================================================

document.addEventListener('DOMContentLoaded', () => {

    // -----------------------------------------------------------------------------
    // SELETORES DE ELEMENTOS DA PÁGINA (DOM)
    // -----------------------------------------------------------------------------
    // Manter todos os seletores aqui facilita a manutenção se o HTML mudar.
    const ui = {
        tabButtons: document.querySelectorAll('.tab-button'),
        tabContents: document.querySelectorAll('.tab-content'),
        osListContainer: document.getElementById('os-list-container'),
        replyListContainer: document.getElementById('reply-list-container'),
        saveButton: document.getElementById('save-button'),
        cancelButton: document.getElementById('cancel-button'),
        formTitle: document.getElementById('form-title'),
        titleInput: document.getElementById('title'),
        textInput: document.getElementById('text'),
        subCategoryInput: document.getElementById('subcategory'),
        editIndexInput: document.getElementById('edit-index'),
        editTypeInput: document.getElementById('edit-type'), // Novo campo oculto
        exportBtn: document.getElementById('export-btn'),
        importFile: document.getElementById('import-file')
    };

    // -----------------------------------------------------------------------------
    // ESTRUTURA DE DADOS PRINCIPAL
    // -----------------------------------------------------------------------------
    // dataStore armazena os templates separados por tipo, facilitando o acesso.
    let dataStore = {
        os: [],
        replies: []
    };

    // -----------------------------------------------------------------------------
    // FUNÇÕES DE DADOS (CARREGAR E SALVAR)
    // -----------------------------------------------------------------------------

    /**
     * Carrega todos os templates do chrome.storage, separa-os por tipo
     * e chama a função para renderizá-los na tela.
     */
    const loadAndRenderTemplates = async () => {
        const data = await chrome.storage.local.get('osTemplates');
        const allTemplates = data.osTemplates || [];

        // Separa os templates nos arrays correspondentes do dataStore
        dataStore.os = allTemplates.filter(t => t.category !== 'quick_reply');
        dataStore.replies = allTemplates.filter(t => t.category === 'quick_reply');

        // Renderiza as listas nas respectivas abas
        renderTemplateList(dataStore.os, ui.osListContainer, 'os');
        renderTemplateList(dataStore.replies, ui.replyListContainer, 'replies');
    };

    /**
     * Salva o estado atual do dataStore (todos os templates) no chrome.storage.
     * Unifica os dois arrays (os e replies) em um só antes de salvar.
     */
    const saveAllTemplates = () => {
        const allTemplatesToSave = [
            ...dataStore.os.map(t => ({ ...t, category: t.subCategory || 'Técnico' })),
            ...dataStore.replies.map(t => ({ ...t, category: 'quick_reply' }))
        ];

        chrome.storage.local.set({ osTemplates: allTemplatesToSave }, () => {
            console.log('ATI Extensão: Modelos salvos...');
            chrome.runtime.sendMessage({ action: "templatesUpdated" }); 
            loadAndRenderTemplates();
            resetForm(); // <-- Mova o resetForm para cá!
        });
    };
    // -----------------------------------------------------------------------------
    // FUNÇÕES DE RENDERIZAÇÃO E UI (INTERFACE DO USUÁRIO)
    // -----------------------------------------------------------------------------

    /**
     * Renderiza uma lista de templates em um contêiner específico.
     * Esta função é genérica e funciona para qualquer tipo de template.
     * @param {Array} templates - A lista de templates a ser renderizada.
     * @param {HTMLElement} containerElement - O elemento HTML onde a lista será injetada.
     * @param {string} dataType - O tipo de dado ('os' ou 'replies'), para os botões.
     */
    const renderTemplateList = (templates, containerElement, dataType) => {
        containerElement.innerHTML = ''; // Limpa a lista antes de renderizar

        if (templates.length === 0) {
            containerElement.innerHTML = '<p class="empty-message">Nenhum modelo cadastrado.</p>';
            return;
        }

        templates.forEach((template, index) => {
            const itemHTML = `
                <div class="template-item">
                    <div class="template-details">
                        <strong>${template.title}</strong>
                        <small>Subcategoria: ${template.subCategory || 'Geral'}</small>
                    </div>
                    <div class="template-actions">
                        <button class="edit" data-type="${dataType}" data-index="${index}">Editar</button>
                        <button class="delete" data-type="${dataType}" data-index="${index}">Excluir</button>
                    </div>
                </div>`;
            containerElement.innerHTML += itemHTML;
        });
    };

    /**
     * Limpa o formulário e o restaura para o estado de "Adicionar Novo".
     */
    const resetForm = () => {
        ui.formTitle.textContent = 'Adicionar Novo Modelo';
        ui.saveButton.textContent = 'Salvar Novo Modelo';
        ui.titleInput.value = '';
        ui.textInput.value = '';
        ui.subCategoryInput.value = '';
        ui.editIndexInput.value = '';
        ui.editTypeInput.value = ''; // Limpa o tipo
        ui.cancelButton.style.display = 'none';
        ui.titleInput.focus();
    };

    /**
     * Preenche o formulário para edição com os dados de um template existente.
     * @param {string} type - O tipo de template ('os' ou 'replies').
     * @param {number} index - O índice do template no array do dataStore.
     */
    const populateFormForEdit = (type, index) => {
        const template = dataStore[type][index];
        if (!template) return;

        ui.formTitle.textContent = 'Editando Modelo';
        ui.saveButton.textContent = 'Salvar Alterações';
        ui.titleInput.value = template.title;
        ui.textInput.value = template.text;
        ui.subCategoryInput.value = template.subCategory || '';
        ui.editIndexInput.value = index;
        ui.editTypeInput.value = type; // Guarda o tipo que está sendo editado
        ui.cancelButton.style.display = 'inline-block';
        ui.titleInput.focus();
    };


    // -----------------------------------------------------------------------------
    // EVENT LISTENERS (AÇÕES DO USUÁRIO)
    // -----------------------------------------------------------------------------

    /**
     * Listener para os botões das abas (Modelos O.S. / Respostas Rápidas).
     */
    ui.tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            ui.tabButtons.forEach(btn => btn.classList.remove('active'));
            ui.tabContents.forEach(content => content.classList.remove('active'));

            button.classList.add('active');
            const tabId = button.getAttribute('data-tab');
            document.getElementById(`${tabId}-content`).classList.add('active');
            
            // Limpa o formulário ao trocar de aba para evitar edições confusas
            resetForm();
        });
    });

    /**
     * Listener para o botão SALVAR (funciona tanto para criar quanto para editar).
     */
    ui.saveButton.addEventListener('click', () => {
        const title = ui.titleInput.value.trim();
        const text = ui.textInput.value.trim();

        if (!title || !text) {
            alert('Título e Texto são obrigatórios.');
            return;
        }

        const newTemplate = {
            title,
            text,
            subCategory: ui.subCategoryInput.value.trim()
        };

        const editIndex = ui.editIndexInput.value;
        const editType = ui.editTypeInput.value;

        if (editIndex !== '' && editType) {
            // Modo Edição: Atualiza o item existente
            dataStore[editType][parseInt(editIndex)] = newTemplate;
        } else {
            // Modo Criação: Adiciona ao tipo da aba ativa
            const activeTab = document.querySelector('.tab-button.active').getAttribute('data-tab');
            dataStore[activeTab].push(newTemplate);
        }

        saveAllTemplates();
    });
    
    /**
     * Listener para os botões EDITAR e EXCLUIR.
     * Usa a técnica de "event delegation" para monitorar cliques no body.
     */
    document.body.addEventListener('click', (e) => {
        const target = e.target;
        // Ignora cliques que não sejam nos botões de ação
        if (!target.matches('.edit, .delete')) return;

        const type = target.getAttribute('data-type');
        const index = parseInt(target.getAttribute('data-index'));

        if (target.classList.contains('delete')) {
            const templateTitle = dataStore[type][index].title;
            if (confirm(`Tem certeza que deseja excluir o modelo "${templateTitle}"?`)) {
                dataStore[type].splice(index, 1);
                saveAllTemplates();
            }
        } else if (target.classList.contains('edit')) {
            populateFormForEdit(type, index);
        }
    });
    
    /**
     * Listener para o botão CANCELAR do formulário.
     */
    ui.cancelButton.addEventListener('click', resetForm);

    /**
     * Listener para o botão de EXPORTAR.
     */
    ui.exportBtn.addEventListener('click', () => {
        const allTemplates = [...dataStore.os, ...dataStore.replies];
        if (allTemplates.length === 0) {
            alert('Não há modelos para exportar.');
            return;
        }

        const jsonData = JSON.stringify(allTemplates, null, 4);
        const blob = new Blob([jsonData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `modelos_ati_backup_${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    });

    /**
     * Listener para o input de IMPORTAR arquivo.
     */
    ui.importFile.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedTemplates = JSON.parse(e.target.result);
                if (!Array.isArray(importedTemplates)) throw new Error("O arquivo não é uma lista válida.");
                
                if (confirm('Isso irá SUBSTITUIR todos os seus modelos atuais. Deseja continuar?')) {
                    // Seta o storage diretamente e depois recarrega
                    chrome.storage.local.set({ osTemplates: importedTemplates }, () => {
                        console.log('ATI Extensão: Modelos importados com sucesso.');
                        loadAndRenderTemplates();
                    });
                }
            } catch (error) {
                alert('Erro ao ler o arquivo. Certifique-se de que é um JSON válido. ' + error.message);
            }
        };
        reader.readAsText(file);
        event.target.value = ''; // Limpa o input para permitir importar o mesmo arquivo novamente
    });


    // -----------------------------------------------------------------------------
    // INICIALIZAÇÃO
    // -----------------------------------------------------------------------------
    loadAndRenderTemplates();
    resetForm();
});