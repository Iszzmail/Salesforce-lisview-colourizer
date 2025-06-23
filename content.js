/**
 * Content script for Salesforce Row Colorizer extension. (Version 6 - Hover Stability)
 * This script runs in the context of any Salesforce page with a list view.
 *
 * Updates:
 * - Fixes intermittent tooltip visibility issues (shows and goes immediately).
 * - Ensures the tooltip stays visible for a configurable duration (5 seconds).
 * - Improves hover stability and responsiveness by refining show/hide timeouts.
 */

 console.log('Salesforce Row Colorizer content script loaded (v6 - hover stability).');

 // --- Configuration Constants ---
 const NOTE_DISPLAY_DURATION = 5000; // Time in milliseconds the note stays visible after mouse leaves
 
 
 // --- Tooltip Element Setup (created once) ---
 let noteTooltip = null;
 let currentHoveredRow = null; // Tracks the currently hovered row element
 let showTooltipTimeout;    // Timer for showing the tooltip
 let hideTooltipTimeout;    // Timer for hiding the tooltip
 
 function createNoteTooltip() {
     if (noteTooltip) return; // Already created
 
     noteTooltip = document.createElement('div');
     noteTooltip.id = 'salesforce-note-tooltip';
     noteTooltip.style.cssText = `
         position: absolute;
         background-color: #333;
         color: white;
         padding: 8px 12px;
         border-radius: 6px;
         font-size: 13px;
         opacity: 0;
         visibility: hidden;
         transition: opacity 0.3s ease-in-out, transform 0.3s ease-in-out;
         transform: translateY(10px); /* Initial offset for slide-up effect */
         z-index: 9999; /* High z-index to appear on top of Salesforce UI */
         pointer-events: none; /* Allows clicks to pass through to elements below */
         white-space: pre-wrap; /* Preserve line breaks in note */
         max-width: 300px;
         box-shadow: 0 4px 12px rgba(0,0,0,0.2);
         line-height: 1.4;
         text-align: left; /* Ensure text alignment */
     `;
     document.body.appendChild(noteTooltip);
     console.log('Note tooltip element created and appended to body.');
 }
 
 // Ensure the tooltip is created when the script loads
 createNoteTooltip();
 
 
 // --- Date Parsing Function ---
 
 /**
  * Parses a date/time string from Salesforce, handling common formats.
  * @param {string} dtString - The date string e.g., "6/20/2025, 6:23 PM".
  * @returns {Date|null} A Date object or null if parsing fails.
  */
 function parseSalesforceDateTime(dtString) {
     if (!dtString) return null;
     try {
         const parts = dtString.match(/(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s(\d{1,2}):(\d{2})\s(AM|PM)/i);
         if (!parts) {
             // Fallback to Date constructor for other potential formats
             const date = new Date(dtString);
             return isNaN(date.getTime()) ? null : date;
         }
 
         const month = parseInt(parts[1], 10) - 1; 
         const day = parseInt(parts[2], 10);
         const year = parseInt(parts[3], 10);
         let hour = parseInt(parts[4], 10);
         const minute = parseInt(parts[5], 10);
         const ampm = parts[6].toUpperCase();
 
         if (ampm === 'PM' && hour < 12) hour += 12;
         if (ampm === 'AM' && hour === 12) hour = 0; // 12 AM is midnight (00 hours)
         
         return new Date(year, month, day, hour, minute);
     } catch (e) {
         console.error('Error parsing date:', dtString, e);
         return null;
     }
 }
 
 
 // --- Main Coloring and Note Application Function ---
 
 /**
  * Main function to find and color the rows and attach hover listeners based on rules.
  * This is exposed to the window to be callable from the popup.
  */
 window.applySalesforceColoring = function() {
     console.log('%cApplying Salesforce coloring and note rules...', 'color: blue; font-weight: bold;');
     
     chrome.storage.sync.get({ accountColorRules: [] }, (data) => {
         const { accountColorRules } = data;
         const now = new Date();
         const twentyFourHoursAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));
         
         // console.log(`Current Time (local): ${now.toLocaleString()}`);
         // console.log(`Threshold (24 hours ago): ${twentyFourHoursAgo.toLocaleString()}`);
 
         // Find all main data tables on the page
         const tables = document.querySelectorAll('table[role="grid"]');
         
         if (tables.length === 0) {
             // console.log("No list view tables found on the page.");
             return;
         }
 
         tables.forEach((table, tableIndex) => {
             const headers = table.querySelectorAll('thead th');
             const rows = table.querySelectorAll('tbody tr');
             if (rows.length === 0) return;
 
             let accountNameIndex = -1;
             let lastModifiedIndex = -1;
 
             // Find column indexes by reading header text content or aria-label
             headers.forEach((header, index) => {
                 const headerText = (header.getAttribute('aria-label') || header.textContent).trim().toLowerCase();
                 if (headerText === 'account name') accountNameIndex = index;
                 if (headerText === 'last modified date') lastModifiedIndex = index;
             });
             
             // console.log(`Table ${tableIndex + 1} - Column Indexes: Account Name [${accountNameIndex}], Last Modified Date [${lastModifiedIndex}]`);
 
             rows.forEach((row, rowIndex) => {
                 row.style.backgroundColor = ''; // Reset color
                 const cells = row.querySelectorAll('th, td');
                 if(cells.length === 0) return;
 
                 let appliedColor = ''; // To track the final color applied to the row
 
                 // --- 1. Last Modified Date Logic (Lower Priority) ---
                 if (lastModifiedIndex > -1 && cells.length > lastModifiedIndex) {
                     const cell = cells[lastModifiedIndex];
                     // Look for common Salesforce date display elements first
                     const dateElement = cell.querySelector('lightning-formatted-text, span[title]');
                     const dateText = dateElement ? dateElement.textContent.trim() : cell.textContent.trim();
                     
                     if (dateText) {
                         const lastModifiedDate = parseSalesforceDateTime(dateText);
                         if (lastModifiedDate) {
                             // Check if the date is in the past and older than 24 hours
                             if (lastModifiedDate < twentyFourHoursAgo) {
                                 appliedColor = '#ffcdd2'; // Light red
                             }
                         }
                     }
                 }
 
                 // --- 2. Account Name Logic (Higher Priority, overrides date color) ---
                 let accountNameForNote = null; // Store this for the tooltip logic
                 if (accountNameIndex > -1 && cells.length > accountNameIndex) {
                     const cell = cells[accountNameIndex];
                     // Look for <a> tag which usually contains the actual account name text
                     const accountElement = cell.querySelector('a[title], span'); 
                     const rawAccountNameText = accountElement ? accountElement.textContent.trim() : cell.textContent.trim();
                     accountNameForNote = rawAccountNameText; // Save for tooltip lookup
 
                     if (rawAccountNameText && accountColorRules.length > 0) {
                         const matchingRule = accountColorRules.find(rule => 
                             rule.accountName && rule.accountName.toLowerCase() === rawAccountNameText.toLowerCase()
                         );
                         if (matchingRule) {
                             appliedColor = matchingRule.color; // Override previous color if any
                         }
                     }
                 }
 
                 // Apply the determined background color
                 row.style.backgroundColor = appliedColor;
 
 
                 // --- 3. Attach Hover Events for Notes ---
                 // Remove existing listeners to prevent duplicates if function runs multiple times
                 row.removeEventListener('mouseenter', handleRowMouseEnter);
                 row.removeEventListener('mouseleave', handleRowMouseLeave);
 
                 if (accountNameForNote) {
                     // Store the account name directly on the row element for easy access in event handlers
                     row.dataset.accountNameForNote = accountNameForNote;
 
                     row.addEventListener('mouseenter', handleRowMouseEnter);
                     row.addEventListener('mouseleave', handleRowMouseLeave);
                 }
             });
         });
         console.log(`%cColoring and note rules processed for all list view tables.`, 'color: blue; font-weight: bold;');
     });
 };
 
 
 // --- Hover Event Handlers for Notes ---
 
 function handleRowMouseEnter(event) {
     const row = event.currentTarget;
 
     // If already hovering over this exact row, do nothing
     if (row === currentHoveredRow) {
         return;
     }
 
     // A new row is hovered, clear any pending hide action for previous row
     clearTimeout(hideTooltipTimeout);
 
     currentHoveredRow = row; // Set the new hovered row
 
     const accountName = row.dataset.accountNameForNote;
     if (!accountName || !noteTooltip) {
         hideTooltipImmediately(); // Hide if no account name or tooltip not ready
         return;
     }
 
     chrome.storage.sync.get({ accountColorRules: [] }, (data) => {
         const matchingRule = data.accountColorRules.find(rule => 
             rule.accountName && rule.accountName.toLowerCase() === accountName.toLowerCase()
         );
         const note = matchingRule ? matchingRule.note : '';
 
         if (note) {
             noteTooltip.textContent = note;
             
             // Show the tooltip immediately, then position it.
             // This ensures its dimensions are correct for positioning calculations.
             noteTooltip.style.opacity = '0'; // Start invisible
             noteTooltip.style.visibility = 'visible'; // Make it part of layout for calculation
             noteTooltip.style.transform = 'translateY(10px)'; // Reset initial transform for smooth re-entry
 
             const rect = row.getBoundingClientRect(); // Get row position *after* tooltip is in flow
 
             let leftPos = rect.left + (rect.width / 2) - (noteTooltip.offsetWidth / 2);
             let topPos = rect.top - noteTooltip.offsetHeight - 10; // 10px above the row
 
             // Adjust horizontally to stay within viewport
             if (leftPos < 5) {
                 leftPos = 5;
             }
             if (leftPos + noteTooltip.offsetWidth > window.innerWidth - 5) {
                 leftPos = window.innerWidth - noteTooltip.offsetWidth - 5;
             }
 
             // Adjust vertically if it goes off screen top (show below instead)
             if (topPos < 5) {
                 topPos = rect.bottom + 10;
                 noteTooltip.style.transform = 'translateY(-10px)'; // Slide down from above
             } else {
                 noteTooltip.style.transform = 'translateY(0)'; // Slide up from below
             }
 
             noteTooltip.style.left = `${leftPos}px`;
             noteTooltip.style.top = `${topPos}px`;
             
             // Animate in after positioning
             // Clear previous show timeout to prevent conflicts
             clearTimeout(showTooltipTimeout);
             showTooltipTimeout = setTimeout(() => {
                 noteTooltip.style.opacity = '1';
             }, 0); // Small delay to allow CSS transition to kick in
         } else {
             hideTooltipImmediately(); // Hide if no note
         }
     });
 }
 
 function handleRowMouseLeave() {
     // Clear any pending show animation
     clearTimeout(showTooltipTimeout);
 
     // Schedule hide after the specified duration
     hideTooltipTimeout = setTimeout(() => {
         hideTooltipAnimated(); // Perform animated hide
         currentHoveredRow = null; // Reset hovered row after hide is initiated
     }, NOTE_DISPLAY_DURATION);
 }
 
 // Function to hide the tooltip with animation
 function hideTooltipAnimated() {
     if (noteTooltip) {
         noteTooltip.style.opacity = '0';
         noteTooltip.style.transform = 'translateY(10px)'; // Prepare for next slide-up
         // Set visibility to hidden after the transition completes
         setTimeout(() => {
             if (noteTooltip) noteTooltip.style.visibility = 'hidden';
         }, 300); // Match CSS transition duration
     }
 }
 
 // Function to immediately hide the tooltip without animation
 function hideTooltipImmediately() {
     clearTimeout(showTooltipTimeout);
     clearTimeout(hideTooltipTimeout);
     if (noteTooltip) {
         noteTooltip.style.opacity = '0';
         noteTooltip.style.visibility = 'hidden';
         noteTooltip.style.transform = 'translateY(10px)';
     }
 }
 
 
 // --- Automatic Execution Logic ---
 
 let mainExecutionTimeout;
 let retryAttempts = 0;
 const MAX_RETRY_ATTEMPTS = 10; // Limit retry attempts to prevent infinite loops
 
 /**
  * A debounced function to trigger the coloring. This prevents the function
  * from running hundreds of times during a rapid series of page updates.
  */
 function scheduleMainExecution() {
     clearTimeout(mainExecutionTimeout);
     mainExecutionTimeout = setTimeout(() => {
         // console.log("Executing coloring function due to page change...");
         window.applySalesforceColoring();
     }, 750); // A slightly longer delay to ensure all components have rendered
 }
 
 // Create an observer to watch for any changes to the page body.
 const observer = new MutationObserver((mutationsList, obs) => {
     // Check for specific changes that indicate the list view might have rendered/updated
     let relevantChangeDetected = false;
     for (const mutation of mutationsList) {
         if (mutation.type === 'childList' || mutation.type === 'subtree') {
             // Look for added nodes that might indicate a table or row update
             if (mutation.addedNodes.length > 0) {
                 for (const node of mutation.addedNodes) {
                     if (node.nodeType === 1 && (node.matches('table[role="grid"] tbody tr') || node.matches('table[role="grid"]'))) {
                         relevantChangeDetected = true;
                         break;
                     }
                 }
             }
             // Also consider attribute changes on rows/cells if content updates without full re-render
             // if (mutation.type === 'attributes' && (mutation.target.matches('tr') || mutation.target.matches('td') || mutation.target.matches('th'))) {
             //     relevantChangeDetected = true;
             //     break;
             // }
         }
         if (relevantChangeDetected) break;
     }
 
     if (relevantChangeDetected) {
         // console.log("Detected relevant DOM change, scheduling coloring.");
         scheduleMainExecution();
         retryAttempts = 0; // Reset attempts on successful detection
     } else {
         // If no relevant change, but still haven't run initially, try again
         if (retryAttempts < MAX_RETRY_ATTEMPTS) {
             // console.log(`No relevant change detected, retrying (Attempt ${retryAttempts + 1})...`);
             retryAttempts++;
             scheduleMainExecution(); // Reschedule after a delay
         } else {
             // console.warn("Max retry attempts reached for initial coloring. List view might not be active or supported.");
             // obs.disconnect(); // Do not disconnect, as new views might load later on different routes
         }
     }
 });
 
 
 // Function to start observing the page for changes.
 function startObserver() {
     console.log("Salesforce Colorizer: Attaching observer to document.body...");
     observer.observe(document.body, {
         childList: true, // Observe direct children additions/removals
         subtree: true,   // Observe all descendants
         attributes: true, // Also observe attribute changes (e.g., Salesforce updating cell content)
         attributeFilter: ['aria-label', 'title', 'class', 'style'] // Limit attributes to observe if performance is an issue
     });
 
     // Run it once shortly after page load to catch initial state.
     setTimeout(() => {
         console.log("Initial coloring attempt after page load.");
         window.applySalesforceColoring();
     }, 2000); // Give Salesforce plenty of time to render initial view
 }
 
 // Ensure the observer starts after the whole page is loaded.
 window.addEventListener('load', startObserver);

  // Ensure the observer starts after the whole page is loaded.
 // Ensure the observer starts after the whole page is loaded.

 
 