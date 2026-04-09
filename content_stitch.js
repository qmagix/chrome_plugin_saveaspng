// Avoid re-registering the listener if injected multiple times
if (typeof window.hasStitchListener === 'undefined') {
  window.hasStitchListener = true;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'startStitch') {
      doScrollAndStitch(message.format)
        .then(() => sendResponse({ success: true }))
        .catch(e => sendResponse({ error: e.message || e.toString() }));
      return true; // async response
    }
  });

  async function doScrollAndStitch(format) {
    const scrollHeight = Math.max(
      document.body.scrollHeight, document.documentElement.scrollHeight,
      document.body.offsetHeight, document.documentElement.offsetHeight,
      document.body.clientHeight, document.documentElement.clientHeight
    );
    const scrollWidth = Math.max(
      document.body.scrollWidth, document.documentElement.scrollWidth,
      document.body.offsetWidth, document.documentElement.offsetWidth,
      document.body.clientWidth, document.documentElement.clientWidth
    );

    const viewportHeight = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    
    // Create canvas scaled to device pixel ratio for retina displays
    const canvas = document.createElement('canvas');
    canvas.width = scrollWidth * dpr;
    canvas.height = scrollHeight * dpr;
    const ctx = canvas.getContext('2d');

    const originalScrollX = window.scrollX;
    const originalScrollY = window.scrollY;

    // Inject temporary style to hide scrollbars gracefully without breaking scrolling calculations
    const style = document.createElement('style');
    style.textContent = '::-webkit-scrollbar { display: none !important; }';
    document.head.appendChild(style);

    try {
      let yPos = 0;
      
      while (yPos < scrollHeight) {
        window.scrollTo(0, yPos);
        
        // Wait for dynamic layout, lazy images, or sticky headers to settle
        await new Promise(r => setTimeout(r, 450));

        // Request visible viewport capture from the background worker
        const captureResponse = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({ action: 'captureVisibleTab' }, (res) => {
             if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
             else if (res.error) reject(new Error(res.error));
             else resolve(res);
          });
        });

        // Load the captured data URL into an image
        const img = new Image();
        img.src = captureResponse.dataUrl;
        await new Promise((resolve, reject) => {
           img.onload = resolve;
           img.onerror = reject;
        });

        // Get exact actual scroll Y. The browser might cap window.scrollY at the bottom of the page.
        // If we requested yPos=3000 but max scroll is 2500, we must draw at 2500 to avoid gaps.
        const actualScrollY = window.scrollY;
        
        // Draw image accounting for Retina high-density displays
        ctx.drawImage(img, 0, actualScrollY * dpr, img.width, img.height);

        // If we've reached the very bottom, break early to avoid infinite loop on weird layouts
        if (actualScrollY < yPos && actualScrollY > 0) {
            // We couldn't scroll as far as requested, meaning we hit the bottom
            break;
        }

        yPos += viewportHeight;
      }

      // Convert the final stitched canvas to Data URL
      const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
      const finalDataUrl = canvas.toDataURL(mimeType, 1.0);

      // Send to background for download
      await new Promise((resolve, reject) => {
         chrome.runtime.sendMessage({ action: 'downloadImage', dataUrl: finalDataUrl, format: format }, (res) => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else if (res && res.success) resolve();
            else reject(new Error('Failed to download image'));
         });
      });

    } finally {
      // Clean up
      if (style.parentNode) {
        style.parentNode.removeChild(style);
      }
      window.scrollTo(originalScrollX, originalScrollY);
    }
  }
}
