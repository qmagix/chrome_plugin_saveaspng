chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'capturePage') {
    handleCapture(message.tabId, message.format)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((err) => {
        sendResponse({ error: err.message || err.toString() });
      });
    return true; // Indicates async response
  }
});

async function handleCapture(tabId, format) {
  const version = '1.3';
  const debugTarget = { tabId: tabId };

  try {
    // Attach the debugger
    await new Promise((resolve, reject) => {
      chrome.debugger.attach(debugTarget, version, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });

    // Get the page layout metrics (gives us full width and height)
    const metrics = await new Promise((resolve, reject) => {
      chrome.debugger.sendCommand(debugTarget, 'Page.getLayoutMetrics', {}, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result);
        }
      });
    });

    // Content size usually represents the entire scrolling area
    const contentSize = metrics.contentSize || metrics.cssContentSize;
    if (!contentSize) {
      throw new Error('Failed to retrieve page dimensions.');
    }

    const width = Math.ceil(contentSize.width);
    const height = Math.ceil(contentSize.height);

    // Capture the screenshot beyond viewport
    const captureResult = await new Promise((resolve, reject) => {
      chrome.debugger.sendCommand(debugTarget, 'Page.captureScreenshot', {
        format: format, // 'png' or 'jpeg'
        captureBeyondViewport: true,
        clip: {
          x: 0,
          y: 0,
          width: width,
          height: height,
          scale: 1
        }
      }, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result);
        }
      });
    });

    // Detach debugger
    await new Promise((resolve) => {
      chrome.debugger.detach(debugTarget, () => {
        resolve(); // Ignore error if detachment fails
      });
    });

    if (!captureResult || !captureResult.data) {
      throw new Error('Failed to capture screenshot data.');
    }

    // Convert the base64 data to a data URL
    const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const dataUrl = `data:${mimeType};base64,${captureResult.data}`;

    // Generate filename based on date/time
    function pad(n) { return n < 10 ? '0' + n : n }
    const d = new Date();
    const timestamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    
    // Attempt to get page title for the filename
    const tabObj = await chrome.tabs.get(tabId);
    let titleSlug = tabObj.title ? tabObj.title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30) : 'screenshot';

    const filename = `${titleSlug}_${timestamp}.${format === 'jpeg' ? 'jpg' : 'png'}`;

    // Download the image
    await chrome.downloads.download({
      url: dataUrl,
      filename: filename,
      saveAs: true // Let the user confirm or change directory
    });

  } catch (err) {
    // If an error happened, ensure debugger is detached
    try {
      await new Promise((resolve) => {
        chrome.debugger.detach(debugTarget, () => resolve());
      });
    } catch(e) {}
    throw err;
  }
}
