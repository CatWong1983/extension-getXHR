let isCapturing = false;
let captureConfig = {
  urlPatterns: [],
  requestTypes: [],
  httpMethods: [],
  maxCaptures: 100
};
let capturedRequests = new Set();

// 从存储中加载配置
chrome.storage.local.get(['captureConfig', 'isCapturing'], (result) => {
  if (result.captureConfig) {
    captureConfig = result.captureConfig;
  }
  if (typeof result.isCapturing !== 'undefined') {
    isCapturing = result.isCapturing;
  }
});

// 监听消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'toggleCapture') {
    isCapturing = message.value;
    chrome.storage.local.set({ isCapturing });
    
    // 重置请求集合
    capturedRequests.clear();
    
    // 重新初始化监听器
    initializeRequestListener();
    
    sendResponse({ success: true });
    return true;
  }
});

// 请求处理函数
async function handleRequest(details) {
  if (!isCapturing) return;
  if (!shouldCaptureRequest(details)) return;
  
  const requestKey = `${details.url}_${details.method}`;
  if (capturedRequests.has(requestKey)) return;
  capturedRequests.add(requestKey);

  try {
    console.log('检测到请求:', details.url);
    
    // 解析原始请求体
    const originalBody = details.requestBody ? 
      JSON.parse(decodeURIComponent(String.fromCharCode.apply(null, new Uint8Array(details.requestBody.raw[0].bytes)))) : 
      null;

    if (originalBody) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      // 获取第一页数据和总数
      const firstPageResult = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: async (url, method, body) => {
          const response = await fetch(url, {
            method: method,
            headers: {
              'accept': 'application/json, text/plain, */*',
              'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
              'content-type': 'application/json;charset=UTF-8'
            },
            body: JSON.stringify(body),
            credentials: 'include',
            mode: 'cors',
            referrerPolicy: 'strict-origin-when-cross-origin'
          });
          return await response.json();
        },
        args: [details.url, details.method, originalBody]
      });

      const firstPageData = firstPageResult[0].result;
      const total = firstPageData.data.total;
      const pageSize = originalBody.page_size || 10;
      const totalPages = Math.ceil(total / pageSize);

      console.log(`总数据: ${total}, 总页数: ${totalPages}`);

      // 获取所有页面的数据
      for (let page = 1; page <= totalPages; page++) {
        if (!isCapturing) break; // 如果停止捕获则中断循环
        
        const pageBody = { ...originalBody, page_num: page };
        
        const result = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: async (url, method, body) => {
            const response = await fetch(url, {
              method: method,
              headers: {
                'accept': 'application/json, text/plain, */*',
                'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'content-type': 'application/json;charset=UTF-8'
              },
              body: JSON.stringify(body),
              credentials: 'include',
              mode: 'cors',
              referrerPolicy: 'strict-origin-when-cross-origin'
            });
            return {
              body: await response.text(),
              status: response.status,
              headers: Object.fromEntries(response.headers)
            };
          },
          args: [details.url, details.method, pageBody]
        });

        const responseData = result[0].result;

        await saveResponse({
          url: details.url,
          timestamp: Date.now(),
          method: details.method,
          type: details.type,
          page: page,
          totalPages: totalPages,
          requestBody: JSON.stringify(pageBody),
          responseBody: responseData.body,
          statusCode: responseData.status,
          headers: responseData.headers
        });

        // 添加延时避免请求过快
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // 发送通知
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'images/icon48.png',
        title: '捕获成功',
        message: `已捕获所有页面数据: ${details.url.substring(0, 50)}...`
      });
    }
  } catch (error) {
    console.error('捕获失败:', error);
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'images/icon48.png',
      title: '捕获失败',
      message: error.message
    });
  } finally {
    setTimeout(() => {
      capturedRequests.delete(requestKey);
    }, 30 * 60 * 1000);
  }
}

// 初始化请求监听器
function initializeRequestListener() {
  // 移除现有监听器
  try {
    chrome.webRequest.onBeforeRequest.removeListener(handleRequest);
  } catch (error) {
    console.log('移除监听器失败:', error);
  }

  // 添加新监听器
  chrome.webRequest.onBeforeRequest.addListener(
    handleRequest,
    { urls: ["<all_urls>"] },
    ["requestBody"]
  );
}

function shouldCaptureRequest(details) {
  // URL 匹配检查
  if (captureConfig.urlPatterns.length > 0) {
    const matchesPattern = captureConfig.urlPatterns.some(pattern => {
      try {
        const regex = new RegExp(pattern);
        return regex.test(details.url);
      } catch (e) {
        console.error('正则表达式错误:', e);
        return false;
      }
    });
    if (!matchesPattern) return false;
  }

  // 请求类型检查
  if (captureConfig.requestTypes.length > 0) {
    const type = details.type.toLowerCase();
    const typeMapping = {
      'xmlhttprequest': 'xhr',
      'main_frame': 'document',
      'sub_frame': 'document'
    };
    const mappedType = typeMapping[type] || type;
    if (!captureConfig.requestTypes.includes(mappedType)) return false;
  }

  // HTTP 方法检查
  if (captureConfig.httpMethods.length > 0) {
    if (!captureConfig.httpMethods.includes(details.method)) return false;
  }

  return true;
}

async function saveResponse(capturedData) {
  try {
    const { responses = [] } = await chrome.storage.local.get('responses');
    responses.push(capturedData);
    
    while (responses.length > captureConfig.maxCaptures) {
      responses.shift();
    }
    
    await chrome.storage.local.set({ responses });
  } catch (error) {
    console.error('保存失败:', error);
  }
}

// 初始化监听器
initializeRequestListener();