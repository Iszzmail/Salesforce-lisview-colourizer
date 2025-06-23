/**
 * Content script for Salesforce Row Colorizer extension. (Version 4 - Final)
 * This script runs in the context of the Salesforce page.
 *
 * Fixes:
 * - Added extensive console logging for easier debugging.
 * - Refined logic to ensure both date and account rules are applied correctly.
 * - Text extraction is now more robust to handle different cell formats.
 */

 console.log('Salesforce Row Colorizer content script loaded (v4).');

 /**
  * Parses a date/time string from Salesforce in "M/D/YYYY, H:M AM/PM" format.
  * @param {string} dtString - The date string e.g., "6/20/2025, 6:23 PM".
  * @returns {Date|null} A Date object or null if parsing fails.
  */
 function parseSalesforceDateTime(dtString) {
     if (!dtString) return null;
     try {
         const parts = dtString.match(/(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s(\d{1,2}):(\d{2})\s(AM|PM)/i);
         if (!parts) {
             // console.warn('Date format not matched:', dtString);
             return null;
         }
 
         const month = parseInt(parts[1], 10) - 1;
         const day = parseInt(parts[2], 10);
         const year = parseInt(parts[3], 10);
         let hour = parseInt(parts[4], 10);
         const minute = parseInt(parts[5], 10);
         const ampm = parts[6].toUpperCase();
 
         if (ampm === 'PM' && hour < 12) hour += 12;
         if (ampm === 'AM' && hour === 12) hour = 0;
         
         return new Date(year, month, day, hour, minute);
     } catch (e) {
         console.error('Error parsing date:', dtString, e);
         return null;
     }
 }
 
 
 /**
  * Applies coloring rules to the rows in the Salesforce list view.
  */
 window.applySalesforceColoring = function() {
     console.log('%cApplying Salesforce coloring rules...', 'color: blue; font-weight: bold;');
     
     chrome.storage.sync.get({ accountColorRules: [] }, (data) => {
         const { accountColorRules } = data;
         const now = new Date();
         const twentyFourHoursAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));
         
         console.log(`Current Time: ${now.toLocaleString()}`);
         console.log(`Threshold (24 hours ago): ${twentyFourHoursAgo.toLocaleString()}`);
 
         const rows = document.querySelectorAll('table[role="grid"] tbody tr');
 
         if (rows.length === 0) return;
 
         let accountNameIndex = -1;
         let lastModifiedIndex = -1;
         const headers = document.querySelectorAll('table[role="grid"] thead th');
         
         headers.forEach((header, index) => {
             const headerLabel = header.getAttribute('aria-label') || header.textContent;
             const text = headerLabel.trim().toLowerCase();
             if (text === 'account name') accountNameIndex = index;
             if (text === 'last modified date') lastModifiedIndex = index;
         });
 
         console.log(`Found Columns -> Account Name: [${accountNameIndex}], Last Modified Date: [${lastModifiedIndex}]`);
         if (lastModifiedIndex === -1) {
             console.warn('"Last Modified Date" column not found. Date-based highlighting will not work.');
         }
 
         rows.forEach((row, rowIndex) => {
             let rowColor = ''; // Start with no color
             const cells = row.querySelectorAll('th, td');
             
             // --- 1. Last Modified Date Logic ---
             if (lastModifiedIndex > -1 && cells.length > lastModifiedIndex) {
                 const lastModifiedCell = cells[lastModifiedIndex];
                 // Prioritize finding the most specific element with the date text
                 const specificElement = lastModifiedCell.querySelector('lightning-formatted-text, span[title]');
                 const lastModifiedText = specificElement ? specificElement.textContent.trim() : lastModifiedCell.textContent.trim();
                 
                 if (lastModifiedText) {
                     const lastModifiedDate = parseSalesforceDateTime(lastModifiedText);
                     if (lastModifiedDate) {
                         // Check if the date is in the past and older than 24 hours
                         if (lastModifiedDate < twentyFourHoursAgo) {
                             console.log(`Row ${rowIndex + 1}: Date "${lastModifiedText}" is older than 24 hours. Coloring RED.`);
                             rowColor = '#ffcdd2'; // Light red
                         }
                     }
                 }
             }
 
             // --- 2. Account Name Logic ---
             if (accountNameIndex > -1 && cells.length > accountNameIndex) {
                 const accountNameCell = cells[accountNameIndex];
                 const accountElement = accountNameCell.querySelector('a[title]');
                 const accountNameText = accountElement ? accountElement.textContent.trim() : accountNameCell.textContent.trim();
                 
                 if (accountNameText && accountColorRules.length > 0) {
                     const matchingRule = accountColorRules.find(rule => rule.accountName.toLowerCase() === accountNameText.toLowerCase());
                     if (matchingRule) {
                         console.log(`Row ${rowIndex + 1}: Account "${accountNameText}" matches rule. Coloring ${matchingRule.color}.`);
                         // Account rule takes precedence
                         rowColor = matchingRule.color; 
                     }
                 }
             }
             
             // Apply the determined color at the end
             row.style.backgroundColor = rowColor;
         });
         console.log(`%cColoring rules processed for ${rows.length} rows.`, 'color: blue; font-weight: bold;');
     });
 }
 
 /**
  * Sets up a MutationObserver to watch for dynamic changes in the list view.
  */
 function initializeObserver() {
     const targetNode = document.querySelector('lst-object-home, .lstObjectHomeWrapper');
 
     if (targetNode) {
         console.log('Observer target found. Starting MutationObserver.');
         const observer = new MutationObserver(() => {
             clearTimeout(window.colorizerTimeout);
             window.colorizerTimeout = setTimeout(window.applySalesforceColoring, 500);
         });
 
         observer.observe(targetNode, { childList: true, subtree: true });
         setTimeout(window.applySalesforceColoring, 1500);
     } else {
         console.log('Observer target not yet available. Retrying in 500ms.');
         setTimeout(initializeObserver, 500);
     }
 }
 
 // Start the whole process.
 initializeObserver();
 
 