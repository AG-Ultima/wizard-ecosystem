const API_BASE_URL = 'https://arnav0928.pythonanywhere.com';

document.getElementById('summarizeBtn').addEventListener('click', async () => {
    const responseDiv = document.getElementById('responseArea');
    responseDiv.innerHTML = '<div class="placeholder">✨ Summarizing...</div>';
    
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        // Get page content via background script
        const content = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'getPageContent' }, (response) => {
                if (response && response.success) {
                    resolve(response.data.content);
                } else {
                    resolve('');
                }
            });
        });
        
        const result = await callWizardAPI(`Summarize this webpage content in 3-5 bullet points:\n\n${content.substring(0, 3000)}`);
        responseDiv.innerHTML = `<div>📄 <strong>Summary:</strong><br><br>${result}</div>`;
    } catch (error) {
        responseDiv.innerHTML = `<div class="placeholder">❌ Error: ${error.message}</div>`;
    }
});

document.getElementById('askWizardBtn').addEventListener('click', () => {
    const question = prompt('What would you like to ask about this page?');
    if (question) {
        document.getElementById('questionInput').value = question;
        askQuestion();
    }
});

document.getElementById('openSidebarBtn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.sidePanel.open({ tabId: tab.id });
});

document.getElementById('askBtn').addEventListener('click', askQuestion);
document.getElementById('questionInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') askQuestion();
});

async function askQuestion() {
    const question = document.getElementById('questionInput').value.trim();
    if (!question) return;
    
    const responseDiv = document.getElementById('responseArea');
    responseDiv.innerHTML = '<div class="placeholder">🤔 Thinking...</div>';
    
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        const content = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'getPageContent' }, (response) => {
                if (response && response.success) {
                    resolve(response.data.content);
                } else {
                    resolve('');
                }
            });
        });
        
        const result = await callWizardAPI(`Based on this webpage content, answer: ${question}\n\nContent: ${content.substring(0, 3000)}`);
        responseDiv.innerHTML = `<div>🤖 <strong>Answer:</strong><br><br>${result}</div>`;
    } catch (error) {
        responseDiv.innerHTML = `<div class="placeholder">❌ Error: ${error.message}</div>`;
    }
}

async function callWizardAPI(prompt) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/chat/simple`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, mode: 'Fast' })
        });
        const data = await response.json();
        return data.response || 'No response from Wizard';
    } catch (error) {
        return `Error: ${error.message}`;
    }
}