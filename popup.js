document.addEventListener('DOMContentLoaded', () => {
  const btnPng = document.getElementById('btn-png');
  const btnJpg = document.getElementById('btn-jpg');
  const statusEl = document.getElementById('status');
  const errorEl = document.getElementById('error');
  const buttons = [btnPng, btnJpg];

  function setPendingState(isPending) {
    buttons.forEach(btn => btn.disabled = isPending);
    if (isPending) {
      statusEl.classList.remove('hidden');
      errorEl.classList.add('hidden');
    } else {
      statusEl.classList.add('hidden');
    }
  }

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.remove('hidden');
  }

  async function capturePage(format) {
    setPendingState(true);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        throw new Error('No active window found.');
      }
      if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
        throw new Error('Cannot capture restricted browser pages.');
      }

      // Send message to background script to perform capture
      const response = await chrome.runtime.sendMessage({
        action: 'capturePage',
        tabId: tab.id,
        format: format // 'png' or 'jpeg'
      });

      if (response && response.error) {
        throw new Error(response.error);
      }
      
      // Attempt to automatically close popup on success (could be useful, but keeping open is fine)
      window.close();
    } catch (err) {
      console.error(err);
      showError(err.message || 'An unknown error occurred.');
    } finally {
      setPendingState(false);
    }
  }

  btnPng.addEventListener('click', () => capturePage('png'));
  btnJpg.addEventListener('click', () => capturePage('jpeg'));
});
