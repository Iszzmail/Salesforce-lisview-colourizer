// This script handles the logic for the popup UI.

document.addEventListener('DOMContentLoaded', () => {
    const addRuleBtn = document.getElementById('addRule');
    const applyColorsBtn = document.getElementById('applyColors');
    const accountNameInput = document.getElementById('accountName');
    const accountColorInput = document.getElementById('accountColor');
    const rulesList = document.getElementById('rulesList');

    // Load existing rules from storage and display them.
    function loadRules() {
        chrome.storage.sync.get({ accountColorRules: [] }, (data) => {
            rulesList.innerHTML = '';
            data.accountColorRules.forEach((rule, index) => {
                const listItem = document.createElement('li');
                listItem.className = 'rule-item';
                listItem.innerHTML = `
                    <div style="display: flex; align-items: center;">
                        <div class="rule-color-box" style="background-color: ${rule.color};"></div>
                        <span>${rule.accountName}</span>
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

        if (accountName) {
            chrome.storage.sync.get({ accountColorRules: [] }, (data) => {
                const newRules = data.accountColorRules;
                // Check if rule for this account already exists, and update it.
                const existingRuleIndex = newRules.findIndex(r => r.accountName.toLowerCase() === accountName.toLowerCase());
                if (existingRuleIndex > -1) {
                    newRules[existingRuleIndex].color = color;
                } else {
                    newRules.push({ accountName, color });
                }
                chrome.storage.sync.set({ accountColorRules: newRules }, () => {
                    accountNameInput.value = '';
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
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.scripting.executeScript({
                target: { tabId: tabs[0].id },
                function: applyColoring
            });
        });
    });

    loadRules();
});

// This function is injected into the page to apply the coloring.
// It's defined here so it can be easily passed to executeScript.
function applyColoring() {
    // This is a placeholder that will be defined in content.js
    if(window.applySalesforceColoring) {
        window.applySalesforceColoring();
    } else {
        console.error('Coloring function not found on the page.');
    }
}
