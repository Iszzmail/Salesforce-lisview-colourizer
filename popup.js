// This script handles the logic for the popup UI.

document.addEventListener('DOMContentLoaded', () => {
    const addRuleBtn = document.getElementById('addRule');
    const applyColorsBtn = document.getElementById('applyColors');
    const accountNameInput = document.getElementById('accountName');
    const accountColorInput = document.getElementById('accountColor');
    const accountNoteInput = document.getElementById('accountNote'); // New: Note input
    const rulesList = document.getElementById('rulesList');

    // Load existing rules from storage and display them.
    function loadRules() {
        chrome.storage.sync.get({ accountColorRules: [] }, (data) => {
            rulesList.innerHTML = '';
            data.accountColorRules.forEach((rule, index) => {
                const listItem = document.createElement('li');
                listItem.className = 'rule-item';
                listItem.innerHTML = `
                    <div class="rule-info">
                        <div class="rule-color-box" style="background-color: ${rule.color};"></div>
                        <div class="rule-name-note">
                            <span class="rule-name">${rule.accountName}</span>
                            ${rule.note ? `<span class="rule-note">${rule.note}</span>` : ''}
                        </div>
                    </div>
                    <button class="delete-rule" data-index="${index}">&times;</button>
                `;
                rulesList.appendChild(listItem);
            });
        });
    }

    addRuleBtn.addEventListener('click', () => {
        const accountName = accountNameInput.value.trim();
        const color = accountColorInput.value;
        const note = accountNoteInput.value.trim(); // New: Get note value

        if (accountName) {
            chrome.storage.sync.get({ accountColorRules: [] }, (data) => {
                const newRules = data.accountColorRules;
                const existingRuleIndex = newRules.findIndex(r => r.accountName.toLowerCase() === accountName.toLowerCase());
                
                if (existingRuleIndex > -1) {
                    // Update existing rule
                    newRules[existingRuleIndex].color = color;
                    newRules[existingRuleIndex].note = note; // Update note
                } else {
                    // Add new rule
                    newRules.push({ accountName, color, note }); // Save note
                }
                
                chrome.storage.sync.set({ accountColorRules: newRules }, () => {
                    accountNameInput.value = '';
                    accountNoteInput.value = ''; // Clear note input
                    loadRules();
                });
            });
        }
    });

    rulesList.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-rule')) {
            const indexToDelete = parseInt(e.target.dataset.index, 10);
            chrome.storage.sync.get({ accountColorRules: [] }, (data) => {
                const newRules = data.accountColorRules.filter((_, index) => index !== indexToDelete);
                chrome.storage.sync.set({ accountColorRules: newRules }, loadRules);
            });
        }
    });

    applyColorsBtn.addEventListener('click', () => {
        // Trigger the coloring function in the active tab's content script
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0 && tabs[0].id) {
                chrome.scripting.executeScript({
                    target: { tabId: tabs[0].id },
                    function: applyColoringAndNotes // Call the main coloring function
                });
            } else {
                console.error("No active tab found to apply colors.");
            }
        });
    });

    loadRules();
});

// This function is injected into the page to apply the coloring and notes.
// It's defined here so it can be easily passed to executeScript.
function applyColoringAndNotes() {
    // This is a placeholder that will call the main function in content.js
    if (window.applySalesforceColoring) {
        window.applySalesforceColoring();
    } else {
        console.error('applySalesforceColoring function not found on the page.');
    }
}
