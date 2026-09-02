// ============================================
// WIZARD.AI PRO v15.2.0 - ECOSYSTEM AI INTEGRATION
// Complete Frontend Controller with Ecosystem AI
// Created by Arnav Gupta
// ============================================

const API_BASE_URL = 'https://arnav0928.pythonanywhere.com';
const SITE_URL = 'https://wizardecosystem.dev/ai';

// ============================================
// MARKDOWN RENDERING FUNCTION
// ============================================

function renderMarkdown(text) {
    if (!text) return '';
    
    let html = text;
    
    // Headers
    html = html.replace(/^### (.*$)/gm, '<h3 class="md-h3">$1</h3>');
    html = html.replace(/^## (.*$)/gm, '<h2 class="md-h2">$1</h2>');
    html = html.replace(/^# (.*$)/gm, '<h1 class="md-h1">$1</h1>');
    
    // Bold and Italic
    html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Code blocks
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Lists
    html = html.replace(/^\s*-\s+(.*$)/gm, '<li>$1</li>');
    html = html.replace(/^\s*\d+\.\s+(.*$)/gm, '<li class="ordered">$1</li>');
    
    // Wrap list items
    html = html.replace(/(<li>.*?<\/li>\n?)+/g, '<ul>$&</ul>');
    html = html.replace(/<ul>(<li class="ordered">.*?<\/li>\n?)+<\/ul>/g, function(match) {
        return match.replace(/<ul>/, '<ol>').replace(/<\/ul>/, '</ol>').replace(/<li class="ordered">/g, '<li>');
    });
    
    // Blockquotes
    html = html.replace(/^> (.*$)/gm, '<blockquote>$1</blockquote>');
    html = html.replace(/<\/blockquote>\n<blockquote>/g, '<br>');
    
    // Horizontal rule
    html = html.replace(/^---$/gm, '<hr>');
    
    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    
    // Line breaks
    html = html.replace(/\n/g, '<br>');
    
    // Clean up
    html = '<div class="markdown-body">' + html + '</div>';
    html = html.replace(/<p><br><\/p>/g, '');
    
    return html;
}

// ============================================
// DOM ELEMENTS
// ============================================

const chatHistory = document.getElementById('chat-history');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const voiceBtn = document.getElementById('voice-input-btn');
const statusText = document.getElementById('status-text');
const statusDot = document.querySelector('.status-dot');
const dropdown = document.getElementById('mode-dropdown');
const dropdownBtn = document.getElementById('dropdown-btn');
const dropdownContent = document.getElementById('dropdown-content');
const selectedDisplay = document.getElementById('selected-mode-display');
const chatsList = document.getElementById('chats-list');
const newChatBtn = document.getElementById('new-chat-btn');
const currentChatName = document.getElementById('current-chat-name');
const currentChatEmoji = document.getElementById('current-chat-emoji');
const renameChatBtn = document.getElementById('rename-chat-btn');
const deleteChatBtn = document.getElementById('delete-chat-btn');
const resetCurrentBtn = document.getElementById('reset-current-btn');
const updateHistoryBtn = document.getElementById('update-history-btn');
const statMessages = document.getElementById('stat-messages');
const statFiles = document.getElementById('stat-files');
const statProfile = document.getElementById('stat-profile-completeness');
const statImages = document.getElementById('stat-images');
const statSearches = document.getElementById('stat-searches');
const statResponse = document.getElementById('stat-response');
const quickToday = document.getElementById('quick-today');
const quickTotal = document.getElementById('quick-total');
const searchBtn = document.getElementById('search-btn');
const uploadBtn = document.getElementById('upload-btn');
const codeBtn = document.getElementById('code-btn');
const imageBtn = document.getElementById('image-btn');
const profileBtn = document.getElementById('profile-btn');
const statsBtn = document.getElementById('stats-btn');
const personalitiesBtn = document.getElementById('personalities-btn');
const devHubBtn = document.getElementById('devhub-btn');
const agentStudioBtn = document.getElementById('agent-studio-btn');
const searchIndicator = document.getElementById('search-indicator');
const inputSearchIndicator = document.getElementById('input-search-indicator');
const typingIndicator = document.getElementById('typing-indicator');
const uploadProgress = document.getElementById('upload-progress');
const progressBarFill = document.getElementById('progress-bar-fill');
const progressText = document.getElementById('progress-text');
const authModal = document.getElementById('auth-modal-overlay');
const renameModal = document.getElementById('rename-modal-overlay');
const codeModal = document.getElementById('code-modal-overlay');
const imageModal = document.getElementById('image-modal-overlay');
const profileModal = document.getElementById('profile-modal-overlay');
const statsModal = document.getElementById('stats-modal-overlay');
const personalitiesModal = document.getElementById('personalities-modal-overlay');
const updateModal = document.getElementById('update-modal-overlay');
const closeAuth = document.getElementById('close-auth-modal');
const closeCode = document.getElementById('close-code-modal');
const closeImage = document.getElementById('close-image-modal');
const closeProfile = document.getElementById('close-profile-modal');
const closeStats = document.getElementById('close-stats-modal');
const closePersonalities = document.getElementById('close-personalities-modal');
const closeUpdate = document.getElementById('close-update-modal');
const authEmail = document.getElementById('auth-email');
const authPassword = document.getElementById('auth-password');
const authConfirm = document.getElementById('auth-confirm');
const authError = document.getElementById('auth-error');
const authSubmit = document.getElementById('auth-submit');
const authSwitchBtn = document.getElementById('auth-switch-btn');
const authSwitchText = document.getElementById('auth-switch-text');
const authModalTitle = document.getElementById('auth-modal-title');
const firstNameGroup = document.getElementById('first-name-group');
const lastNameGroup = document.getElementById('last-name-group');
const firstNameInput = document.getElementById('first-name');
const lastNameInput = document.getElementById('last-name');
const verificationGroup = document.getElementById('verification-group');
const verificationInput = document.getElementById('verification-code');
const resendCodeBtn = document.getElementById('resend-code-btn');
const confirmPasswordGroup = document.getElementById('confirm-password-group');
const userInfo = document.getElementById('user-info');
const authButtons = document.getElementById('auth-buttons');
const userEmail = document.getElementById('user-email');
const userName = document.getElementById('user-name');
const userAvatar = document.getElementById('user-avatar');
const logoutBtn = document.getElementById('logout-btn');
const toggleCreatorBtn = document.getElementById('toggle-creator-btn');
const creatorPanel = document.getElementById('creator-panel');
const customName = document.getElementById('custom-name');
const customEmoji = document.getElementById('custom-emoji');
const customPrompt = document.getElementById('custom-prompt');
const customGreeting = document.getElementById('custom-greeting');
const customPublic = document.getElementById('custom-public');
const savePersonality = document.getElementById('save-personality');
const cancelPersonality = document.getElementById('cancel-personality');
const closeCreator = document.getElementById('close-creator');
const personalitiesList = document.getElementById('personalities-list');
const personalitiesGrid = document.getElementById('personalities-grid');
const tabBtns = document.querySelectorAll('.tab-btn');
const fileUpload = document.getElementById('file-upload');
const codeInput = document.getElementById('code-input');
const codeOutput = document.getElementById('code-output');
const runCodeBtn = document.getElementById('run-code');
const clearCodeBtn = document.getElementById('clear-code');
const imagePrompt = document.getElementById('image-prompt');
const imageSize = document.getElementById('image-size');
const generateImageBtn = document.getElementById('generate-image');
const imageResult = document.getElementById('image-result');
const statsCreated = document.getElementById('stats-created');
const statsLast = document.getElementById('stats-last');
const statsTotalMsgs = document.getElementById('stats-total-msgs');
const statsTotalChats = document.getElementById('stats-total-chats');
const statsFilesDetailed = document.getElementById('stats-files-detailed');
const statsImagesDetailed = document.getElementById('stats-images-detailed');
const statsCodeDetailed = document.getElementById('stats-code-detailed');
const statsSearchesDetailed = document.getElementById('stats-searches-detailed');
const statsMemories = document.getElementById('stats-memories');
const statsDocs = document.getElementById('stats-docs');
const statsAvgResponse = document.getElementById('stats-avg-response');
const statsFastest = document.getElementById('stats-fastest');
const statsApiKeysDetailed = document.getElementById('stats-api-keys-detailed');
const statsProfileCompleteness = document.getElementById('stats-profile-completeness');
const statsSkillsCount = document.getElementById('stats-skills-count');
const statsInterestsCount = document.getElementById('stats-interests-count');
const statsGoalsCount = document.getElementById('stats-goals-count');
const renameInput = document.getElementById('rename-input');
const renameSave = document.getElementById('modal-save');
const renameCancel = document.getElementById('modal-cancel');
const notificationToast = document.getElementById('notification-toast');
const turboBtn = document.getElementById('turbo-btn');
const turboStatus = document.getElementById('turbo-status');

// Profile Modal Elements
const profileFullName = document.getElementById('profile-full-name');
const profileDisplayName = document.getElementById('profile-display-name');
const profileBirthday = document.getElementById('profile-birthday');
const profileGender = document.getElementById('profile-gender');
const profileBio = document.getElementById('profile-bio');
const profilePhone = document.getElementById('profile-phone');
const profileWebsite = document.getElementById('profile-website');
const profileGreeting = document.getElementById('profile-greeting');
const profileOccupation = document.getElementById('profile-occupation');
const profileCompany = document.getElementById('profile-company');
const profileExperience = document.getElementById('profile-experience');
const profileEducation = document.getElementById('profile-education');
const profileSkills = document.getElementById('profile-skills');
const profileInterests = document.getElementById('profile-interests');
const profileFavTopics = document.getElementById('profile-fav-topics');
const profileLearning = document.getElementById('profile-learning');
const profileKnown = document.getElementById('profile-known');
const profilePreferredMode = document.getElementById('profile-preferred-mode');
const profileResponseStyle = document.getElementById('profile-response-style');
const profileFormality = document.getElementById('profile-formality');
const profileEmojis = document.getElementById('profile-emojis');
const profileInstructions = document.getElementById('profile-instructions');
const profileGoals = document.getElementById('profile-goals');
const profileReminders = document.getElementById('profile-reminders');
const profileCompletenessFill = document.getElementById('profile-completeness-fill');
const profileCompletenessText = document.getElementById('profile-completeness-text');
const saveProfileBtn = document.getElementById('save-profile');
const closeProfileBtn = document.getElementById('close-profile');
const profileTabBtns = document.querySelectorAll('.profile-tab-btn');

// ============================================
// ECOSYSTEM AI QUICK ACTIONS
// ============================================

function addEcosystemQuickActions() {
    const toolbar = document.getElementById('pro-toolbar');
    if (!toolbar) return;
    
    if (document.getElementById('ecosystem-ai-btn')) return;
    
    const ecosystemBtn = document.createElement('button');
    ecosystemBtn.id = 'ecosystem-ai-btn';
    ecosystemBtn.className = 'pro-btn ecosystem-btn';
    ecosystemBtn.innerHTML = `<span class="btn-icon" aria-hidden="true">🧠</span><span class="btn-text">Ecosystem AI</span>`;
    ecosystemBtn.title = 'Ask AI about your emails, notes, and calendar';
    ecosystemBtn.style.borderColor = 'var(--violet)';
    ecosystemBtn.style.color = 'var(--violet)';
    
    ecosystemBtn.addEventListener('click', () => {
        const input = chatInput;
        input.placeholder = 'Ask about your ecosystem: "Prepare me for my 3 PM meeting about Project X"';
        input.focus();
        input.style.borderColor = 'var(--violet)';
        setTimeout(() => {
            input.style.borderColor = '';
        }, 3000);
        
        showNotification('🧠 Ask about emails, notes, or calendar!', 'info', 3000);
    });
    
    toolbar.appendChild(ecosystemBtn);
}

// ============================================
// STATE MANAGEMENT
// ============================================
let messages = [];
let isThinking = false;
let currentMode = 'JARVIS';
let turboMode = false;
let searchMode = false;
let currentUser = null;
let activeChatId = 'default';
let chats = {};
let chatIds = ['default'];
let customPersonalities = [];
let publicPersonalities = [];
let isLoginMode = true;
let signupEmail = '';
let sessionCheckInterval = null;
let voiceRecognition = null;
let isVoiceListening = false;
let chatToRename = null;
let userProfile = null;
let userStats = {
    messages: 0, files: 0, memories: 0, images: 0, searches: 0,
    codeExecutions: 0, responseTimes: [], todayMessages: 0
};
let pwaDeferredPrompt = null;

// Mobile detection
const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
let sidebarOpen = false;

// ============================================
// MODE DATA
// ============================================
const modeData = {
    'Fast': { emoji: '⚡', name: 'Fast Mode', desc: 'Lightning quick responses.', model: 'Llama 4 Scout', color: '#10b981' },
    'Normal': { emoji: '✨', name: 'Normal Mode', desc: 'Balanced conversation.', model: 'Llama 4 Scout', color: '#10b981' },
    'Fun': { emoji: '🎉', name: 'Fun Mode', desc: 'Playful and energetic!', model: 'Llama 4 Scout', color: '#8b5cf6' },
    'Sarcastic': { emoji: '😏', name: 'Sarcastic Mode', desc: 'Witty and sarcastic.', model: 'Llama 4 Scout', color: '#10b981' },
    'Nerd': { emoji: '🧠', name: 'Nerd Mode', desc: 'Detailed and academic.', model: 'Llama 4 Scout', color: '#8b5cf6' },
    'JARVIS': { emoji: '🎩', name: 'JARVIS Mode', desc: 'Sophisticated AI assistant.', model: 'Llama 4 Scout', color: '#00aaff' },
    'ORACLE': { emoji: '🔮', name: 'ORACLE Mode', desc: 'Mystical and all-knowing.', model: 'Llama 4 Scout', color: '#8b5cf6' }
};

// ============================================
// TIMEZONE DETECTION & SAVING
// ============================================

async function detectAndSaveTimezone() {
    if (!currentUser) return;
    
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!timezone) return;
    
    console.log(`🌐 Detected timezone: ${timezone}`);
    
    try {
        await fetch(`${API_BASE_URL}/api/memory/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ 
                key: 'preferred_timezone', 
                value: timezone, 
                category: 'preference' 
            })
        });
        
        await fetch(`${API_BASE_URL}/api/user/timezone`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ timezone: timezone })
        });
        
        console.log(`✅ Timezone saved: ${timezone}`);
    } catch (error) {
        console.error('Failed to save timezone:', error);
    }
}

// ============================================
// PROFILE FUNCTIONS
// ============================================

async function loadProfile() {
    if (!currentUser) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/profile`, {
            credentials: 'include'
        });
        
        if (response.ok) {
            const data = await response.json();
            userProfile = data.profile;
            updateProfileForm();
            updateProfileCompleteness();
            console.log('✅ Profile loaded:', userProfile);
        }
    } catch (error) {
        console.error('Error loading profile:', error);
    }
}

function updateProfileForm() {
    if (!userProfile) return;
    
    if (profileFullName) profileFullName.value = userProfile.full_name || '';
    if (profileDisplayName) profileDisplayName.value = userProfile.display_name || '';
    if (profileBirthday) profileBirthday.value = userProfile.birthday || '';
    if (profileGender) profileGender.value = userProfile.gender || '';
    if (profileBio) profileBio.value = userProfile.bio || '';
    if (profilePhone) profilePhone.value = userProfile.phone || '';
    if (profileWebsite) profileWebsite.value = userProfile.website || '';
    if (profileGreeting) profileGreeting.value = userProfile.custom_greeting || '';
    if (profileOccupation) profileOccupation.value = userProfile.occupation || '';
    if (profileCompany) profileCompany.value = userProfile.company || '';
    if (profileExperience) profileExperience.value = userProfile.experience_years || '';
    if (profileEducation) profileEducation.value = Array.isArray(userProfile.education) ? userProfile.education.join(', ') : '';
    if (profileSkills) profileSkills.value = Array.isArray(userProfile.skills) ? userProfile.skills.join(', ') : '';
    if (profileInterests) profileInterests.value = Array.isArray(userProfile.interests) ? userProfile.interests.join(', ') : '';
    if (profileFavTopics) profileFavTopics.value = Array.isArray(userProfile.favorite_topics) ? userProfile.favorite_topics.join(', ') : '';
    if (profileLearning) profileLearning.value = Array.isArray(userProfile.learning_interests) ? userProfile.learning_interests.join(', ') : '';
    if (profileKnown) profileKnown.value = Array.isArray(userProfile.known_topics) ? userProfile.known_topics.join(', ') : '';
    if (profilePreferredMode) profilePreferredMode.value = userProfile.preferred_mode || 'JARVIS';
    if (profileResponseStyle) profileResponseStyle.value = userProfile.response_style || 'balanced';
    if (profileFormality) profileFormality.value = userProfile.formality_level || 'casual';
    if (profileEmojis) profileEmojis.value = userProfile.emoji_preference !== false ? 'true' : 'false';
    if (profileInstructions) profileInstructions.value = userProfile.custom_instructions || '';
    if (profileGoals) profileGoals.value = Array.isArray(userProfile.goals) ? userProfile.goals.map(g => typeof g === 'object' ? g.text : g).join('\n') : '';
    if (profileReminders) profileReminders.value = Array.isArray(userProfile.reminders) ? userProfile.reminders.join('\n') : '';
}

function updateProfileCompleteness() {
    if (userProfile && userProfile.profile_completeness) {
        const completeness = userProfile.profile_completeness;
        if (profileCompletenessFill) profileCompletenessFill.style.width = `${completeness}%`;
        if (profileCompletenessText) profileCompletenessText.textContent = `${completeness}%`;
        if (statProfile) statProfile.textContent = `${completeness}%`;
    }
}

async function saveProfile() {
    if (!currentUser) {
        showNotification('Please login to save profile', 'error');
        return;
    }
    
    const profileData = {
        full_name: profileFullName?.value || null,
        display_name: profileDisplayName?.value || null,
        birthday: profileBirthday?.value || null,
        gender: profileGender?.value || null,
        bio: profileBio?.value || null,
        phone: profilePhone?.value || null,
        website: profileWebsite?.value || null,
        custom_greeting: profileGreeting?.value || null,
        occupation: profileOccupation?.value || null,
        company: profileCompany?.value || null,
        experience_years: profileExperience?.value ? parseInt(profileExperience.value) : null,
        education: profileEducation?.value ? profileEducation.value.split(',').map(s => s.trim()).filter(s => s) : [],
        skills: profileSkills?.value ? profileSkills.value.split(',').map(s => s.trim()).filter(s => s) : [],
        interests: profileInterests?.value ? profileInterests.value.split(',').map(s => s.trim()).filter(s => s) : [],
        favorite_topics: profileFavTopics?.value ? profileFavTopics.value.split(',').map(s => s.trim()).filter(s => s) : [],
        learning_interests: profileLearning?.value ? profileLearning.value.split(',').map(s => s.trim()).filter(s => s) : [],
        known_topics: profileKnown?.value ? profileKnown.value.split(',').map(s => s.trim()).filter(s => s) : [],
        preferred_mode: profilePreferredMode?.value || 'JARVIS',
        response_style: profileResponseStyle?.value || 'balanced',
        formality_level: profileFormality?.value || 'casual',
        emoji_preference: profileEmojis?.value === 'true',
        custom_instructions: profileInstructions?.value || null,
        goals: profileGoals?.value ? profileGoals.value.split('\n').filter(s => s.trim()) : [],
        reminders: profileReminders?.value ? profileReminders.value.split('\n').filter(s => s.trim()) : []
    };
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/profile/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(profileData)
        });
        
        if (response.ok) {
            const data = await response.json();
            userProfile = data.profile;
            updateProfileCompleteness();
            showNotification('✅ Profile saved successfully!', 'success');
            closeModal(profileModal);
        } else {
            const error = await response.json();
            showNotification(error.error || 'Failed to save profile', 'error');
        }
    } catch (error) {
        console.error('Save profile error:', error);
        showNotification('Error saving profile', 'error');
    }
}

async function openProfileModal() {
    if (!currentUser) {
        showNotification('Please login to view profile', 'error');
        showAuthModal(true);
        return;
    }
    
    await loadProfile();
    openModal(profileModal);
}

function initProfileTabs() {
    if (!profileTabBtns.length) return;
    
    profileTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            
            profileTabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            document.querySelectorAll('.profile-tab-content').forEach(content => {
                content.classList.remove('active');
            });
            const activeContent = document.getElementById(`profile-tab-${tabId}`);
            if (activeContent) activeContent.classList.add('active');
        });
    });
}

// ============================================
// IMAGE FUNCTIONS
// ============================================

function downloadImage(url) {
    const a = document.createElement('a');
    a.href = url;
    a.download = 'wizard-ai-image.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function addImageMessage(imageData, prompt, source = 'AI') {
    if (!chatHistory) return;
    
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message assistant';
    msgDiv.innerHTML = `
        <div class="message-content">
            <div class="message-text">
                <div class="image-container" style="background: rgba(0,0,0,0.2); border-radius: 16px; padding: 16px;">
                    <img src="${imageData}" alt="${escapeHtml(prompt)}" style="max-width:100%; border-radius:12px; box-shadow:0 0 30px rgba(139,92,246,0.3);">
                    <div style="display:flex; gap:10px; margin-top:12px; flex-wrap:wrap;">
                        <button onclick="window.open('${imageData}', '_blank')" class="glass-button">🔍 View Full Size</button>
                        <button onclick="downloadImage('${imageData}')" class="glass-button">💾 Download</button>
                    </div>
                    <div style="font-size:12px; color:var(--text-muted); margin-top:8px;">🎨 Generated by ${escapeHtml(source)}: ${escapeHtml(prompt)}</div>
                </div>
            </div>
            <div class="message-time">${new Date().toLocaleTimeString()}</div>
        </div>
    `;
    chatHistory.appendChild(msgDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;
    
    messages.push({
        sender: 'assistant',
        text: `🎨 Generated image: ${prompt}`,
        mode: currentMode,
        timestamp: new Date().toISOString(),
        image: imageData
    });
    
    if (chats[activeChatId]) {
        chats[activeChatId].messages = [...messages];
        saveChats();
    }
    
    trackImage();
}

function addThinkingMessage() {
    if (!chatHistory) return;
    
    const thinkingId = 'thinking-' + Date.now();
    const msgDiv = document.createElement('div');
    msgDiv.id = thinkingId;
    msgDiv.className = 'message assistant thinking';
    msgDiv.innerHTML = `
        <div class="message-content">
            <div class="message-text">
                <div class="thinking-container">
                    <div class="thinking-indicator">
                        <span class="thinking-dot"></span>
                        <span class="thinking-dot"></span>
                        <span class="thinking-dot"></span>
                        <span class="thinking-text">Thinking</span>
                    </div>
                    <div class="thinking-process" style="display:none; margin-top: 8px; font-size: 13px; color: var(--text-muted); padding: 8px 12px; background: rgba(0,0,0,0.2); border-radius: 8px;">
                    </div>
                    <button class="thinking-toggle" style="background:none; border:none; color: var(--primary-light); cursor:pointer; font-size: 12px; margin-top: 4px; opacity:0.7;">💭 Show thought process</button>
                </div>
            </div>
            <div class="message-time">${new Date().toLocaleTimeString()}</div>
        </div>
    `;
    chatHistory.appendChild(msgDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;
    
    const toggleBtn = msgDiv.querySelector('.thinking-toggle');
    const processDiv = msgDiv.querySelector('.thinking-process');
    
    toggleBtn.addEventListener('click', () => {
        if (processDiv.style.display === 'none') {
            processDiv.style.display = 'block';
            toggleBtn.textContent = '💭 Hide thought process';
        } else {
            processDiv.style.display = 'none';
            toggleBtn.textContent = '💭 Show thought process';
        }
    });
    
    return { id: thinkingId, element: msgDiv, processDiv: processDiv };
}

function updateThinkingMessage(thinkingId, text) {
    const msgDiv = document.getElementById(thinkingId);
    if (!msgDiv) return;
    
    const processDiv = msgDiv.querySelector('.thinking-process');
    if (processDiv) {
        processDiv.innerHTML = text;
    }
}

function removeThinkingMessage(thinkingId) {
    const msgDiv = document.getElementById(thinkingId);
    if (msgDiv) {
        msgDiv.remove();
    }
}

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Initializing Wizard.AI v15.2.0 - Ecosystem AI...');
    console.log('📱 Mobile device:', isMobile);
    
    showNotification('🧙 Summoning the Wizard with Ecosystem AI...', 'info', 2000);
    registerServiceWorker();
    setupEventListeners();
    setupDropdown();
    setupModals();
    initVoiceRecognition();
    initProfileTabs();
    addEcosystemQuickActions();
    
    if (isMobile) {
        initMobileLayout();
    }
    
    loadGuestData();
    await checkAuth();
    if (currentUser) {
        startSessionCheck();
        await detectAndSaveTimezone();
        await loadProfile();
    }
    loadCustomPersonalities();
    loadChats();
    await loadStats();
    await loadUserApiKeys();
    loadPublicPersonalities();
    setupDevHubButton();
    setupAgentStudioButton();
    setupApiKeysButton();
    setInterval(updateStatsDisplay, 30000);
    checkBackendStatus();
    setInterval(checkBackendStatus, 30000);
    setupPWAInstallPrompt();
    
    console.log('✅ Wizard.AI v15.2.0 - Ecosystem AI ready!');
    console.log('🧠 Type "Prepare me for my meeting" or "Find related notes"');
    console.log('🎨 Type "Generate an image of..." to create AI images in chat!');
});

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/service-worker.js')
            .then(reg => console.log('✅ Service Worker registered'))
            .catch(err => console.log('❌ Service Worker error:', err));
    }
}

// ============================================
// AGENT STUDIO BUTTON
// ============================================
function setupAgentStudioButton() {
    if (agentStudioBtn) {
        agentStudioBtn.addEventListener('click', () => {
            window.open('/ai/agent-studio/', '_blank');
        });
    }
}

// ============================================
// MOBILE LAYOUT
// ============================================
function initMobileLayout() {
    const leftSidebar = document.querySelector('.sidebar');
    const rightSidebar = document.querySelector('.chats-sidebar');
    const appContainer = document.querySelector('.app-container');
    
    if (leftSidebar) leftSidebar.style.display = 'none';
    if (rightSidebar) rightSidebar.style.display = 'none';
    if (appContainer) appContainer.style.flexDirection = 'column';
    
    const hamburgerBtn = document.createElement('button');
    hamburgerBtn.innerHTML = '☰';
    hamburgerBtn.className = 'hamburger-menu';
    hamburgerBtn.style.cssText = `
        position: fixed;
        top: 15px;
        left: 15px;
        z-index: 10000;
        background: linear-gradient(135deg, #8b5cf6, #6d28d9);
        border: none;
        border-radius: 50%;
        width: 45px;
        height: 45px;
        font-size: 24px;
        color: white;
        cursor: pointer;
        box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        transition: all 0.3s ease;
    `;
    document.body.appendChild(hamburgerBtn);
    
    const overlay = document.createElement('div');
    overlay.className = 'mobile-sidebar-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.7);
        z-index: 10001;
        display: none;
        backdrop-filter: blur(5px);
    `;
    document.body.appendChild(overlay);
    
    const mobilePanel = document.createElement('div');
    mobilePanel.className = 'mobile-sidebar-panel';
    mobilePanel.style.cssText = `
        position: fixed;
        top: 0;
        left: -280px;
        width: 280px;
        height: 100%;
        background: linear-gradient(135deg, #0a0f1a, #030614);
        z-index: 10002;
        transition: left 0.3s ease;
        overflow-y: auto;
        padding: 20px;
        box-shadow: 2px 0 20px rgba(0,0,0,0.5);
    `;
    
    if (leftSidebar) {
        const leftSidebarClone = leftSidebar.cloneNode(true);
        leftSidebarClone.style.display = 'block';
        leftSidebarClone.style.width = '100%';
        leftSidebarClone.style.background = 'transparent';
        leftSidebarClone.style.border = 'none';
        mobilePanel.appendChild(leftSidebarClone);
    }
    
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '✕';
    closeBtn.style.cssText = `
        position: absolute;
        top: 15px;
        right: 15px;
        background: rgba(255,255,255,0.1);
        border: none;
        border-radius: 50%;
        width: 35px;
        height: 35px;
        font-size: 18px;
        color: white;
        cursor: pointer;
    `;
    mobilePanel.appendChild(closeBtn);
    document.body.appendChild(mobilePanel);
    
    function toggleSidebar() {
        sidebarOpen = !sidebarOpen;
        if (sidebarOpen) {
            mobilePanel.style.left = '0';
            overlay.style.display = 'block';
            hamburgerBtn.innerHTML = '✕';
        } else {
            mobilePanel.style.left = '-280px';
            overlay.style.display = 'none';
            hamburgerBtn.innerHTML = '☰';
        }
    }
    
    hamburgerBtn.addEventListener('click', toggleSidebar);
    overlay.addEventListener('click', toggleSidebar);
    closeBtn.addEventListener('click', toggleSidebar);
    
    const chatArea = document.querySelector('.chat-area');
    if (chatArea) {
        chatArea.style.margin = '0';
        chatArea.style.borderRadius = '0';
    }
    
    const chatHistoryEl = document.querySelector('.chat-history');
    if (chatHistoryEl) {
        chatHistoryEl.style.maxHeight = 'calc(100vh - 160px)';
        chatHistoryEl.style.padding = '15px';
    }
    
    const style = document.createElement('style');
    style.textContent = `
        @media (max-width: 768px) {
            .message.user .message-content { max-width: 85% !important; }
            .pro-toolbar { overflow-x: auto; justify-content: flex-start; gap: 8px; padding: 10px; }
            .pro-btn { flex-shrink: 0; }
            .input-area { margin: 10px; padding: 10px; }
            .chat-header { margin: 10px; padding: 12px; }
            #chat-input { font-size: 16px; }
            .hamburger-menu { display: flex; align-items: center; justify-content: center; }
        }
    `;
    document.head.appendChild(style);
}

// ============================================
// BACKEND STATUS
// ============================================
async function checkBackendStatus() {
    const statusTextEl = document.getElementById('status-text');
    const statusDotEl = document.querySelector('.status-dot');
    
    if (!statusTextEl || !statusDotEl) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/status`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            credentials: 'omit'
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.maintenance === true) {
                statusTextEl.textContent = 'Maintenance Mode';
                statusDotEl.style.background = '#f59e0b';
                statusDotEl.style.boxShadow = '0 0 15px #f59e0b';
            } else {
                statusTextEl.textContent = 'Connected';
                statusDotEl.style.background = '#10b981';
                statusDotEl.style.boxShadow = '0 0 15px #10b981';
            }
            statusDotEl.classList.remove('offline');
        } else {
            statusTextEl.textContent = 'Maintenance in Progress';
            statusDotEl.style.background = '#f59e0b';
            statusDotEl.classList.remove('offline');
        }
    } catch (error) {
        statusTextEl.textContent = 'Offline';
        statusDotEl.style.background = '#ef4444';
        statusDotEl.classList.add('offline');
    }
}

// ============================================
// DEV HUB BUTTON
// ============================================
function setupDevHubButton() {
    if (devHubBtn) {
        devHubBtn.addEventListener('click', () => {
            window.open('/ai/devhub/', '_blank');
        });
    }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================
function escapeHtml(s) {
    if (!s) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function openModal(modal) {
    if (modal) modal.classList.add('active');
}

function closeModal(modal) {
    if (modal) modal.classList.remove('active');
}

function showNotification(message, type = 'info', duration = 3000) {
    if (!notificationToast) return;
    notificationToast.textContent = message;
    notificationToast.className = 'notification-toast show';
    if (type === 'success') notificationToast.classList.add('success');
    if (type === 'error') notificationToast.classList.add('error');
    if (type === 'warning') notificationToast.style.borderColor = '#f59e0b';
    setTimeout(() => notificationToast.classList.remove('show'), duration);
}

function emergencyReset() {
    isThinking = false;
    if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.classList.remove('loading');
    }
    if (typingIndicator) typingIndicator.style.display = 'none';
    if (chatInput) chatInput.disabled = false;
    if (chatInput) chatInput.focus();
    if (inputSearchIndicator) inputSearchIndicator.style.display = 'none';
    showNotification('⚠️ Emergency reset activated', 'warning', 3000);
}

function setupModals() {
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay.active').forEach(modal => {
                closeModal(modal);
            });
        }
    });
}

// ============================================
// PWA INSTALL PROMPT
// ============================================
function setupPWAInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        pwaDeferredPrompt = e;
        const installPromptDiv = document.getElementById('install-prompt');
        if (installPromptDiv && !localStorage.getItem('installDismissed')) {
            installPromptDiv.style.display = 'flex';
        }
    });
    
    const installBtn = document.getElementById('install-btn');
    const closeInstallBtn = document.getElementById('close-install');
    
    if (installBtn) {
        installBtn.addEventListener('click', async () => {
            if (pwaDeferredPrompt) {
                pwaDeferredPrompt.prompt();
                const { outcome } = await pwaDeferredPrompt.userChoice;
                console.log(`User response: ${outcome}`);
                pwaDeferredPrompt = null;
                const installPromptDiv = document.getElementById('install-prompt');
                if (installPromptDiv) installPromptDiv.style.display = 'none';
                if (outcome === 'accepted') {
                    showNotification('✅ Wizard.AI added to your home screen!', 'success');
                }
            }
        });
    }
    
    if (closeInstallBtn) {
        closeInstallBtn.addEventListener('click', () => {
            const installPromptDiv = document.getElementById('install-prompt');
            if (installPromptDiv) installPromptDiv.style.display = 'none';
            localStorage.setItem('installDismissed', 'true');
            setTimeout(() => {
                localStorage.removeItem('installDismissed');
            }, 86400000);
        });
    }
}

// ============================================
// DROPDOWN SETUP
// ============================================
function setupDropdown() {
    if (!dropdownContent) return;
    dropdownContent.innerHTML = '';
    Object.keys(modeData).forEach(mode => {
        dropdownContent.appendChild(createDropdownItem(mode, modeData[mode].emoji, false));
    });
    updateCustomPersonalitiesDropdown();
    if (dropdownBtn) {
        dropdownBtn.addEventListener('click', e => {
            e.stopPropagation();
            dropdown.classList.toggle('open');
        });
    }
    document.addEventListener('click', e => {
        if (!dropdown.contains(e.target)) dropdown.classList.remove('open');
    });
}

function createDropdownItem(mode, emoji, isCustom = false) {
    const item = document.createElement('div');
    item.className = `dropdown-item ${mode === currentMode ? 'selected' : ''} ${isCustom ? 'custom' : ''}`;
    item.setAttribute('data-mode', mode);
    item.innerHTML = `<span style="font-size: 18px;">${emoji}</span><span>${mode}</span>`;
    item.addEventListener('mouseenter', e => showTooltip(mode, e));
    item.addEventListener('mouseleave', hideTooltip);
    item.addEventListener('click', () => selectMode(mode));
    return item;
}

function selectMode(mode) {
    currentMode = mode;
    updateModeDisplay();
    if (dropdown) dropdown.classList.remove('open');
    hideTooltip();
    if (chats[activeChatId]) chats[activeChatId].mode = mode;
    saveChats();
    showNotification(`Switched to ${mode} mode`, 'info');
}

function updateModeDisplay() {
    const mode = modeData[currentMode] || customPersonalities.find(p => p.name === currentMode) || { emoji: '🎩', name: currentMode };
    if (selectedDisplay) selectedDisplay.innerHTML = `${mode.emoji || '🤖'} ${currentMode}`;
    document.querySelectorAll('.dropdown-item').forEach(el => {
        el.classList.toggle('selected', el.dataset.mode === currentMode);
    });
}

// ============================================
// TOOLTIP SYSTEM
// ============================================
let tooltipEl = null;

function createTooltip() {
    if (tooltipEl) return;
    tooltipEl = document.createElement('div');
    tooltipEl.style.cssText = `position:fixed; display:none; z-index:10000; background:linear-gradient(135deg,#1a1035,#0d0a1f); border:2px solid #8b5cf6; border-radius:12px; padding:12px 16px; max-width:280px; box-shadow:0 0 30px rgba(139,92,246,0.5); backdrop-filter:blur(10px); color:white; font-size:13px; pointer-events:none; border-left:4px solid #8b5cf6;`;
    document.body.appendChild(tooltipEl);
}

function showTooltip(modeKey, event) {
    if (!tooltipEl) createTooltip();
    const mode = modeData[modeKey] || customPersonalities.find(p => p.name === modeKey);
    if (!mode) return;
    tooltipEl.innerHTML = `<div style="display:flex; gap:12px;"><div style="font-size:32px;">${mode.emoji || '🤖'}</div><div><div style="font-weight:bold; color:${mode.color || '#8b5cf6'}; font-size:15px;">${mode.name || modeKey}</div><div style="color:#e0e7ff; font-size:12px; margin-top:4px;">${mode.desc || (mode.system_prompt ? mode.system_prompt.substring(0,100)+'...' : 'Custom personality')}</div><div style="color:#9ca3af; font-size:11px; margin-top:8px;">🧠 ${mode.model || 'Custom'}</div></div></div>`;
    const rect = event.target.getBoundingClientRect();
    tooltipEl.style.display = 'block';
    tooltipEl.style.left = `${rect.right + 15}px`;
    tooltipEl.style.top = `${rect.top}px`;
    const tooltipRect = tooltipEl.getBoundingClientRect();
    if (tooltipRect.right > window.innerWidth) tooltipEl.style.left = `${rect.left - tooltipRect.width - 15}px`;
}

function hideTooltip() {
    if (tooltipEl) tooltipEl.style.display = 'none';
}

// ============================================
// CUSTOM PERSONALITIES
// ============================================
function loadCustomPersonalities() {
    const saved = localStorage.getItem('wizard_custom_personalities');
    if (saved) {
        try {
            customPersonalities = JSON.parse(saved);
            updateCustomPersonalitiesDropdown();
        } catch (e) {}
    }
}

function saveCustomPersonalitiesToStorage() {
    localStorage.setItem('wizard_custom_personalities', JSON.stringify(customPersonalities));
}

function updateCustomPersonalitiesDropdown() {
    if (!dropdownContent) return;
    document.querySelectorAll('.dropdown-item.custom, .dropdown-separator').forEach(el => el.remove());
    if (customPersonalities.length > 0) {
        const sep = document.createElement('div');
        sep.className = 'dropdown-separator';
        sep.style.cssText = 'padding:8px 15px; color:#9ca3af; font-size:11px; text-transform:uppercase; letter-spacing:1px; border-top:1px solid rgba(139,92,246,0.3); border-bottom:1px solid rgba(139,92,246,0.3); background:rgba(0,0,0,0.2);';
        sep.textContent = '✨ CUSTOM PERSONALITIES';
        dropdownContent.appendChild(sep);
        customPersonalities.forEach(p => {
            dropdownContent.appendChild(createDropdownItem(p.name, p.emoji || '🤖', true));
        });
    }
}

function toggleCreatorPanel() {
    if (!creatorPanel) return;
    creatorPanel.style.display = creatorPanel.style.display === 'none' ? 'block' : 'none';
    if (toggleCreatorBtn) {
        const span = toggleCreatorBtn.querySelector('.btn-icon');
        if (span) span.textContent = creatorPanel.style.display === 'block' ? '➖' : '➕';
    }
}

function closeCreatorPanel() {
    if (!creatorPanel) return;
    creatorPanel.style.display = 'none';
    if (toggleCreatorBtn) {
        const span = toggleCreatorBtn.querySelector('.btn-icon');
        if (span) span.textContent = '➕';
    }
    clearCreatorForm();
}

function clearCreatorForm() {
    if (customName) customName.value = '';
    if (customEmoji) customEmoji.value = '';
    if (customPrompt) customPrompt.value = '';
    if (customGreeting) customGreeting.value = '';
    if (customPublic) customPublic.checked = true;
}

async function saveCustomPersonality() {
    if (!currentUser) {
        showNotification('Please login to create personalities', 'error');
        return;
    }
    const name = customName.value.trim();
    const emoji = customEmoji.value.trim() || '🤖';
    const prompt = customPrompt.value.trim();
    const greeting = customGreeting.value.trim() || `Hello! I'm ${name}.`;
    const isPublic = customPublic.checked;
    if (!name || !prompt) {
        showNotification('Name and prompt are required', 'error');
        return;
    }
    try {
        const response = await fetch(`${API_BASE_URL}/api/personalities`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ name, emoji, prompt, greeting, is_public: isPublic })
        });
        if (response.ok) {
            const personality = await response.json();
            customPersonalities.push({
                name: personality.name,
                emoji: personality.emoji,
                system_prompt: personality.system_prompt,
                greeting: personality.greeting,
                id: personality.id
            });
            saveCustomPersonalitiesToStorage();
            updateCustomPersonalitiesDropdown();
            showNotification('Personality created!', 'success');
            closeCreatorPanel();
        } else {
            const error = await response.json();
            showNotification(error.error || 'Failed to create personality', 'error');
        }
    } catch (error) {
        showNotification('Error creating personality', 'error');
    }
}

// ============================================
// VOICE RECOGNITION
// ============================================
function initVoiceRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        if (voiceBtn) voiceBtn.style.display = 'none';
        return;
    }
    voiceRecognition = new SpeechRecognition();
    voiceRecognition.continuous = false;
    voiceRecognition.interimResults = false;
    voiceRecognition.lang = 'en-US';
    voiceRecognition.onstart = () => {
        isVoiceListening = true;
        if (voiceBtn) voiceBtn.classList.add('listening');
        showNotification('🎤 Listening...', 'info');
    };
    voiceRecognition.onend = () => {
        isVoiceListening = false;
        if (voiceBtn) voiceBtn.classList.remove('listening');
    };
    voiceRecognition.onresult = e => {
        const transcript = e.results[0][0].transcript;
        if (chatInput) chatInput.value = transcript;
        showNotification(`🎤 "${transcript}"`, 'success');
        setTimeout(() => sendMessage(), 500);
    };
    voiceRecognition.onerror = e => {
        isVoiceListening = false;
        if (voiceBtn) voiceBtn.classList.remove('listening');
        showNotification(`Voice error: ${e.error}`, 'error');
    };
}

function toggleVoiceInput() {
    if (!voiceRecognition) {
        initVoiceRecognition();
        if (!voiceRecognition) return;
    }
    if (isVoiceListening) voiceRecognition.stop();
    else voiceRecognition.start();
}

// ============================================
// TURBO & SEARCH MODES
// ============================================
function toggleTurboMode() {
    turboMode = !turboMode;
    if (turboBtn) turboBtn.classList.toggle('active', turboMode);
    if (turboStatus) turboStatus.textContent = turboMode ? 'ON' : 'OFF';
    showNotification(`Turbo mode ${turboMode ? 'activated' : 'deactivated'}`, 'info');
}

function toggleSearchMode() {
    searchMode = !searchMode;
    if (searchBtn) {
        searchBtn.classList.toggle('active', searchMode);
        const btnText = searchBtn.querySelector('.btn-text');
        if (btnText) {
            btnText.textContent = searchMode ? 'Search ON' : 'Search';
        }
    }
    showNotification(`Web search ${searchMode ? 'enabled' : 'disabled'}`, 'info');
}

function shouldAutoSearch(text) {
    const triggers = [
        'latest', 'news', 'current', 'today', 'now', 
        '2024', '2025', '2026', 'recent', 'update', 
        'weather', 'stock', 'price', 'score', 'results', 
        'who is', 'what is', 'tell me about', 'find', 'search',
        'ww3', 'war', 'conflict', 'election', 'president',
        'breaking', 'live', 'trending', 'forecast', 'prediction'
    ];
    const lowerText = text.toLowerCase();
    return triggers.some(t => lowerText.includes(t));
}

// ============================================
// API KEYS MANAGEMENT
// ============================================
async function loadUserApiKeys() {
    const apiKeysList = document.getElementById('api-keys-list');
    if (!apiKeysList) return;
    
    if (!currentUser) {
        apiKeysList.innerHTML = '<div class="no-keys-message">🔐 Login to view your API keys</div>';
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/keys`, {
            credentials: 'include'
        });
        
        if (response.ok) {
            const keys = await response.json();
            
            if (!keys || keys.length === 0) {
                apiKeysList.innerHTML = '<div class="no-keys-message">✨ No API keys yet. Visit the <a href="/devhub/">Developer Hub</a> to create one!</div>';
            } else {
                let html = '';
                keys.forEach(key => {
                    const maskedKey = key.key.substring(0, 15) + '...' + key.key.substring(key.key.length - 8);
                    html += `
                        <div class="api-key-item">
                            <div class="api-key-name">${escapeHtml(key.name)}</div>
                            <div class="api-key-value">${maskedKey}</div>
                            <div class="api-key-stats">
                                📊 ${key.requests || 0} requests
                                ${key.is_active ? '✅ Active' : '❌ Revoked'}
                            </div>
                        </div>
                    `;
                });
                apiKeysList.innerHTML = html;
            }
        } else if (response.status === 401) {
            apiKeysList.innerHTML = '<div class="no-keys-message">🔐 Please login to view your API keys</div>';
        } else {
            apiKeysList.innerHTML = '<div class="no-keys-message">⚠️ Failed to load API keys</div>';
        }
    } catch (error) {
        console.error('Error loading API keys:', error);
        apiKeysList.innerHTML = '<div class="no-keys-message">⚠️ Error loading keys</div>';
    }
}

function setupApiKeysButton() {
    const sidebarKeyBtn = document.getElementById('create-api-key-sidebar');
    
    if (sidebarKeyBtn) {
        sidebarKeyBtn.addEventListener('click', () => {
            if (!currentUser) {
                showNotification('Please login to manage API keys', 'error');
                showAuthModal(true);
                return;
            }
            window.open('/devhub/', '_blank');
        });
    }
}

// ============================================
// CHAT MANAGEMENT
// ============================================

function renderMessageContent(sender, text) {
    if (sender === 'user') {
        return escapeHtml(text);
    } else {
        return renderMarkdown(text);
    }
}

function createMessageElement(sender, text, mode = null, isStreaming = false) {
    const msg = document.createElement('div');
    msg.className = `message ${sender}`;
    if (isStreaming) msg.classList.add('streaming');
    
    const renderedContent = renderMessageContent(sender, text);
    
    if (sender === 'user') {
        msg.innerHTML = `
            <div class="message-content">
                <div class="message-text">${renderedContent}</div>
                <div class="message-time">${new Date().toLocaleTimeString()}</div>
            </div>
        `;
    } else {
        msg.innerHTML = `
            <div class="message-content">
                <div class="message-text">${renderedContent}</div>
                <div class="message-time">${new Date().toLocaleTimeString()}</div>
            </div>
        `;
    }
    return msg;
}

function addMessage(sender, text, mode = null) {
    if (!chatHistory) return;
    const msgElement = createMessageElement(sender, text, mode);
    chatHistory.appendChild(msgElement);
    messages.push({
        sender: sender,
        text: text,
        mode: mode,
        timestamp: new Date().toISOString()
    });
    if (chats[activeChatId]) {
        chats[activeChatId].messages = [...messages];
        saveChats();
    }
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

function renderMessages() {
    if (!chatHistory) return;
    chatHistory.innerHTML = '';
    if (messages && messages.length > 0) {
        messages.forEach(msg => {
            const msgElement = createMessageElement(msg.sender, msg.text, msg.mode);
            chatHistory.appendChild(msgElement);
        });
    }
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

async function sendMessage() {
    if (isThinking) return;
    const text = chatInput.value.trim();
    if (!text) return;
    
    addMessage('user', text);
    chatInput.value = '';
    
    isThinking = true;
    sendBtn.disabled = true;
    sendBtn.classList.add('loading');
    if (typingIndicator) typingIndicator.style.display = 'flex';
    
    const shouldSearch = searchMode || shouldAutoSearch(text);
    
    if (shouldSearch && inputSearchIndicator) {
        inputSearchIndicator.style.display = 'inline';
        inputSearchIndicator.title = 'Web search will be performed for this query';
    } else if (inputSearchIndicator) {
        inputSearchIndicator.style.display = 'none';
    }
    
    // Add thinking message
    const thinkingMsg = addThinkingMessage();
    let thinkingText = '🧠 Analyzing request...';
    
    const streamingMsgId = 'streaming-' + Date.now();
    const msgDiv = document.createElement('div');
    msgDiv.id = streamingMsgId;
    msgDiv.className = 'message assistant streaming';
    msgDiv.innerHTML = `
        <div class="message-content">
            <div class="message-text" id="streaming-text-${streamingMsgId}"></div>
            <div class="message-time">${new Date().toLocaleTimeString()}</div>
        </div>
    `;
    chatHistory.appendChild(msgDiv);
    
    const respSpan = document.getElementById(`streaming-text-${streamingMsgId}`);
    let fullResponse = '';
    let hasContent = false;
    let thinkingStep = 0;
    const thinkingSteps = [
        '🧠 Analyzing request...',
        '🤔 Processing your query...',
        '📊 Finding relevant information...',
        '✨ Generating response...'
    ];
    
    // Update thinking periodically
    const thinkingInterval = setInterval(() => {
        if (isThinking) {
            thinkingStep = (thinkingStep + 1) % thinkingSteps.length;
            updateThinkingMessage(thinkingMsg.id, thinkingSteps[thinkingStep]);
        }
    }, 2000);
    
    try {
        const start = Date.now();
        
        const response = await fetch(`${API_BASE_URL}/api/compound/stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                message: text,
                mode: currentMode,
                search: shouldSearch,
                chat_id: activeChatId
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let done = false;
        
        while (!done) {
            const { done: readerDone, value } = await reader.read();
            done = readerDone;
            
            if (value) {
                buffer += decoder.decode(value, { stream: true });
                
                const lines = buffer.split('\n\n');
                buffer = lines.pop() || '';
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') continue;
                        
                        try {
                            const parsed = JSON.parse(data);
                            
                            // Handle tool calls (thinking process)
                            if (parsed.tool_calls) {
                                const toolNames = parsed.tool_calls.map(t => t.tool_name || t.name).join(', ');
                                updateThinkingMessage(thinkingMsg.id, `🔧 Using tools: ${toolNames}`);
                            }
                            
                            // Handle image generation
                            if (parsed.image) {
                                addImageMessage(parsed.image, parsed.prompt || 'Generated image', parsed.source || 'AI');
                                hasContent = true;
                                continue;
                            }
                            
                            // Handle text tokens
                            if (parsed.token) {
                                fullResponse += parsed.token;
                                hasContent = true;
                                if (respSpan) {
                                    respSpan.innerHTML = renderMarkdown(fullResponse);
                                }
                                chatHistory.scrollTop = chatHistory.scrollHeight;
                            } else if (parsed.done || parsed.type === 'complete') {
                                if (parsed.content) {
                                    fullResponse = parsed.content;
                                    hasContent = true;
                                    if (respSpan) {
                                        respSpan.innerHTML = renderMarkdown(fullResponse);
                                    }
                                }
                                done = true;
                            } else if (parsed.error) {
                                fullResponse = '❌ Error: ' + parsed.error;
                                hasContent = true;
                                if (respSpan) {
                                    respSpan.innerHTML = renderMarkdown(fullResponse);
                                }
                                showNotification('Error: ' + parsed.error, 'error');
                                done = true;
                            }
                        } catch (e) {
                            console.warn('Failed to parse SSE data:', data, e);
                        }
                    }
                }
            }
        }
        
        // Remove thinking message when done
        clearInterval(thinkingInterval);
        removeThinkingMessage(thinkingMsg.id);
        
        // If we got no content, show a fallback message
        if (!hasContent || !fullResponse || fullResponse.trim() === '') {
            fullResponse = "I received your message but I'm having trouble generating a response. Please try again.";
            if (respSpan) {
                respSpan.innerHTML = renderMarkdown(fullResponse);
            }
            showNotification('Empty response received. Please try again.', 'warning');
        }
        
        const elapsed = (Date.now() - start) / 1000;
        msgDiv.classList.remove('streaming');
        
        // Save to messages array
        messages.push({
            sender: 'assistant',
            text: fullResponse,
            mode: currentMode,
            timestamp: new Date().toISOString()
        });
        
        if (chats[activeChatId]) {
            chats[activeChatId].messages = [...messages];
            saveChats();
        }
        
        trackMessage(elapsed);
        if (shouldSearch) {
            trackSearch();
        }
        
    } catch (error) {
        console.error('Stream error:', error);
        clearInterval(thinkingInterval);
        removeThinkingMessage(thinkingMsg.id);
        
        const errorMsg = error.message || 'Error getting response. Please try again.';
        if (respSpan) {
            respSpan.innerHTML = renderMarkdown('❌ ' + errorMsg);
        }
        msgDiv.classList.remove('streaming');
        showNotification(errorMsg, 'error');
        
        messages.push({
            sender: 'assistant',
            text: 'Error: ' + errorMsg,
            mode: currentMode,
            timestamp: new Date().toISOString()
        });
        if (chats[activeChatId]) {
            chats[activeChatId].messages = [...messages];
            saveChats();
        }
    } finally {
        isThinking = false;
        sendBtn.disabled = false;
        sendBtn.classList.remove('loading');
        if (typingIndicator) typingIndicator.style.display = 'none';
        if (inputSearchIndicator) {
            inputSearchIndicator.style.display = 'none';
        }
    }
}

function loadChats() {
    const saved = localStorage.getItem('wizard_chats');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            chats = data.chats || {};
            chatIds = data.chatIds || ['default'];
            activeChatId = data.activeChatId || 'default';
            if (chats[activeChatId]) {
                messages = chats[activeChatId].messages || [];
            } else {
                messages = [];
            }
            if (!chats['default']) {
                chats['default'] = {
                    chat_id: 'default',
                    name: 'Main Chat',
                    emoji: '🧙',
                    mode: 'JARVIS',
                    messages: []
                };
            }
            renderChatsList();
            renderMessages();
        } catch (e) {
            console.error('Error loading chats:', e);
            createDefaultChat();
        }
    } else {
        createDefaultChat();
    }
}

function createDefaultChat() {
    chats = {
        'default': {
            chat_id: 'default',
            name: 'Main Chat',
            emoji: '🧙',
            mode: 'JARVIS',
            messages: []
        }
    };
    chatIds = ['default'];
    activeChatId = 'default';
    messages = [];
    renderChatsList();
    renderMessages();
}

function renderChatsList() {
    if (!chatsList) return;
    let html = '';
    chatIds.forEach(id => {
        const chat = chats[id];
        if (!chat) return;
        html += `<div class="chat-item ${id === activeChatId ? 'active' : ''}" data-chat-id="${id}">
            <span class="chat-emoji">${chat.emoji}</span>
            <span class="chat-name">${escapeHtml(chat.name)}</span>
            <div class="chat-item-actions">
                <button class="rename-chat-item" data-chat-id="${id}" title="Rename">✏️</button>
                ${id !== 'default' ? `<button class="delete-chat-item" data-chat-id="${id}" title="Delete">🗑️</button>` : ''}
            </div>
        </div>`;
    });
    chatsList.innerHTML = html;
    
    document.querySelectorAll('.chat-item').forEach(el => {
        el.addEventListener('click', e => {
            if (!e.target.closest('button')) switchChat(el.dataset.chatId);
        });
    });
    document.querySelectorAll('.rename-chat-item').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            openRenameModal(btn.dataset.chatId);
        });
    });
    document.querySelectorAll('.delete-chat-item').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            deleteChat(btn.dataset.chatId);
        });
    });
}

function switchChat(id) {
    if (chats[activeChatId]) {
        chats[activeChatId].messages = [...messages];
    }
    activeChatId = id;
    if (chats[id]) {
        messages = chats[id].messages ? [...chats[id].messages] : [];
        currentMode = chats[id].mode || 'JARVIS';
        updateModeDisplay();
    } else {
        messages = [];
        currentMode = 'JARVIS';
    }
    renderMessages();
    renderChatsList();
    if (currentChatName) currentChatName.textContent = chats[id]?.name || 'Chat';
    if (currentChatEmoji) currentChatEmoji.textContent = chats[id]?.emoji || '💬';
    saveChats();
}

function createNewChat() {
    const id = 'chat_' + Date.now();
    const name = `Chat ${chatIds.length + 1}`;
    const emojis = ['💬', '🤖', '🌟', '⭐', '✨', '🎯', '🎲'];
    const emoji = emojis[Math.floor(Math.random() * emojis.length)];
    chats[id] = {
        chat_id: id,
        name: name,
        emoji: emoji,
        mode: 'JARVIS',
        messages: []
    };
    chatIds.push(id);
    saveChats();
    renderChatsList();
    switchChat(id);
}

function deleteChat(id) {
    if (id === 'default') {
        showNotification('Cannot delete default chat', 'error');
        return;
    }
    if (!confirm('Delete this chat?')) return;
    delete chats[id];
    chatIds = chatIds.filter(i => i !== id);
    if (activeChatId === id) {
        switchChat('default');
    }
    saveChats();
    renderChatsList();
    showNotification('Chat deleted', 'success');
}

function openRenameModal(id) {
    chatToRename = id;
    renameInput.value = chats[id]?.name || '';
    openModal(renameModal);
}

function saveRename() {
    const newName = renameInput.value.trim();
    if (newName && chatToRename && chats[chatToRename]) {
        chats[chatToRename].name = newName;
        saveChats();
        renderChatsList();
        if (chatToRename === activeChatId && currentChatName) {
            currentChatName.textContent = newName;
        }
        showNotification('Chat renamed', 'success');
    }
    closeModal(renameModal);
}

function resetCurrentChat() {
    if (confirm('Clear all messages in this chat?')) {
        messages = [];
        if (chats[activeChatId]) {
            chats[activeChatId].messages = [];
        }
        renderMessages();
        saveChats();
        showNotification('Chat cleared', 'success');
    }
}

function saveChats() {
    localStorage.setItem('wizard_chats', JSON.stringify({
        chats,
        chatIds,
        activeChatId,
        messages
    }));
    if (currentUser) {
        fetch(`${API_BASE_URL}/api/save-chats`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                chats: Object.values(chats),
                chat_order: chatIds
            })
        }).catch(e => console.warn('Failed to save chats to server:', e));
    }
}

// ============================================
// STATS FUNCTIONS
// ============================================
function trackMessage(rt) {
    userStats.messages++;
    userStats.todayMessages++;
    if (rt) {
        userStats.responseTimes.push(rt);
        if (userStats.responseTimes.length > 100) userStats.responseTimes.shift();
    }
    updateStatsDisplay();
    saveStatsToStorage();
}

function trackFile() {
    userStats.files++;
    updateStatsDisplay();
    saveStatsToStorage();
}

function trackImage() {
    userStats.images++;
    updateStatsDisplay();
    saveStatsToStorage();
}

function trackSearch() {
    userStats.searches++;
    updateStatsDisplay();
    saveStatsToStorage();
}

function trackCode() {
    userStats.codeExecutions++;
    updateStatsDisplay();
    saveStatsToStorage();
}

function updateStatsDisplay() {
    if (statMessages) statMessages.textContent = userStats.messages;
    if (statFiles) statFiles.textContent = userStats.files;
    if (statImages) statImages.textContent = userStats.images;
    if (statSearches) statSearches.textContent = userStats.searches;
    const avg = userStats.responseTimes.length ? (userStats.responseTimes.reduce((a,b)=>a+b,0)/userStats.responseTimes.length).toFixed(1) : '0.4';
    if (statResponse) statResponse.textContent = avg + 's';
    if (quickToday) quickToday.textContent = userStats.todayMessages + ' msgs';
    if (quickTotal) quickTotal.textContent = userStats.messages + ' msgs';
}

async function loadStats() {
    if (currentUser) {
        try {
            const response = await fetch(`${API_BASE_URL}/api/stats`, { credentials: 'include' });
            if (response.ok) {
                const data = await response.json();
                userStats.messages = data.messages || 0;
                userStats.files = data.files || 0;
                userStats.memories = data.memories || 0;
                userStats.images = data.images || 0;
                userStats.searches = data.searches || 0;
                userStats.codeExecutions = data.code || 0;
                if (statsCreated) statsCreated.textContent = data.account_created || '-';
                if (statsLast) statsLast.textContent = data.last_login || '-';
                if (statsTotalMsgs) statsTotalMsgs.textContent = data.messages || 0;
                if (statsTotalChats) statsTotalChats.textContent = data.chats || 0;
                if (statsFilesDetailed) statsFilesDetailed.textContent = data.files || 0;
                if (statsImagesDetailed) statsImagesDetailed.textContent = data.images || 0;
                if (statsCodeDetailed) statsCodeDetailed.textContent = data.code || 0;
                if (statsSearchesDetailed) statsSearchesDetailed.textContent = data.searches || 0;
                if (statsMemories) statsMemories.textContent = data.memories || 0;
                if (statsDocs) statsDocs.textContent = data.documents || 0;
                if (statsAvgResponse) statsAvgResponse.textContent = (data.avg_response_time || 0.4) + 's';
                if (statsFastest) statsFastest.textContent = (data.fastest_response || 0.2) + 's';
                if (statsApiKeysDetailed) statsApiKeysDetailed.textContent = data.api_keys || 0;
                if (statsProfileCompleteness) statsProfileCompleteness.textContent = (userProfile?.profile_completeness || 0) + '%';
                
                if (userProfile) {
                    const skills = Array.isArray(userProfile.skills) ? userProfile.skills : [];
                    const interests = Array.isArray(userProfile.interests) ? userProfile.interests : [];
                    const goals = Array.isArray(userProfile.goals) ? userProfile.goals : [];
                    if (statsSkillsCount) statsSkillsCount.textContent = skills.length;
                    if (statsInterestsCount) statsInterestsCount.textContent = interests.length;
                    if (statsGoalsCount) statsGoalsCount.textContent = goals.length;
                }
            }
        } catch (error) {
            loadStatsFromStorage();
        }
    } else {
        loadStatsFromStorage();
    }
    updateStatsDisplay();
}

function loadStatsFromStorage() {
    const saved = localStorage.getItem('wizard_stats');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            userStats = { ...userStats, ...data };
        } catch (e) {}
    }
}

function saveStatsToStorage() {
    if (!currentUser) {
        localStorage.setItem('wizard_stats', JSON.stringify({
            messages: userStats.messages,
            files: userStats.files,
            memories: userStats.memories,
            images: userStats.images,
            searches: userStats.searches,
            codeExecutions: userStats.codeExecutions
        }));
    }
}

// ============================================
// AUTHENTICATION FUNCTIONS
// ============================================
async function checkAuth() {
    try {
        const url = `${API_BASE_URL}/api/check-auth?_=${Date.now()}`;
        const response = await fetch(url, { 
            credentials: 'include',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            currentUser = data.user;
            updateUIForAuth();
            if (data.memories) userStats.memories = data.memories.length;
            loadUserPersonalitiesFromServer();
            localStorage.setItem('auth_time', Date.now().toString());
            
            detectAndSaveTimezone();
            await loadProfile();
        } else {
            updateUIForAuth();
            const authTime = localStorage.getItem('auth_time');
            if (authTime && (Date.now() - parseInt(authTime)) > 3600000) {
                showNotification('Session expired. Please log in again.', 'warning');
                showAuthModal(true);
            }
        }
    } catch (error) {
        console.error('Auth check error:', error);
        updateUIForAuth();
    }
}

async function loadUserPersonalitiesFromServer() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/personalities/mine`, { credentials: 'include' });
        if (response.ok) {
            const personalities = await response.json();
            customPersonalities = personalities.map(p => ({
                name: p.name,
                emoji: p.emoji,
                system_prompt: p.system_prompt,
                greeting: p.greeting,
                id: p.id,
                likes: p.likes,
                uses: p.uses
            }));
            saveCustomPersonalitiesToStorage();
            updateCustomPersonalitiesDropdown();
        }
    } catch (error) {}
}

function updateUIForAuth() {
    if (currentUser && userInfo && authButtons) {
        userInfo.style.display = 'flex';
        authButtons.style.display = 'none';
        userEmail.textContent = currentUser.email;
        userName.textContent = `${currentUser.first_name || ''} ${currentUser.last_name || ''}`.trim() || 'User';
        userAvatar.textContent = currentUser.first_name?.[0] || '👤';
    } else if (userInfo && authButtons) {
        userInfo.style.display = 'none';
        authButtons.style.display = 'flex';
    }
}

function showAuthModal(login = true) {
    isLoginMode = login;
    authModalTitle.textContent = login ? 'Login to Wizard.AI' : 'Create Account';
    authSubmit.textContent = login ? 'Login' : 'Sign Up';
    authSwitchText.textContent = login ? "Don't have an account?" : "Already have an account?";
    authSwitchBtn.textContent = login ? 'Sign Up' : 'Login';
    firstNameGroup.style.display = login ? 'none' : 'block';
    lastNameGroup.style.display = login ? 'none' : 'block';
    confirmPasswordGroup.style.display = login ? 'none' : 'block';
    verificationGroup.style.display = 'none';
    authEmail.value = '';
    authPassword.value = '';
    authConfirm.value = '';
    firstNameInput.value = '';
    lastNameInput.value = '';
    authError.textContent = '';
    openModal(authModal);
}

function toggleAuthMode() {
    showAuthModal(!isLoginMode);
}

async function handleAuthSubmit() {
    if (isLoginMode) {
        await handleLogin();
    } else if (verificationGroup.style.display === 'block') {
        await handleVerify();
    } else {
        await handleSignup();
    }
}

async function handleLogin() {
    const email = authEmail.value.trim();
    const password = authPassword.value.trim();
    if (!email || !password) {
        authError.textContent = 'Email and password required';
        return;
    }
    try {
        const response = await fetch(`${API_BASE_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ email, password })
        });
        
        if (response.ok) {
            const data = await response.json();
            currentUser = data.user;
            localStorage.setItem('auth_time', Date.now().toString());
            
            if (data.chats) {
                chats = {};
                data.chats.forEach(c => chats[c.chat_id] = c);
                chatIds = data.chat_order || ['default'];
                activeChatId = chatIds[0];
                messages = chats[activeChatId]?.messages || [];
            }
            if (data.memories) userStats.memories = data.memories.length;
            updateUIForAuth();
            renderChatsList();
            renderMessages();
            updateStatsDisplay();
            loadUserPersonalitiesFromServer();
            await loadUserApiKeys();
            closeModal(authModal);
            
            detectAndSaveTimezone();
            await loadProfile();
            
            showNotification(`Welcome back, ${currentUser.first_name || ''}!`, 'success');
        } else {
            const error = await response.json();
            authError.textContent = error.error || 'Login failed';
        }
    } catch (error) {
        authError.textContent = 'Connection error';
    }
}

async function handleSignup() {
    const firstName = firstNameInput.value.trim();
    const lastName = lastNameInput.value.trim();
    const email = authEmail.value.trim();
    const password = authPassword.value.trim();
    const confirm = authConfirm.value.trim();
    if (!firstName || !lastName || !email || !password || !confirm) {
        authError.textContent = 'All fields required';
        return;
    }
    if (password !== confirm) {
        authError.textContent = 'Passwords do not match';
        return;
    }
    try {
        const response = await fetch(`${API_BASE_URL}/api/register/init`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ firstName, lastName, email, password })
        });
        if (response.ok) {
            const data = await response.json();
            signupEmail = email;
            if (data.pending_id) {
                localStorage.setItem('wizard_pending_id', data.pending_id);
                console.log('✅ Stored pending_id in localStorage:', data.pending_id);
            }
            firstNameGroup.style.display = 'none';
            lastNameGroup.style.display = 'none';
            confirmPasswordGroup.style.display = 'none';
            verificationGroup.style.display = 'block';
            authSubmit.textContent = 'Verify Code';
            authModalTitle.textContent = 'Verify Your Email';
            if (authError) {
                if (data.dev_code) {
                    authError.textContent = `🔐 Development code: ${data.dev_code}`;
                    authError.style.color = '#10b981';
                } else {
                    authError.textContent = `📧 Verification code sent to ${email}`;
                    authError.style.color = '#10b981';
                }
            }
            showNotification('📧 Verification code sent!', 'success');
        } else {
            const error = await response.json();
            authError.textContent = error.error || 'Signup failed';
        }
    } catch (error) {
        authError.textContent = 'Connection error';
    }
}

async function handleVerify() {
    const code = verificationInput.value.trim();
    if (!code || code.length !== 6) {
        authError.textContent = 'Enter 6-digit code';
        return;
    }
    const pendingId = localStorage.getItem('wizard_pending_id');
    try {
        const response = await fetch(`${API_BASE_URL}/api/register/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                email: signupEmail,
                code: code,
                pending_id: pendingId
            })
        });
        const data = await response.json();
        if (response.ok) {
            localStorage.removeItem('wizard_pending_id');
            currentUser = data.user;
            if (data.chats) {
                chats = {};
                data.chats.forEach(c => chats[c.chat_id] = c);
                chatIds = data.chat_order || ['default'];
                activeChatId = chatIds[0];
                messages = chats[activeChatId]?.messages || [];
            }
            updateUIForAuth();
            renderChatsList();
            renderMessages();
            closeModal(authModal);
            
            detectAndSaveTimezone();
            await loadProfile();
            
            showNotification('Account verified! Welcome!', 'success');
        } else {
            if (authError) authError.textContent = data.error || 'Verification failed';
        }
    } catch (error) {
        console.error('Verify error:', error);
        if (authError) authError.textContent = 'Connection error';
    }
}

async function resendVerificationCode() {
    const pendingId = localStorage.getItem('wizard_pending_id');
    try {
        const response = await fetch(`${API_BASE_URL}/api/resend-code`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pending_id: pendingId })
        });
        const data = await response.json();
        if (response.ok) {
            if (authError) {
                if (data.dev_code) {
                    authError.textContent = `🔐 New code: ${data.dev_code}`;
                } else {
                    authError.textContent = 'Verification code resent! Check your email.';
                }
                authError.style.color = '#10b981';
            }
            showNotification('📧 Code resent!', 'success');
        } else {
            const error = await response.json();
            if (authError) authError.textContent = error.error || 'Failed to resend code';
        }
    } catch (error) {
        console.error('Resend error:', error);
        if (authError) authError.textContent = 'Connection error';
    }
}

async function handleLogout() {
    try {
        await fetch(`${API_BASE_URL}/api/logout`, { method: 'POST', credentials: 'include' });
    } catch (error) {}
    localStorage.removeItem('wizard_pending_id');
    localStorage.removeItem('auth_time');
    currentUser = null;
    userProfile = null;
    updateUIForAuth();
    loadGuestData();
    showNotification('Logged out', 'success');
}

function loadGuestData() {
    const saved = localStorage.getItem('wizard_guest_data');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            userStats = data.stats || userStats;
            updateStatsDisplay();
        } catch (e) {}
    }
}

function startSessionCheck() {
    if (sessionCheckInterval) clearInterval(sessionCheckInterval);
    sessionCheckInterval = setInterval(async () => {
        if (currentUser) {
            try {
                const response = await fetch(`${API_BASE_URL}/api/check-auth`, { credentials: 'include' });
                if (response.status === 401) {
                    currentUser = null;
                    userProfile = null;
                    updateUIForAuth();
                    showNotification('Your session has expired. Please log in again.', 'warning');
                    setTimeout(() => showAuthModal(true), 1000);
                }
            } catch (error) {}
        }
    }, 300000);
}

function stopSessionCheck() {
    if (sessionCheckInterval) {
        clearInterval(sessionCheckInterval);
        sessionCheckInterval = null;
    }
}

// ============================================
// PUBLIC PERSONALITIES
// ============================================
async function loadPublicPersonalities() {
    if (!personalitiesList) return;
    try {
        const response = await fetch(`${API_BASE_URL}/api/personalities`);
        if (response.ok) {
            const data = await response.json();
            publicPersonalities = data;
            if (publicPersonalities.length === 0) {
                personalitiesList.innerHTML = '<div class="empty-state">No public personalities yet</div>';
            } else {
                let html = '';
                publicPersonalities.slice(0, 5).forEach(p => {
                    html += `<div class="personality-item" data-id="${p.id}"><span class="personality-emoji">${p.emoji || '🤖'}</span><span class="personality-name">${p.name}</span><span class="personality-likes">❤️ ${p.likes || 0}</span></div>`;
                });
                personalitiesList.innerHTML = html;
                document.querySelectorAll('.personality-item').forEach(el => {
                    el.addEventListener('click', () => usePersonality(el.dataset.id));
                    el.addEventListener('mouseenter', e => {
                        const p = publicPersonalities.find(p => p.id == el.dataset.id);
                        if (p) showTooltip(p.name, e);
                    });
                    el.addEventListener('mouseleave', hideTooltip);
                });
            }
        }
    } catch (error) {
        personalitiesList.innerHTML = '<div class="error">Failed to load</div>';
    }
}

async function usePersonality(id) {
    const personality = publicPersonalities.find(p => p.id == id);
    if (!personality) return;
    try {
        await fetch(`${API_BASE_URL}/api/personalities/${id}/use`, { method: 'POST', credentials: 'include' });
    } catch (e) {}
    if (!modeData[personality.name]) {
        modeData[personality.name] = {
            emoji: personality.emoji || '🤖',
            name: personality.name,
            desc: personality.system_prompt ? personality.system_prompt.substring(0, 100) + '...' : 'Custom personality',
            model: 'Custom',
            color: '#8b5cf6',
            likes: personality.likes,
            uses: personality.uses
        };
    }
    selectMode(personality.name);
    showNotification(`Switched to ${personality.name}`, 'success');
}

async function openPersonalitiesBrowser() {
    openModal(personalitiesModal);
    await loadPersonalitiesGrid('featured');
}

async function loadPersonalitiesGrid(tab = 'featured') {
    if (!personalitiesGrid) return;
    personalitiesGrid.innerHTML = '<div class="loading">Loading personalities...</div>';
    try {
        let url = `${API_BASE_URL}/api/personalities`;
        if (tab === 'featured') url += '/featured';
        else if (tab === 'popular') url += '/popular';
        else if (tab === 'recent') url += '/recent';
        else if (tab === 'mine' && currentUser) url += '/mine';
        const response = await fetch(url, { credentials: 'include' });
        if (response.ok) {
            const personalities = await response.json();
            renderPersonalitiesGrid(personalities);
        } else {
            personalitiesGrid.innerHTML = '<div class="error">Failed to load</div>';
        }
    } catch (error) {
        personalitiesGrid.innerHTML = '<div class="error">Failed to load</div>';
    }
}

function renderPersonalitiesGrid(personalities) {
    if (!personalitiesGrid) return;
    if (personalities.length === 0) {
        personalitiesGrid.innerHTML = '<div class="empty-state">No personalities found</div>';
        return;
    }
    let html = '';
    personalities.forEach(p => {
        html += `<div class="personality-card" data-id="${p.id}">
            <div class="personality-card-header">
                <span class="personality-card-emoji">${p.emoji || '🤖'}</span>
                <span class="personality-card-name">${p.name}</span>
            </div>
            <div class="personality-card-creator">by ${p.creator || 'Anonymous'}</div>
            <div class="personality-card-stats">
                <span class="personality-card-likes">❤️ ${p.likes || 0}</span>
                <span class="personality-card-uses">🔄 ${p.uses || 0}</span>
            </div>
        </div>`;
    });
    personalitiesGrid.innerHTML = html;
    document.querySelectorAll('.personality-card').forEach(el => {
        el.addEventListener('click', () => usePersonality(el.dataset.id));
        el.addEventListener('mouseenter', e => {
            const p = personalities.find(p => p.id == el.dataset.id);
            if (p) showTooltip(p.name, e);
        });
        el.addEventListener('mouseleave', hideTooltip);
    });
}

function switchPersonalityTab(tab) {
    if (tabBtns.length) tabBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
    loadPersonalitiesGrid(tab);
}

// ============================================
// FILE UPLOAD
// ============================================
async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!currentUser) {
        showNotification('Please login to upload files', 'error');
        return;
    }
    const formData = new FormData();
    formData.append('file', file);
    formData.append('chat_id', activeChatId);
    uploadProgress.style.display = 'block';
    progressBarFill.style.width = '0%';
    progressText.textContent = 'Starting upload...';
    try {
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener('progress', e => {
            if (e.lengthComputable) {
                const pct = (e.loaded / e.total) * 100;
                progressBarFill.style.width = pct + '%';
                progressText.textContent = `Uploading: ${Math.round(pct)}%`;
            }
        });
        const promise = new Promise((resolve, reject) => {
            xhr.onload = () => {
                if (xhr.status === 200) resolve(JSON.parse(xhr.responseText));
                else reject(new Error('Upload failed'));
            };
            xhr.onerror = () => reject(new Error('Upload failed'));
        });
        xhr.open('POST', `${API_BASE_URL}/api/upload`);
        xhr.withCredentials = true;
        xhr.send(formData);
        const data = await promise;
        setTimeout(() => { uploadProgress.style.display = 'none'; }, 1000);
        if (data.success) {
            trackFile();
            if (data.duplicate) {
                showNotification(`File already exists: ${data.filename}`, 'info');
            } else {
                showNotification(`✅ ${file.name} uploaded!`, 'success');
                addMessage('assistant', `📎 File uploaded: ${data.filename}\n${data.preview || ''}`);
            }
        } else {
            showNotification(`❌ Upload failed: ${data.error || 'Unknown error'}`, 'error');
        }
    } catch (error) {
        uploadProgress.style.display = 'none';
        showNotification('❌ Upload failed', 'error');
    }
}

// ============================================
// CODE EXECUTION
// ============================================
async function executeCode() {
    const code = codeInput.value.trim();
    if (!code) return;
    if (!currentUser) {
        showNotification('Please login to execute code', 'error');
        return;
    }
    codeOutput.innerHTML = '<div class="loading">Running code...</div>';
    try {
        const response = await fetch(`${API_BASE_URL}/api/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ code })
        });
        const data = await response.json();
        if (data.error) {
            codeOutput.innerHTML = `<div class="error-output">❌ Error: ${escapeHtml(data.error)}</div>`;
        } else {
            let html = '';
            if (data.stdout) html += `<pre class="stdout">${escapeHtml(data.stdout)}</pre>`;
            if (data.stderr) html += `<pre class="stderr">${escapeHtml(data.stderr)}</pre>`;
            if (!data.stdout && !data.stderr) html = '<div class="no-output">✓ No output (code ran successfully)</div>';
            codeOutput.innerHTML = html;
            trackCode();
        }
    } catch (error) {
        console.error('Code execution error:', error);
        codeOutput.innerHTML = '<div class="error-output">❌ Execution failed: Connection error</div>';
    }
}

// ============================================
// IMAGE GENERATION (Manual Modal)
// ============================================
async function generateImageManual() {
    const prompt = imagePrompt.value.trim();
    if (!prompt) {
        showNotification('Please enter a prompt', 'error');
        return;
    }
    if (!currentUser) {
        showNotification('Please login to generate images', 'error');
        return;
    }
    
    imageResult.innerHTML = '<div class="loading">🎨 Generating image... This may take a moment</div>';
    generateImageBtn.disabled = true;
    generateImageBtn.textContent = 'Generating...';
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/generate-image`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ 
                prompt: prompt, 
                size: imageSize?.value || '512x512' 
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.url) {
            imageResult.innerHTML = `
                <img src="${data.url}" alt="${escapeHtml(prompt)}" style="max-width:100%; border-radius:12px; box-shadow:0 0 30px rgba(139,92,246,0.5);">
                <div class="image-actions">
                    <button onclick="window.open('${data.url}', '_blank')" class="glass-button">🔍 View Full Size</button>
                    <button onclick="downloadImage('${data.url}')" class="glass-button">💾 Download</button>
                </div>
            `;
            trackImage();
            showNotification('✅ Image generated successfully!', 'success');
        } else {
            const errorMsg = data.error || 'Generation failed';
            imageResult.innerHTML = `<div class="error-output">❌ ${escapeHtml(errorMsg)}<br><small>Please try again with a different prompt</small></div>`;
            showNotification(`Image generation failed: ${errorMsg}`, 'error');
        }
    } catch (error) {
        console.error('Image generation error:', error);
        imageResult.innerHTML = '<div class="error-output">❌ Connection error. Please check your internet and try again.</div>';
        showNotification('Failed to generate image: Connection error', 'error');
    } finally {
        generateImageBtn.disabled = false;
        generateImageBtn.textContent = 'Generate';
    }
}

// ============================================
// DETAILED STATS
// ============================================
async function loadDetailedStats() {
    if (!currentUser) {
        showNotification('Login to view detailed stats', 'error');
        return;
    }
    openModal(statsModal);
    await loadStats();
    
    if (userProfile) {
        const skills = Array.isArray(userProfile.skills) ? userProfile.skills : [];
        const interests = Array.isArray(userProfile.interests) ? userProfile.interests : [];
        const goals = Array.isArray(userProfile.goals) ? userProfile.goals : [];
        if (statsSkillsCount) statsSkillsCount.textContent = skills.length;
        if (statsInterestsCount) statsInterestsCount.textContent = interests.length;
        if (statsGoalsCount) statsGoalsCount.textContent = goals.length;
        if (statsProfileCompleteness) statsProfileCompleteness.textContent = (userProfile.profile_completeness || 0) + '%';
    }
}

// ============================================
// UPDATE HISTORY MODAL
// ============================================
function showUpdateHistory() {
    openModal(updateModal);
}

// ============================================
// DESKTOP APP MENU INTEGRATION
// ============================================
const isElectron = navigator.userAgent.includes('Electron');

if (isElectron && window.electronAPI) {
    console.log('🖥️ Desktop app detected - setting up menu handlers');

    function safeClick(elementId) {
        const el = document.getElementById(elementId);
        if (el) {
            el.click();
            return true;
        }
        return false;
    }

    window.electronAPI.onNewChat(() => {
        console.log('📁 Menu: New Chat');
        if (!safeClick('new-chat-btn')) {
            if (typeof createNewChat === 'function') createNewChat();
        }
    });

    window.electronAPI.onClearChat(() => {
        console.log('🗑️ Menu: Clear Chat');
        if (!safeClick('reset-current-btn')) {
            if (typeof resetCurrentChat === 'function') resetCurrentChat();
        }
    });

    window.electronAPI.onOpenImageGen(() => {
        console.log('🎨 Menu: Generate Image');
        if (!safeClick('image-btn')) {
            const modal = document.getElementById('image-modal-overlay');
            if (modal && typeof openModal === 'function') openModal(modal);
        }
    });

    window.electronAPI.onOpenCode(() => {
        console.log('💻 Menu: Run Code');
        if (!safeClick('code-btn')) {
            const modal = document.getElementById('code-modal-overlay');
            if (modal && typeof openModal === 'function') openModal(modal);
        }
    });

    window.electronAPI.onUploadFile(() => {
        console.log('📎 Menu: Upload File');
        if (!safeClick('upload-btn')) {
            const fileInput = document.getElementById('file-upload');
            if (fileInput) fileInput.click();
        }
    });

    window.electronAPI.onViewProfile(() => {
        console.log('👤 Menu: View Profile');
        if (!safeClick('profile-btn')) {
            if (typeof openProfileModal === 'function') openProfileModal();
        }
    });

    window.electronAPI.onViewStats(() => {
        console.log('📊 Menu: View Stats');
        if (!safeClick('stats-btn')) {
            if (typeof loadDetailedStats === 'function') loadDetailedStats();
        }
    });

    window.electronAPI.onChangeMode((mode) => {
        console.log('🎭 Menu: Change Mode to', mode);
        const items = document.querySelectorAll('.dropdown-item');
        let found = false;
        items.forEach(item => {
            const itemMode = item.getAttribute('data-mode') || item.innerText.trim();
            if (itemMode === mode) {
                item.click();
                found = true;
            }
        });
        if (!found && typeof selectMode === 'function') {
            selectMode(mode);
        }
    });

    window.electronAPI.onToggleTurbo((enabled) => {
        console.log('⚡ Menu: Turbo Mode', enabled ? 'ON' : 'OFF');
        const turboBtn = document.getElementById('turbo-btn');
        if (turboBtn) {
            const isActive = turboBtn.classList.contains('active');
            if (isActive !== enabled) turboBtn.click();
        } else if (typeof toggleTurboMode === 'function') {
            if (turboMode !== enabled) toggleTurboMode();
        }
    });

    window.electronAPI.onToggleSearch((enabled) => {
        console.log('🌐 Menu: Web Search', enabled ? 'ON' : 'OFF');
        const searchBtn = document.getElementById('search-btn');
        if (searchBtn) {
            const isActive = searchBtn.classList.contains('active');
            if (isActive !== enabled) searchBtn.click();
        } else if (typeof toggleSearchMode === 'function') {
            if (searchMode !== enabled) toggleSearchMode();
        }
    });

    window.electronAPI.onOpenSettings(() => {
        console.log('⚙️ Menu: Settings');
        if (typeof showNotification === 'function') {
            showNotification('⚙️ Settings panel coming soon!', 'info', 2000);
        }
    });

    window.electronAPI.onExportChat(() => {
        console.log('💾 Menu: Export Chat');
        exportChatToFile();
    });

    window.electronAPI.onBrowsePersonalities(() => {
        console.log('🎭 Menu: Browse Personalities');
        if (!safeClick('personalities-btn')) {
            if (typeof openPersonalitiesBrowser === 'function') openPersonalitiesBrowser();
        }
    });

    window.electronAPI.onOpenAgentStudio(() => {
        console.log('🤖 Agent Studio clicked - opening...');
        window.open('/ai/agent-studio/', '_blank');
    });

    window.electronAPI.onOpenDevHub(() => {
        console.log('🔑 Developer Hub clicked - opening...');
        window.open('/ai/devhub/', '_blank');
    });

    window.electronAPI.onOpenAdmin(() => {
        console.log('👑 Admin Dashboard clicked - opening...');
        window.open('/ai/admin/', '_blank');
    });
    
    window.electronAPI.onUpdateStatus((event, data) => {
        console.log('Update status:', data.status);
        if (data.status === 'downloading') {
            showNotification(`⬇️ Downloading update v${data.version}...`, 'info', 5000);
        } else if (data.status === 'downloaded') {
            showNotification(`✅ Update ready! Restart to install.`, 'success', 5000);
        }
    });

    window.electronAPI.onUpdateProgress((event, data) => {
        console.log(`Update progress: ${data.percent}%`);
    });

    console.log('✅ All menu handlers registered');
}

function exportChatToFile() {
    const chatContainer = document.getElementById('chat-history');
    if (!chatContainer || !chatContainer.children.length) {
        if (typeof showNotification === 'function') {
            showNotification('No messages to export', 'error');
        }
        return;
    }
    
    const messages = document.querySelectorAll('.message');
    let exportText = '🧙 Wizard.AI Chat Export\n';
    exportText += '='.repeat(50) + '\n';
    exportText += `Date: ${new Date().toLocaleString()}\n`;
    exportText += '='.repeat(50) + '\n\n';
    
    messages.forEach(msg => {
        const isUser = msg.classList.contains('user');
        const sender = isUser ? '👤 You' : '🧙 Wizard.AI';
        const textEl = msg.querySelector('.message-text');
        let text = textEl ? textEl.innerText : '';
        if (!isUser) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = text;
            text = tempDiv.textContent;
        }
        const timeEl = msg.querySelector('.message-time');
        const time = timeEl ? timeEl.innerText : '';
        exportText += `[${time}] ${sender}:\n${text}\n\n`;
        exportText += '-'.repeat(40) + '\n\n';
    });
    
    const blob = new Blob([exportText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wizard-chat-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    if (typeof showNotification === 'function') {
        showNotification('✅ Chat exported!', 'success');
    }
}

// ============================================
// EVENT LISTENERS SETUP
// ============================================
function setupEventListeners() {
    if (sendBtn) sendBtn.addEventListener('click', sendMessage);
    if (chatInput) chatInput.addEventListener('keypress', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    if (voiceBtn) voiceBtn.addEventListener('click', toggleVoiceInput);
    if (turboBtn) turboBtn.addEventListener('click', toggleTurboMode);
    if (searchBtn) searchBtn.addEventListener('click', toggleSearchMode);
    if (uploadBtn) uploadBtn.addEventListener('click', () => fileUpload.click());
    if (codeBtn) codeBtn.addEventListener('click', () => openModal(codeModal));
    if (imageBtn) imageBtn.addEventListener('click', () => openModal(imageModal));
    if (profileBtn) profileBtn.addEventListener('click', openProfileModal);
    if (statsBtn) statsBtn.addEventListener('click', loadDetailedStats);
    if (personalitiesBtn) personalitiesBtn.addEventListener('click', openPersonalitiesBrowser);
    if (devHubBtn) devHubBtn.addEventListener('click', () => window.open('/ai/devhub/', '_blank'));
    if (agentStudioBtn) agentStudioBtn.addEventListener('click', () => window.open('/ai/agent-studio/', '_blank'));
    if (updateHistoryBtn) updateHistoryBtn.addEventListener('click', showUpdateHistory);
    if (closeUpdate) closeUpdate.addEventListener('click', () => closeModal(updateModal));
    if (fileUpload) fileUpload.addEventListener('change', handleFileUpload);
    if (newChatBtn) newChatBtn.addEventListener('click', createNewChat);
    if (renameChatBtn) renameChatBtn.addEventListener('click', () => openRenameModal(activeChatId));
    if (deleteChatBtn) deleteChatBtn.addEventListener('click', () => deleteChat(activeChatId));
    if (resetCurrentBtn) resetCurrentBtn.addEventListener('click', resetCurrentChat);
    if (saveProfileBtn) saveProfileBtn.addEventListener('click', saveProfile);
    if (closeProfileBtn) closeProfileBtn.addEventListener('click', () => closeModal(profileModal));
    
    // Image modal
    if (generateImageBtn) generateImageBtn.addEventListener('click', generateImageManual);
    if (imagePrompt) imagePrompt.addEventListener('keypress', e => {
        if (e.key === 'Enter') generateImageManual();
    });
    
    const loginBtn = document.getElementById('show-login-btn');
    const signupBtn = document.getElementById('show-signup-btn');
    if (loginBtn) loginBtn.addEventListener('click', () => showAuthModal(true));
    if (signupBtn) signupBtn.addEventListener('click', () => showAuthModal(false));
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    if (authSwitchBtn) authSwitchBtn.addEventListener('click', toggleAuthMode);
    if (authSubmit) authSubmit.addEventListener('click', handleAuthSubmit);
    if (closeAuth) closeAuth.addEventListener('click', () => closeModal(authModal));
    if (resendCodeBtn) resendCodeBtn.addEventListener('click', resendVerificationCode);
    
    // Code modal
    if (runCodeBtn) runCodeBtn.addEventListener('click', executeCode);
    if (clearCodeBtn) clearCodeBtn.addEventListener('click', () => {
        if (codeInput) codeInput.value = '';
        if (codeOutput) codeOutput.textContent = '';
    });
    
    // Personality creator
    if (toggleCreatorBtn) toggleCreatorBtn.addEventListener('click', toggleCreatorPanel);
    if (savePersonality) savePersonality.addEventListener('click', saveCustomPersonality);
    if (cancelPersonality) cancelPersonality.addEventListener('click', closeCreatorPanel);
    if (closeCreator) closeCreator.addEventListener('click', closeCreatorPanel);
    
    // Rename modal
    if (renameSave) renameSave.addEventListener('click', saveRename);
    if (renameCancel) renameCancel.addEventListener('click', () => closeModal(renameModal));
    if (renameInput) renameInput.addEventListener('keypress', e => {
        if (e.key === 'Enter') saveRename();
    });
    
    // Personality tabs
    if (tabBtns.length) tabBtns.forEach(btn => {
        btn.addEventListener('click', () => switchPersonalityTab(btn.dataset.tab));
    });
    
    // Close modals when clicking overlay
    window.addEventListener('click', e => {
        if (e.target.classList.contains('modal-overlay')) closeModal(e.target);
    });
    
    // Emergency reset
    document.addEventListener('keydown', e => {
        if (e.key === 'F2') {
            e.preventDefault();
            emergencyReset();
        }
    });
}

// Detect if running as PWA
if (window.matchMedia('(display-mode: standalone)').matches) {
    console.log('🏠 Running as installed PWA');
    document.body.classList.add('pwa-installed');
}

// Add haptic feedback on send (if supported)
if (sendBtn && 'vibrate' in navigator) {
    sendBtn.addEventListener('click', () => {
        navigator.vibrate(10);
    });
}

console.log('✅ Wizard.AI v15.2.0 - Ecosystem AI fully loaded!');
console.log('🧠 Features: Calendar integration, Email search, Note search, Meeting prep');
console.log('🎨 Type "Generate an image of..." to create images in chat!');
