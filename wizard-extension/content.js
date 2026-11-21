// content.js - Fixed button click
(function() {
    if (document.getElementById('wizard-ai-widget')) return;
    
    if (window.location.href.startsWith('chrome://') || 
        window.location.href.startsWith('brave://') ||
        window.location.href.startsWith('edge://')) return;
    
    function injectWidget() {
        if (!document.body) {
            setTimeout(injectWidget, 200);
            return;
        }
        
        if (document.getElementById('wizard-ai-widget')) return;
        
        const widget = document.createElement('div');
        widget.id = 'wizard-ai-widget';
        widget.innerHTML = `
            <style>
                #wizard-ai-widget {
                    position: fixed !important;
                    bottom: 20px !important;
                    right: 20px !important;
                    z-index: 999999 !important;
                }
                .wizard-button {
                    background: linear-gradient(135deg, #8b5cf6, #6d28d9) !important;
                    border: none !important;
                    border-radius: 50% !important;
                    width: 56px !important;
                    height: 56px !important;
                    font-size: 28px !important;
                    cursor: pointer !important;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.3) !important;
                    transition: all 0.3s ease !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    color: white !important;
                }
                .wizard-button:hover {
                    transform: scale(1.1) !important;
                    box-shadow: 0 0 25px rgba(139,92,246,0.6) !important;
                }
                .wizard-tooltip {
                    position: absolute !important;
                    bottom: 70px !important;
                    right: 0 !important;
                    background: rgba(0,0,0,0.85) !important;
                    padding: 6px 12px !important;
                    border-radius: 8px !important;
                    font-size: 12px !important;
                    white-space: nowrap !important;
                    display: none !important;
                    color: white !important;
                }
                .wizard-button:hover .wizard-tooltip {
                    display: block !important;
                }
            </style>
            <div class="wizard-button" id="wizard-float-btn">
                🧙
                <div class="wizard-tooltip">Ask Wizard.AI</div>
            </div>
        `;
        document.body.appendChild(widget);
        
        const btn = document.getElementById('wizard-float-btn');
        if (btn) {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Wizard button clicked');
                
                try {
                    // Send message to background to open sidebar
                    const response = await chrome.runtime.sendMessage({ action: 'openSidebar' });
                    console.log('Sidebar response:', response);
                } catch (err) {
                    console.error('Error opening sidebar:', err);
                }
            });
        }
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectWidget);
    } else {
        injectWidget();
    }
    
    setTimeout(injectWidget, 1000);
})();