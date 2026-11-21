// sidebar.js - With built-in login and fast responses
const API_BASE_URL = 'https://arnav0928.pythonanywhere.com';
let currentUser = null;

// DOM elements
const loginSection = document.getElementById('loginSection');
const chatSection = document.getElementById('chatSection');
const userEmailDisplay = document.getElementById('userEmailDisplay');
const loginEmail = document.getElementById('loginEmail');
const loginPassword = document.getElementById('loginPassword');
const loginBtn = document.getElementById('loginBtn');
const signupBtn = document.getElementById('signupBtn');
const logoutBtn = document.getElementById('logoutBtn');
const loginError = document.getElementById('loginError');
const chatArea = document.getElementById('chatArea');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const closeBtn = document.getElementById('closeSidebarBtn');

// Close sidebar
closeBtn.addEventListener('click', async () => {
    const window = await chrome.windows.getCurrent();
    await chrome.sidePanel.close({ windowId: window.id });
});

// Login
loginBtn.addEventListener('click', async () => {
    const email = loginEmail.value.trim();
    const password = loginPassword.value.trim();
    
    if (!email || !password) {
        loginError.textContent = 'Please enter email and password';
        return;
    }
    
    loginBtn.disabled = true;
    loginBtn.textContent = 'Logging in...';
    loginError.textContent = '';
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            currentUser = data.user;
            loginSection.style.display = 'none';
            chatSection.style.display = 'flex';
            userEmailDisplay.textContent = currentUser.email;
            addMessage(`Welcome back, ${currentUser.first_name || 'Wizard'}! 🧙`, 'assistant');
        } else {
            loginError.textContent = data.error || 'Login failed';
        }
    } catch (error) {
        loginError.textContent = 'Connection error. Please try again.';
    } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Login';
    }
});

// Signup redirect
signupBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://www.wizardai.dpdns.org' });
});

// Logout
logoutBtn.addEventListener('click', async () => {
    await fetch(`${API_BASE_URL}/api/logout`, { method: 'POST', credentials: 'include' });
    currentUser = null;
    loginSection.style.display = 'flex';
    chatSection.style.display = 'none';
    loginEmail.value = '';
    loginPassword.value = '';
    chatArea.innerHTML = '';
    addMessage('You have been logged out.', 'assistant');
});

// Check existing session on load
async function checkExistingSession() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/check-auth`, {
            credentials: 'include'
        });
        if (response.ok) {
            const data = await response.json();
            currentUser = data.user;
            loginSection.style.display = 'none';
            chatSection.style.display = 'flex';
            userEmailDisplay.textContent = currentUser.email;
        }
    } catch (error) {
        console.log('No existing session');
    }
}

// Send message
sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

async function sendMessage() {
    const message = messageInput.value.trim();
    if (!message) return;
    
    addMessage(message, 'user');
    messageInput.value = '';
    messageInput.disabled = true;
    sendBtn.disabled = true;
    
    addTypingIndicator();
    
    try {
        const pageData = await getPageContent();
        const response = await callWizardAPI(message, pageData);
        removeTypingIndicator();
        addMessage(response, 'assistant');
    } catch (error) {
        removeTypingIndicator();
        addMessage(`Error: ${error.message}`, 'assistant');
    } finally {
        messageInput.disabled = false;
        sendBtn.disabled = false;
        messageInput.focus();
    }
}

function addMessage(text, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}`;
    messageDiv.innerHTML = `
        <div class="avatar">${sender === 'user' ? '👤' : '🧙'}</div>
        <div class="content">${escapeHtml(text)}</div>
    `;
    chatArea.appendChild(messageDiv);
    chatArea.scrollTop = chatArea.scrollHeight;
}

function addTypingIndicator() {
    const typingDiv = document.createElement('div');
    typingDiv.id = 'typingIndicator';
    typingDiv.className = 'message assistant';
    typingDiv.innerHTML = `<div class="avatar">🧙</div><div class="content typing">Wizard is thinking...</div>`;
    chatArea.appendChild(typingDiv);
    chatArea.scrollTop = chatArea.scrollHeight;
}

function removeTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) indicator.remove();
}

async function getPageContent() {
    return new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
            if (tabs[0]) {
                try {
                    const results = await chrome.scripting.executeScript({
                        target: { tabId: tabs[0].id },
                        func: () => ({
                            title: document.title,
                            url: window.location.href,
                            content: document.body ? document.body.innerText.substring(0, 2000) : ''
                        })
                    });
                    const data = results[0]?.result;
                    resolve(`URL: ${data.url}\nTitle: ${data.title}\n\nContent: ${data.content}`);
                } catch (error) {
                    resolve('Could not access page content');
                }
            } else {
                resolve('No active tab');
            }
        });
    });
}

async function callWizardAPI(question, pageContent) {
    // Use streaming endpoint for faster responses
    try {
        const response = await fetch(`${API_BASE_URL}/api/chat/stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                prompt: `Based on this webpage, answer concisely.\n\n${pageContent.substring(0, 2000)}\n\nQuestion: ${question}\n\nShort answer:`,
                mode: 'Fast',
                search: false,
                turbo: false
            })
        });
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = '';
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') continue;
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.token) fullResponse += parsed.token;
                    } catch (e) {}
                }
            }
        }
        
        return fullResponse || 'No response from Wizard';
    } catch (error) {
        return `Error: ${error.message}`;
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Listen for messages from background (right-click)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'askQuestion') {
        if (chatSection.style.display === 'flex') {
            messageInput.value = message.question;
            sendMessage();
        } else {
            // Store question for after login
            chrome.storage.local.set({ pendingQuestion: message.question });
        }
        sendResponse({ success: true });
    }
    return true;
});

// Check for pending question after login
function checkPendingQuestion() {
    chrome.storage.local.get(['pendingQuestion'], (result) => {
        if (result.pendingQuestion) {
            setTimeout(() => {
                messageInput.value = result.pendingQuestion;
                sendMessage();
                chrome.storage.local.remove('pendingQuestion');
            }, 1000);
        }
    });
}

// Initialize
checkExistingSession();
setInterval(() => {
    if (chatSection.style.display === 'flex') {
        checkPendingQuestion();
    }
}, 1000);