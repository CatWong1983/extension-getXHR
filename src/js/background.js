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


// 添加获取评论的函数
async function fetchAllComments(noteId, xsecToken, tab) {
  console.log('开始获取评论，参数:', { noteId, xsecToken, tabId: tab.id });
  
  try {
    // 获取当前域名的所有 cookies
    const cookies = await chrome.cookies.getAll({
      domain: '.xiaohongshu.com'
    });
    const a1Value = cookies.find(cookie => cookie.name === 'a1')?.value;
    if (!a1Value) {
      console.error('未找到 a1 cookie');
      return [];
    }

    // 注入 CryptoJS 和 signature.js
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['src/lib/crypto-js.min.js', 'src/js/utils/signature.js']
    });
    
    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async (noteId, xsecToken, a1Value) => {  // 添加 a1Value 参数
        

        // 获取主评论的函数
        const fetchComments = async (cursor = '') => {

          const response = await fetch(
            `https://edith.xiaohongshu.com/api/sns/web/v2/comment/page?note_id=${noteId}&cursor=${cursor}&top_comment_id=&image_formats=jpg,webp,avif&xsec_token=${xsecToken}`,
            {
              headers: {
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Origin': 'https://www.xiaohongshu.com',
                'Referer': 'https://www.xiaohongshu.com/',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'              
              },
              credentials: 'include'
            }
          );
          return await response.json();
        };

        // 获取子评论的函数
        const fetchSubComments = async (commentId, cursor = '') => {

          const url = `/api/sns/web/v2/comment/sub/page?note_id=${noteId}&root_comment_id=${commentId}&num=10&cursor=${cursor}&image_formats=jpg,webp,avif&top_comment_id=&xsec_token=${xsecToken}`;
          
          // 确保 getXs 函数存在
          if (typeof window.getXs !== 'function') {
            console.error('getXs function not found');
            return null;
          }
          
          try {
            const [xs, xt] = window.getXs(url, a1Value);  // 直接使用传入的 a1Value
            
            const response = await fetch(
              `https://edith.xiaohongshu.com${url}`,
              {
                headers: {
                  'accept': 'application/json, text/plain, */*',
                  'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
                  'x-b3-traceid': Array.from({ length: 16 }, () => 'abcdef0123456789'.charAt(Math.floor(16 * Math.random()))
                  ).join(''),
                  'x-s': xs,
                  'x-t': xt
                },
                referrer: 'https://www.xiaohongshu.com/',
                method: 'GET',
                credentials: 'include'
              }
            );
            return await response.json();
          } catch (error) {
            console.error('获取签名或发送请求失败:', error);
            return null;
          }
        };

        
        let allComments = [];
        let cursor = '';
        let hasMore = true;
        let mainCommentCount = 0;
        let subCommentCount = 0;

        try {
          while (hasMore) {
            const data = await fetchComments(cursor);
            if (!data || !data.data) {
              console.error('获取主评论失败:', data);
              break;
            }
            
            hasMore = data.data.has_more;
            cursor = data.data.cursor;
            const comments = data.data.comments || [];
            mainCommentCount += comments.length;
            
            for (const comment of comments) {
              if (!comment || !comment.user_info) continue;
              
              allComments.push({
                id: comment.id,
                text: `${comment.user_info.nickname}评论: ${comment.content}`,
                rawContent: comment.content,
                type: 'main',
                likes: comment.like_count,
                location: comment.ip_location
              });
              
              if (comment.sub_comments?.length > 0) {
                subCommentCount += comment.sub_comments.length;
                for (const subComment of comment.sub_comments) {
                  if (!subComment || !subComment.user_info || !subComment.target_comment?.user_info) continue;
                  
                  allComments.push({
                    id: subComment.id,
                    text: `${subComment.user_info.nickname}回复${subComment.target_comment.user_info.nickname}: ${subComment.content}`,
                    rawContent: subComment.content,
                    type: 'sub',
                    likes: subComment.like_count,
                    location: subComment.ip_location
                  });
                }
              }

              if (comment.sub_comment_has_more) {
                let subCursor = comment.sub_comment_cursor;
                let hasMoreSub = true;

                while (hasMoreSub) {
                
                  const subData = await fetchSubComments(comment.id, subCursor);
                  if (!subData || !subData.data) {
                    console.error('获取子评论失败:', subData);
                    break;
                  }
                  
                  const newSubComments = subData.data.comments || [];
                  subCommentCount += newSubComments.length;
                  
                  for (const subComment of newSubComments) {
                    if (!subComment || !subComment.user_info || !subComment.target_comment?.user_info) continue;
                    
                    allComments.push({
                      id: subComment.id,
                      text: `${subComment.user_info.nickname}回复${subComment.target_comment.user_info.nickname}: ${subComment.content}`,
                      rawContent: subComment.content,
                      type: 'sub',
                      likes: subComment.like_count,
                      location: subComment.ip_location
                    });
                  }

                  hasMoreSub = subData.data.has_more;
                  subCursor = subData.data.cursor;
                  await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 1000) + 500));
                }
              }
            }

            console.log(`当前进度：主评论 ${mainCommentCount} 条，子评论 ${subCommentCount} 条`);
            await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 1000) + 500));
          }
        } catch (error) {
          console.error('获取评论过程中出错:', error);
        }

        console.log('评论获取完成，总计:', {
          mainComments: mainCommentCount,
          subComments: subCommentCount,
          total: allComments.length
        });
        
        return allComments;
      },
      args: [noteId, xsecToken, a1Value]  // 添加 a1Value 到参数列表
    });

    console.log('评论获取脚本执行完成');
    return result[0].result;
  } catch (error) {
    console.error('获取评论失败:', error);
    throw error;
  }
}

// 在现有的消息监听器中添加新的处理
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
  
  if (message.type === 'fetchProjectInfo') {
    fetchProjectInfo(message.noteId, message.tab)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === 'fetchComments') {
    fetchAllComments(message.noteId, message.xsecToken, message.tab)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});