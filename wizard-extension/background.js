// background.js - Complete working version
chrome.runtime.onInstalled.addListener(() => {
    console.log('Wizard.AI Extension Installed');
    
    // Remove existing menus to avoid duplicates
    chrome.contextMenus.removeAll(() => {
        // Create right-click menu for selected text
        chrome.contextMenus.create({
            id: 'askWizard',
            title: '🤔 Ask Wizard.AI: "%s"',
            contexts: ['selection']
        });
        
        // Create right-click menu for entire page
        chrome.contextMenus.create({
            id: 'summarizePage',
            title: '📄 Summarize this page with Wizard.AI',
            contexts: ['page']
        });
        
        console.log('Context menus created');
    });
});

// Handle right-click menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    console.log('Context menu clicked:', info.menuItemId);
    
    if (info.menuItemId === 'askWizard') {
        const selectedText = info.selectionText;
        console.log('Selected text:', selectedText);
        
        // Open sidebar
        await chrome.sidePanel.open({ tabId: tab.id });
        
        // Send question to sidebar after it opens
        setTimeout(() => {
            chrome.tabs.sendMessage(tab.id, { 
                action: 'askQuestion', 
                question: `Answer this about the page: ${selectedText}`
            }).catch(() => {
                // If content script not available, send via runtime
                chrome.runtime.sendMessage({ 
                    action: 'askQuestion', 
                    question: `Answer this about the page: ${selectedText}` 
                });
            });
        }, 500);
    } 
    else if (info.menuItemId === 'summarizePage') {
        await chrome.sidePanel.open({ tabId: tab.id });
        
        setTimeout(() => {
            chrome.tabs.sendMessage(tab.id, { action: 'summarize' }).catch(() => {
                chrome.runtime.sendMessage({ action: 'summarize' });
            });
        }, 500);
    }
});

// Handle messages from content script (floating button click)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Message received:', message.action);
    
    if (message.action === 'openSidebar') {
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
            if (tabs[0]) {
                await chrome.sidePanel.open({ tabId: tabs[0].id });
                sendResponse({ success: true });
            } else {
                sendResponse({ success: false, error: 'No active tab' });
            }
        });
        return true;
    }
    
    if (message.action === 'getPageContent') {
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
            if (tabs[0]) {
                try {
                    const results = await chrome.scripting.executeScript({
                        target: { tabId: tabs[0].id },
                        func: () => ({
                            title: document.title,
                            url: window.location.href,
                            content: document.body ? document.body.innerText.substring(0, 3000) : ''
                        })
                    });
                    sendResponse({ success: true, data: results[0]?.result });
                } catch (error) {
                    sendResponse({ success: false, error: error.message });
                }
            } else {
                sendResponse({ success: false, error: 'No active tab' });
            }
        });
        return true;
    }
    
    // Always return true for async responses
    sendResponse({ success: true });
    return true;
});

// Optional: open popup as fallback
chrome.action.onClicked.addListener((tab) => {
    chrome.sidePanel.open({ tabId: tab.id });
});