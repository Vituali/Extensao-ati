/**
 * @typedef {object} ModalButton
 * @property {string} text - The text to display on the button.
 * @property {string} className - The CSS class for the button.
 * @property {string} value - The value to resolve the promise with.
 * @property {boolean} [disabled=false] - Whether the button is disabled.
 */

/**
 * @typedef {object} ModalConfig
 * @property {string} title - The title of the modal.
 * @property {string} bodyHTML - The HTML content for the modal's body.
 * @property {ModalButton[]} footerButtons - An array of button configurations.
 */

/**
 * Creates and displays a modal, returning a promise that resolves with the user's action.
 * @param {ModalConfig} config - The configuration object for the modal.
 * @returns {Promise<{action: string, data: object}>} A promise that resolves with the action and form data, or rejects on cancellation.
 */
export function createModal(config) {
    return new Promise((resolve, reject) => {
        // Prevent multiple modals
        document.querySelector('.ati-os-modal-overlay')?.remove();

        const overlay = document.createElement('div');
        overlay.className = 'ati-os-modal-overlay';

        const modal = document.createElement('div');
        modal.className = 'ati-os-modal';

        const buttonsHTML = config.footerButtons.map(btn =>
            `<button class="main-btn ${btn.className}" value="${btn.value}" ${btn.disabled ? 'disabled' : ''}>${btn.text}</button>`
        ).join('');

        modal.innerHTML = `
            <div class="ati-os-modal-header">${config.title}</div>
            <div class="ati-os-modal-body">${config.bodyHTML}</div>
            <div class="ati-os-modal-footer">${buttonsHTML}</div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const closeModal = (reason) => {
            overlay.remove();
            reject(new Error(reason));
        };

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeModal('cancel');
            }
        });

        modal.addEventListener('click', (e) => {
            if (e.target.matches('.main-btn')) {
                const action = e.target.value;

                if (action === 'cancel') {
                    closeModal('cancel');
                    return;
                }
                
                // Collect data from the modal before closing
                const osTextArea = modal.querySelector('#osTextArea');
                const selectedContractInput = modal.querySelector('input[name="selected_contract"]:checked');
                const occurrenceTypeInput = modal.querySelector('#occurrenceTypeSelectedValue');
                const statusCheckbox = modal.querySelector('#occurrenceStatusCheckbox');
                const createOSCheckbox = modal.querySelector('#shouldCreateOSCheckbox');

                const data = {
                    osText: osTextArea?.value || '',
                    selectedContract: selectedContractInput?.value || null,
                    occurrenceType: occurrenceTypeInput?.value || null,
                    occurrenceStatus: statusCheckbox?.checked ? '1' : '2', // 1=Encerrada, 2=Aberta
                    shouldCreateOS: createOSCheckbox?.checked || false,
                };
                
                overlay.remove();
                resolve({ action, data });
            }
        });
    });
}