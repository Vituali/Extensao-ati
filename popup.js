document.addEventListener('DOMContentLoaded', () => {
    // Elementos da UI
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    const osListContainer = document.getElementById('os-list-container');
    const replyListContainer = document.getElementById('reply-list-container');
    const saveButton = document.getElementById('save-button');
    const cancelButton = document.getElementById('cancel-button');
    const formTitle = document.getElementById('form-title');
    const titleInput = document.getElementById('title');
    const textInput = document.getElementById('text');
    const categoryInput = document.getElementById('category');
    const keywordsInput = document.getElementById('keywords');
    const keywordsGroup = document.getElementById('keywords-group');
    const editIndexInput = document.getElementById('edit-index');
    const exportBtn = document.getElementById('export-btn');
    const importFile = document.getElementById('import-file');
    const subCategoryInput = document.getElementById('subcategory');
    const subCategoryGroup = document.getElementById('subcategory-group');

    let templates = [];

    // Função para mostrar/esconder campos do formulário
    const toggleFormFields = (category) => {
        if (category === 'quick_reply') {
            keywordsGroup.style.display = 'none';
            subCategoryGroup.style.display = 'block';
        } else {
            keywordsGroup.style.display = 'block';
            subCategoryGroup.style.display = 'none';
        }
    };
    
    // Adiciona o listener para o dropdown de categoria
    categoryInput.addEventListener('change', () => toggleFormFields(categoryInput.value));

    // --- Lógica das Abas ---
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            button.classList.add('active');
            const tabId = button.getAttribute('data-tab');
            document.getElementById(`${tabId}-content`).classList.add('active');
            
            // Adapta o formulário para a aba ativa
            const categoryValue = tabId === 'replies' ? 'quick_reply' : 'Técnico';
            categoryInput.value = categoryValue;
            toggleFormFields(categoryValue);
        });
    });

    // --- Lógica de Renderização e CRUD ---
    const renderTemplates = () => {
        chrome.storage.local.get('osTemplates', (data) => {
            templates = data.osTemplates || [];
            osListContainer.innerHTML = '';
            replyListContainer.innerHTML = '';

            const osTemplates = templates.filter(t => t.category !== 'quick_reply');
            const quickReplies = templates.filter(t => t.category === 'quick_reply');

            const createItemHTML = (template, index) => `
                <div class="template-item">
                    <div class="template-details">
                        <strong>${template.title}</strong>
                        <small>${template.subCategory ? `Subcategoria: ${template.subCategory}` : `Categoria: ${template.category}`}</small>
                    </div>
                    <div class="template-actions">
                        <button class="edit" data-index="${index}">Editar</button>
                        <button class="delete" data-index="${index}">Excluir</button>
                    </div>
                </div>`;

            osTemplates.forEach((template) => {
                const originalIndex = templates.findIndex(t => t === template);
                osListContainer.innerHTML += createItemHTML(template, originalIndex);
            });
            quickReplies.forEach((template) => {
                const originalIndex = templates.findIndex(t => t === template);
                replyListContainer.innerHTML += createItemHTML(template, originalIndex);
            });
        });
    };

    const saveTemplates = () => {
        chrome.storage.local.set({ osTemplates: templates }, () => {
            console.log('Modelos salvos com sucesso.');
            renderTemplates();
        });
    };

    const resetForm = () => {
        formTitle.textContent = 'Adicionar Novo Modelo';
        saveButton.textContent = 'Salvar Novo Modelo';
        titleInput.value = '';
        textInput.value = '';
        keywordsInput.value = '';
        subCategoryInput.value = '';
        editIndexInput.value = '';
        cancelButton.style.display = 'none';
        
        const activeTab = document.querySelector('.tab-button.active').getAttribute('data-tab');
        const categoryValue = activeTab === 'replies' ? 'quick_reply' : 'Técnico';
        categoryInput.value = categoryValue;
        toggleFormFields(categoryValue);
    };

    // CORREÇÃO: A lógica de salvar estava fora do listener de clique
    saveButton.addEventListener('click', () => {
        const newTemplate = {
            title: titleInput.value.trim(),
            text: textInput.value.trim(),
            category: categoryInput.value,
            keywords: keywordsInput.value.split(',').map(k => k.trim()).filter(Boolean),
            subCategory: subCategoryInput.value.trim()
        };

        if (newTemplate.category !== 'quick_reply') {
            delete newTemplate.subCategory;
        } else {
            delete newTemplate.keywords;
        }

        if (!newTemplate.title || !newTemplate.text) {
            alert('Título e Texto são obrigatórios.');
            return;
        }

        const editIndex = editIndexInput.value;
        if (editIndex !== '') {
            templates[parseInt(editIndex)] = newTemplate;
        } else {
            templates.push(newTemplate);
        }
        saveTemplates();
        resetForm();
    });

    cancelButton.addEventListener('click', resetForm);

    document.body.addEventListener('click', (e) => {
        const target = e.target;
        if (!target.matches('.edit, .delete')) return;
        const index = parseInt(target.getAttribute('data-index'));

        if (target.classList.contains('delete')) {
            if (confirm(`Tem certeza que deseja excluir o modelo "${templates[index].title}"?`)) {
                templates.splice(index, 1);
                saveTemplates();
            }
        }
        if (target.classList.contains('edit')) {
            const template = templates[index];
            formTitle.textContent = 'Editando Modelo';
            saveButton.textContent = 'Salvar Alterações';
            titleInput.value = template.title;
            textInput.value = template.text;
            categoryInput.value = template.category;
            keywordsInput.value = (template.keywords || []).join(', ');
            subCategoryInput.value = template.subCategory || '';
            editIndexInput.value = index;
            cancelButton.style.display = 'inline-block';
            toggleFormFields(template.category);
            titleInput.focus();
        }
    });

    // --- Lógica de Importar e Exportar ---
    exportBtn.addEventListener('click', () => {
        chrome.storage.local.get('osTemplates', (data) => {
            if (!data.osTemplates || data.osTemplates.length === 0) {
                alert('Não há modelos para exportar.');
                return;
            }
            const jsonData = JSON.stringify(data.osTemplates, null, 4);
            const blob = new Blob([jsonData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'modelos_backup.json';
            a.click();
            URL.revokeObjectURL(url);
        });
    });

    importFile.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedTemplates = JSON.parse(e.target.result);
                if (!Array.isArray(importedTemplates)) throw new Error("O arquivo não é uma lista válida.");
                if (confirm('Isso irá substituir todos os seus modelos atuais. Deseja continuar?')) {
                    templates = importedTemplates;
                    saveTemplates();
                }
            } catch (error) {
                alert('Erro ao ler o arquivo. Certifique-se de que é um JSON válido.');
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    });

    // Inicia a renderização e ajusta o formulário
    renderTemplates();
    toggleFormFields(categoryInput.value);
});