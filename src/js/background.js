let isCapturing = false;
let currentRequestId = null;
let captureConfig = {
  urlPatterns: ['https://ad.xiaohongshu.com/api/galaxy/kol/note/list'],
  requestTypes: ['xmlhttprequest'],
  httpMethods: ['POST'],
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
    if (isCapturing) {
      addRequestListener();
    }
  }
});

// 监听消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'toggleCapture') {
    try {
      isCapturing = message.value;
      
      if (isCapturing) {
        // 重置请求集合
        capturedRequests.clear();
        addRequestListener();
      } else {
        removeRequestListener();
      }
      
      console.log('捕获状态已切换:', isCapturing);
      sendResponse({ success: true });
    } catch (error) {
      console.error('切换捕获状态失败:', error);
      sendResponse({ success: false, error: error.message });
    }
    return true;
  }
});

// 添加请求监听器
function addRequestListener() {
  removeRequestListener();
  chrome.webRequest.onBeforeRequest.addListener(
    handleRequest,
    { 
      urls: ["<all_urls>"],
      types: ["xmlhttprequest"]
    },
    ["requestBody"]
  );
  console.log('已添加请求监听器');
}

// 移除请求监听器
function removeRequestListener() {
  try {
    chrome.webRequest.onBeforeRequest.removeListener(handleRequest);
    console.log('已移除请求监听器');
  } catch (error) {
    console.log('移除监听器失败:', error);
  }
}

// 请求处理函数
async function handleRequest(details) {
  if (!isCapturing) return;
  if (!shouldCaptureRequest(details)) return;
  
  // 解析请求体
  let originalBody = null;
  if (details.requestBody && details.requestBody.raw) {
    const rawData = new Uint8Array(details.requestBody.raw[0].bytes);
    const decoder = new TextDecoder('utf-8');
    const decodedStr = decoder.decode(rawData);
    
    try {
      originalBody = JSON.parse(decodedStr);
    } catch (e) {
      try {
        const urlDecodedStr = decodeURIComponent(decodedStr);
        originalBody = JSON.parse(urlDecodedStr);
      } catch (error) {
        console.error('请求体解析失败:', error);
        return;
      }
    }
  }

  // 只处理第一页的请求
  if (originalBody && originalBody.page_num !== 1) {
    return;
  }

  // 使用不包含页码的信息生成唯一标识
  const { page_num, ...bodyWithoutPage } = originalBody;
  const requestKey = `${details.url}_${details.method}_${JSON.stringify(bodyWithoutPage)}`;
  if (capturedRequests.has(requestKey)) return;
  
  const newRequestId = Date.now();
  
  try {
    // 终止之前的请求循环
    if (currentRequestId) {
      console.log(`终止请求 ${currentRequestId} 的处理`);
      isCapturing = false;
      await new Promise(resolve => setTimeout(resolve, 1000));
      await notifyPopup({ type: 'newCaptureStarted' });
    }

    // 清空之前的请求记录并添加新的请求标识
    capturedRequests.clear();
    capturedRequests.add(requestKey);
    
    // 更新当前请求ID和状态
    currentRequestId = newRequestId;
    isCapturing = true;
    
    console.log('检测到请求:', details.url);
    
    // 解析原始请求体
    let originalBody = null;
    if (details.requestBody && details.requestBody.raw) {
      const rawData = new Uint8Array(details.requestBody.raw[0].bytes);
      const decoder = new TextDecoder('utf-8');
      const decodedStr = decoder.decode(rawData);
      console.log('原始解码字符串:', decodedStr);
      
      try {
        originalBody = JSON.parse(decodedStr);
        
        if (originalBody.hot_words) {
          originalBody.hot_words = originalBody.hot_words.map(word => {
            if (/[^\u0000-\u007F]/.test(word)) {
              try {
                const encoder = new TextEncoder();
                const decoder = new TextDecoder('utf-8');
                const encoded = encoder.encode(word);
                return decoder.decode(encoded);
              } catch (e) {
                console.error('hot_words 解码失败:', e);
                return word;
              }
            }
            return word;
          });
        }
      } catch (e) {
        console.error('JSON解析失败，尝试二次解码:', e);
        const urlDecodedStr = decodeURIComponent(decodedStr);
        originalBody = JSON.parse(urlDecodedStr);
      }
      
      console.log('处理后的请求体:', originalBody);
    }

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
        if (!isCapturing || currentRequestId !== newRequestId) {
          console.log(`请求 ${newRequestId} 已被终止`);
          break;
        }

        const pageBody = { ...originalBody, page_num: page };
        
        const result = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: async (url, method, body) => {
            const randomDelay = Math.floor(Math.random() * 1000) + 500;
            await new Promise(resolve => setTimeout(resolve, randomDelay));

            const response = await fetch(url, {
              method: method,
              headers: {
                'accept': 'application/json, text/plain, */*',
                'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'content-type': 'application/json;charset=UTF-8',
                'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
              },
              body: JSON.stringify(body),
              credentials: 'include',
              mode: 'cors',
              referrerPolicy: 'strict-origin-when-cross-origin'
            });

            if (!response.ok) {
              throw new Error(`请求失败: ${response.status}`);
            }

            return {
              body: await response.text(),
              status: response.status,
              headers: Object.fromEntries(response.headers)
            };
          },
          args: [details.url, details.method, pageBody]
        });

        const responseData = result[0].result;

        // 添加页码和分组信息到保存的数据中
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
          headers: responseData.headers,
          groupId: originalBody.list_type + '_' + originalBody.date  // 添加分组标识
        });

        const baseDelay = 2000;
        const pageDelay = Math.min(page * 500, 3000);
        const randomDelay = Math.floor(Math.random() * 1000);
        await new Promise(resolve => setTimeout(resolve, baseDelay + pageDelay + randomDelay));
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
    if (currentRequestId === newRequestId) {
      currentRequestId = null;
      isCapturing = true;
    }
    setTimeout(() => {
      capturedRequests.delete(requestKey);
    }, 5000);
  }
}

function shouldCaptureRequest(details) {
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

async function notifyPopup(message) {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length > 0) {
      await chrome.runtime.sendMessage(message)
        .catch(error => {
          if (!error.message.includes("Receiving end does not exist")) {
            console.error('通知失败:', error);
          }
        });
    }
  } catch (error) {
    console.error('发送通知失败:', error);
  }
}


// 添加 Cookie 管理函数
async function manageCookies() {
  try {
    // 1. 清理旧的 Cookie
    await chrome.cookies.remove({
      url: "http://api.moreapi.cn",
      name: "sessionid"
    });

    // 2. 设置必要的 Cookies
    const cookies = [
      {
        name: "a1",
        value: "1954623fe52k7f6segccstft6ignu5wbl2cd4umkp30000112782"
      },
      {
        name: "webId",
        value: "679150ea5864e6684317e3eb8a289761"
      },
      {
        name: "gid",
        value: "yj24KJ484j1iyj24KJqidJ762JTWiKMdkSSMSTU9i9K3kfq8I72ED4888yyJWYJ8ydKdWK0q"
      },
      {
        name: "x-user-id-ad.xiaohongshu.com",
        value: "67b5a91404f0000000000001"
      },
      {
        name: "customerClientId",
        value: "898486601331467"
      },
      {
        name: "x-user-id-ad-market.xiaohongshu.com",
        value: "67b5a91404f0000000000001"
      },
      {
        name: "access-token-ad-market.xiaohongshu.com",
        value: "customer.ad_market.AT-68c517475985715453335642qnxbt564ju3syiap"
      },
      {
        name: "x-user-id-partner.xiaohongshu.com",
        value: "67b5a91404f0000000000001"
      },
      {
        name: "abRequestId",
        value: "679150ea5864e6684317e3eb8a289761"
      },
      {
        name: "webBuild",
        value: "4.60.1"
      },
      {
        name: "customer-sso-sid",
        value: "68c517483050404079425320nswnbnlnlrglafuw"
      },
      {
        name: "ares.beaker.session.id",
        value: "1742283454579049065443"
      },
      {
        name: "access-token-ad.xiaohongshu.com",
        value: "customer.leona.AT-74b4a0fa84804dd690e923e88259fb69-54cf02ecc2d34c098121cecae0cd617d"
      },
      {
        name: "x-user-id-fankui-out.xiaohongshu.com",
        value: "67b5a91404f0000000000001"
      },
      {
        name: "web_session",
        value: "0400698cd51570566fff52efef354b233a21fe"
      },
      {
        name: "xsecappid",
        value: "xhs-pc-web"
      },
      {
        name: "acw_tc",
        value: "0a0bb31817424403604148528e0591d44995906b787a1394857b27202c064a"
      },
      {
        name: "websectiga",
        value: "634d3ad75ffb42a2ade2c5e1705a73c845837578aeb31ba0e442d75c648da36a"
      },
      {
        name: "sec_poison_id",
        value: "3c68b8e7-f875-4699-9335-c10d4e28a467"
      },
      {
        name: "unread",
        value: "{%22ub%22:%2267d3b0f00000000007035d70%22%2C%22ue%22:%2267dace86000000000603bb9e%22%2C%22uc%22:25}"
      },
      {
        name: "loadts",
        value: "1742441697553"
      }
    ];

    for (const cookie of cookies) {
      await chrome.cookies.set({
        url: "http://api.moreapi.cn",
        name: cookie.name,
        value: cookie.value,
        domain: "api.moreapi.cn",
        path: "/",
        secure: false,
        httpOnly: false
      });
    }
  } catch (error) {
    console.error('Cookie 管理失败:', error);
  }
}

// 笔记详情获取函数
async function fetchNoteDetail(noteInfo) {
  try {
    // 先管理 Cookie
    await manageCookies();

    const myHeaders = new Headers();
    myHeaders.append("Authorization", "Bearer 2FEmoZ2XeBzGoW2Ao6itxFOIQmu9nIac9msmPNDlZrdVr641LbSc9jzpcVJR2NzW");
    // myHeaders.append("Cookie", "a1=1954623fe52k7f6segccstft6ignu5wbl2cd4umkp30000112782; webId=679150ea5864e6684317e3eb8a289761; gid=yj24KJ484j1iyj24KJqidJ762JTWiKMdkSSMSTU9i9K3kfq8I72ED4888yyJWYJ8ydKdWK0q; x-user-id-ad.xiaohongshu.com=67b5a91404f0000000000001; customerClientId=898486601331467; x-user-id-ad-market.xiaohongshu.com=67b5a91404f0000000000001; access-token-ad-market.xiaohongshu.com=customer.ad_market.AT-68c517475985715453335642qnxbt564ju3syiap; x-user-id-partner.xiaohongshu.com=67b5a91404f0000000000001; abRequestId=679150ea5864e6684317e3eb8a289761; webBuild=4.60.1; customer-sso-sid=68c517483050404079425320nswnbnlnlrglafuw; ares.beaker.session.id=1742283454579049065443; access-token-ad.xiaohongshu.com=customer.leona.AT-74b4a0fa84804dd690e923e88259fb69-54cf02ecc2d34c098121cecae0cd617d; x-user-id-fankui-out.xiaohongshu.com=67b5a91404f0000000000001; web_session=0400698cd51570566fff52efef354b233a21fe; xsecappid=xhs-pc-web; acw_tc=0a0bb31817424403604148528e0591d44995906b787a1394857b27202c064a; websectiga=634d3ad75ffb42a2ade2c5e1705a73c845837578aeb31ba0e442d75c648da36a; sec_poison_id=3c68b8e7-f875-4699-9335-c10d4e28a467; unread={%22ub%22:%2267d3b0f00000000007035d70%22%2C%22ue%22:%2267dace86000000000603bb9e%22%2C%22uc%22:25}; loadts=1742441697553");
    myHeaders.append("Content-Type", "application/json");
    
    const response = await fetch('http://api.moreapi.cn/api/xhs/note_detail', {
      method: 'POST',
      headers: myHeaders,
      body: JSON.stringify({
        note_id: noteInfo.note_id,
        xsec_token: noteInfo.xsec_token,
        share_text: "",
        proxy: ""
      }),
      credentials: 'include',  // 确保包含 cookies
      redirect: 'follow'
    });

    return await response.json();
  } catch (error) {
    console.error('获取笔记详情失败:', error);
    throw error;
  }
}

// 添加消息监听器

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'fetchNoteDetail') {
    fetchNoteDetail(message.noteInfo)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;  // 保持消息通道开启
  }
});

// 添加获取项目信息的函数
async function fetchProjectInfo(noteId, tab) {
  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async (noteId) => {
        // 计算近七天的时间范围
        const now = new Date();
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        const start = new Date(end);
        start.setDate(start.getDate() - 7);
        start.setHours(0, 0, 0, 0);

        const response = await fetch('https://ad.xiaohongshu.com/api/leona/ugc_heat/report/list', {
          method: 'POST',
          headers: {
            'accept': 'application/json, text/plain, */*',
            'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'content-type': 'application/json;charset=UTF-8',
            'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          },
          body: JSON.stringify({
            noteId: noteId,
            pageNum: 1,
            pageSize: 10,
            projectCreateTimeBegin: start.getTime(),
            projectCreateTimeEnd: end.getTime(),
            projectId: "",
            projectName: "",
            reportType: "PROJECT"
          }),
          credentials: 'include'
        });

        if (!response.ok) {
          throw new Error(`请求失败: ${response.status}`);
        }

        return await response.json();
      },
      args: [noteId]
    });

    return result[0].result;
  } catch (error) {
    console.error('获取项目信息失败:', error);
    throw error;
  }
}

// 在现有的消息监听器中添加新的处理
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'fetchNoteDetail') {
    fetchNoteDetail(message.noteInfo)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  if (message.type === 'fetchProjectInfo') {
    fetchProjectInfo(message.noteId, message.tab)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});