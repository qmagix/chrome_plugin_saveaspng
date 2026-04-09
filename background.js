chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'capturePage') {
    // Inject the scroll-and-stitch logic
    chrome.scripting.executeScript({
      target: { tabId: message.tabId },
      files: ['content_stitch.js']
    }).then(() => {
      // Start the capture sequence in the injected script
      chrome.tabs.sendMessage(message.tabId, { action: 'startStitch', format: message.format }, (response) => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: chrome.runtime.lastError.message });
        } else if (response && response.error) {
          sendResponse({ error: response.error });
        } else {
          sendResponse({ success: true });
        }
      });
    }).catch(err => {
      sendResponse({ error: err.message });
    });
    return true; // Indicates async response
  }
  
  if (message.action === 'captureVisibleTab') {
    // Always capture as PNG for high quality stitching
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ dataUrl: dataUrl });
      }
    });
    return true; // async
  }

  if (message.action === 'downloadImage') {
    chrome.tabs.get(sender.tab.id, (tabObj) => {
      let titleSlug = tabObj.title ? tabObj.title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30) : 'screenshot';
      function pad(n) { return n < 10 ? '0' + n : n }
      const d = new Date();
      const timestamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
      const filename = `${titleSlug}_${timestamp}.${message.format === 'jpeg' ? 'jpg' : 'png'}`;

      chrome.downloads.download({
        url: message.dataUrl,
        filename: filename,
        saveAs: true
      }, () => {
         sendResponse({ success: true });
      });
    });
    return true; // async
  }
});
