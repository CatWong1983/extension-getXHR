import '../lib/exceljs.min.js'


let isCapturing = false;
let currentRequestId = null;
let captureConfig = {
  urlPatterns: ['https://ad.xiaohongshu.com/api/edith/ugc_heat/note_list'],
  requestTypes: ['xmlhttprequest'],
  httpMethods: ['POST'],
  maxCaptures: 100
};
let capturedRequests = new Set();
let currentProgress = '';

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
    console.log('请求体:', details);
    
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
              'content-type': 'application/json;charset=UTF-8',
              'v-seller-id': '677ce68e11448c00150b0547'
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
                'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'v-seller-id': '677ce68e11448c00150b0547'
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
      files: [
        'src/lib/crypto-js.min.js'
      ]
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
        function encryptAesCbc(plainText) {
          const key = CryptoJS.enc.Utf8.parse('7cc4adla5ay0701v');
          const iv = CryptoJS.enc.Utf8.parse('4uzjr7mbsibcaldp');
          const encrypted = CryptoJS.AES.encrypt(plainText, key, {
              iv: iv,
              mode: CryptoJS.mode.CBC,
              padding: CryptoJS.pad.Pkcs7
          });
          return encrypted.ciphertext.toString();
      }
      
        function base64Encode(str) {
            return btoa(str);
        }
        
        function generateNewXyw(payload, timestamp) {
            const inputString = `{"signSvn":"56","signType":"x2","appId":"xhs-pc-web","signVersion":"1","payload":"${payload}"}`;
            const encodedPayload = base64Encode(inputString);
            return [`XYW_${encodedPayload}`, timestamp];
        }
      
        function keyString(url = "", timestamp = 0, a1 = "") {
            const md5Str = CryptoJS.MD5('url=' + url).toString();
            const environmentStr = `x1=${md5Str};x2=0|0|0|1|0|0|1|0|0|0|1|0|0|0|0|1|0|0|0;x3=${a1};x4=${timestamp};`;
            return base64Encode(environmentStr);
        }
        
        // Add export statement
        function getXs(url, a1) {
            const timestamp = Date.now();
            const key = keyString(url, timestamp, a1);
            const payload = encryptAesCbc(key);
            const [xs, xt] = generateNewXyw(payload, timestamp);
            return [xs, xt.toString()];
        }
        // 获取子评论的函数
        const fetchSubComments = async (commentId, cursor = '') => {

          const url = `/api/sns/web/v2/comment/sub/page?note_id=${noteId}&root_comment_id=${commentId}&num=10&cursor=${cursor}&image_formats=jpg,webp,avif&top_comment_id=&xsec_token=${xsecToken}`;
          
          
          try {
            const [xs, xt] = getXs(url, a1Value);  
            
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
      args: [noteId, xsecToken, a1Value]
    });

    console.log('评论获取脚本执行完成');
    return result[0].result;
  } catch (error) {
    console.error('获取评论失败:', error);
    throw error;
  }
}

// 格式化时间戳
function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).replace(/\//g, '-');
}

// 在现有的消息监听器中添加新的处理
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
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
  if (message.type === 'processAndDownloadExcel') {
    try{
      // 注入 CryptoJS
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: [
          'src/lib/exceljs.min.js'
        ]
      });
      // 处理数据
      const workbook = await processExcelData(message.responses, message.needProcess);
      console.log('Excel处理完成',workbook);
      // 生成文件名
      const fileName = `note_list_${new Date().toISOString().split('T')[0]}.xlsx`;
      console.log('文件名:', fileName);
      // 转换为 buffer 并下载
      const buffer = await workbook.data.xlsx.writeBuffer();
      console.log('Buffer生成完成',buffer);
      const blob = new Blob([buffer], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });

      // 转换为 base64
      const reader = new FileReader();
      
      reader.onload = async function(e) {
        try {
          await chrome.downloads.download({
            url: e.target.result,
            filename: fileName,
            saveAs: true
          });
          sendResponse({ success: true });
        } catch (error) {
          console.error("Download failed:", error);
          sendResponse({ success: false, error: error.message });
        }
      };
      reader.onerror = function(error) {
        console.error("FileReader failed:", error);
        sendResponse({ success: false, error: error.message });
      };
      reader.readAsDataURL(blob);
      sendResponse({ success: true });
    }
    catch (error) {
      console.error('Excel处理失败:', error);
      sendResponse({ success: false, error: error.message });
    }
    return true;
  }

  if (message.type === 'getProgress') {
    sendResponse({ message: currentProgress });
    return true;
  }
});

// 从popu.js移过来的处理数据的函数
async function processExcelData(responses, needProcess = false) {
  // 修改默认配置的获取方式
  const { captureConfig } = await chrome.storage.local.get('captureConfig');
  const defaultConfig = {
    noteDetailBatchSize: 5,
    noteDetailBatchDelay: 2000  // 默认延迟2秒
  };
  
  // 使用解构赋值并设置默认值
  const { 
    noteDetailBatchSize = defaultConfig.noteDetailBatchSize,
    noteDetailBatchDelay = defaultConfig.noteDetailBatchDelay 
  } = captureConfig || defaultConfig;

  // 创建工作簿和工作表
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('笔记数据');
  const validDataSheet = workbook.addWorksheet('有效数据');

  // 设置列
  // 修改列定义
  const columns = [
    { header: '笔记ID', key: 'noteId', width: 28 },
    { header: '笔记链接', key: 'noteUrl', width: 28 },
    { header: '笔记标题', key: 'title', width: 28 },
    { header: '笔记描述', key: 'desc', width: 28 },
    { header: '笔记标签', key: 'tags', width: 28 },
    { header: '笔记类型', key: 'type', width: 15 },
    { header: '博主昵称', key: 'author', width: 15 },
    { header: '粉丝数', key: 'fans', width: 15 },
    { header: '笔记发布日期', key: 'date', width: 15 },
    { header: '笔记状态', key: 'status', width: 15 },
    { header: '热度值', key: 'heat', width: 15 },
    { header: '赞藏量', key: 'likes', width: 15 },
    { header: '评论量', key: 'comments', width: 15 },
    { header: '近30天Top10热点词', key: 'hotWords', width: 15 },
    { header: '关键词表达', key: 'keywords', width: 15 },
    { header: '榜单类型', key: 'listType', width: 15 },
    { header: '宝马MINI相关度', key: 'relevanceScore', width: 15 },
    { header: '是否相关', key: 'isRelevant', width: 15 },
    { header: '分析原因', key: 'reason', width: 30 },
    { header: '已投流项目名称', key: 'projectName', width: 30 },
    { header: '评论总数', key: 'commentCount', width: 15 },
    { header: '相关评论', key: 'relevantComments', width: 40 },
    { header: '评论相关度', key: 'commentScores', width: 15 },
    { header: '评论分析原因', key: 'commentReasons', width: 30 }
  ];
  
  worksheet.columns = columns;
  validDataSheet.columns = columns;

  const noteListTypes = new Map();
  const allNotes = [];
  const noteOccurrences = new Map();
  const firstOccurrence = new Map();

  // 处理数据
  responses.forEach((response, responseIndex) => {
    try {
      const data = JSON.parse(response.responseBody);
      const requestBody = JSON.parse(response.requestBody);
      const listType = requestBody.list_type;
      const hotWords = requestBody.hot_words || [];
      const keywords = requestBody.keywords || [];

      if (data?.data?.note_list) {
        data.data.note_list.forEach(note => {
          const noteId = note.note_info.note_id;
          
          if (needProcess) {
            if (!noteListTypes.has(noteId)) {
              noteListTypes.set(noteId, new Set());
              noteOccurrences.set(noteId, { 1: 0, 2: 0 });
              firstOccurrence.set(noteId, { 1: -1, 2: -1 });
            }
            
            const occurrences = noteOccurrences.get(noteId);
            occurrences[listType]++;
            
            const isFirstInCurrentList = firstOccurrence.get(noteId)[listType] === -1;
            if (isFirstInCurrentList) {
              firstOccurrence.get(noteId)[listType] = responseIndex;
            }
            
            noteListTypes.get(noteId).add(listType);
            
            allNotes.push({
              note,
              listType,
              listTypeName: listType === 1 ? '热度榜' : listType === 2 ? '黑马榜' : '未知',
              hotWords,
              keywords,
              isFirst: isFirstInCurrentList,
              responseIndex  // 添加响应索引
            });
          } else {
            // 修改非处理模式下的数据添加
            if (!needProcess) {
              worksheet.addRow({
                noteId: note.note_info.note_id,
                noteUrl: `https://www.xiaohongshu.com/explore/${noteId}?xsec_token=${note.note_info.xsec_token}&xsec_source=pc_ad`,
                title: note.note_info.note_title || '',
                desc: '',
                tags: '',
                type: note.note_info.note_type === 1 ? '图文笔记' : '视频笔记',
                author: note.author_info.author_name,
                fans: note.author_info.fans_count,
                date: formatTimestamp(note.note_create_time),
                status: note.note_status === 1 ? '公开' : note.note_status,
                heat: note.heat_value || '0',
                likes: note.interact || '0',
                comments: note.comment || '0',
                hotWords: hotWords.join('、'),
                keywords: keywords.join('、'),
                listType: listType === 1 ? '热度榜' : listType === 2 ? '黑马榜' : '未知',
                projectName: ''  
              });
            }
          }
        });
      }
    } catch (error) {
      console.error('处理响应数据时出错:', error);
    }
  });

  if (needProcess) {
    // 按笔记ID排序
    allNotes.sort((a, b) => a.note.note_info.note_id.localeCompare(b.note.note_info.note_id));

    const backgroundColors = [
      'FFE6FFE6', 'FFFFE6E6', 'FFE6E6FF', 'FFFFF0E6', 'FFE6FFFF', 'FFFFE6FF'
    ];

    const noteColors = new Map();
    let lastColor = null;

    // 修改颜色分配逻辑
    noteListTypes.forEach((types, noteId) => {
      if (types.size > 1) {
        // 找到一个与上一个颜色不同的颜色
        let nextColor;
        do {
          nextColor = backgroundColors[Math.floor(Math.random() * backgroundColors.length)];
        } while (nextColor === lastColor && backgroundColors.length > 1);
        
        noteColors.set(noteId, nextColor);
        lastColor = nextColor;
      }
    });

    // 添加数据到主工作表
    allNotes.forEach(({note, listTypeName, hotWords, keywords}) => {
      worksheet.addRow({
        noteId: note.note_info.note_id,
        noteUrl: `https://www.xiaohongshu.com/explore/${note.note_info.note_id}?xsec_token=${note.note_info.xsec_token}&xsec_source=pc_ad`,
        title: note.note_info.note_title || '',
        desc: '',
        tags: '',
        type: note.note_info.note_type === 1 ? '图文笔记' : '视频笔记',
        author: note.author_info.author_name,
        fans: note.author_info.fans_count,
        date: formatTimestamp(note.note_create_time),
        status: note.note_status === 1 ? '公开' : note.note_status,
        heat: note.heat_value || '0',
        likes: note.interact || '0',
        comments: note.comment || '0',
        hotWords: hotWords.join('、'),
        keywords: keywords.join('、'),
        listType: listTypeName
      });
    });

    // 设置主工作表样式
    worksheet.eachRow((row, rowNumber) => {
      row.height = 25;
      
      row.eachCell((cell) => {
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: false };
        cell.font = { name: 'Arial', size: 11 };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD3D3D3' } },
          left: { style: 'thin', color: { argb: 'FFD3D3D3' } },
          bottom: { style: 'thin', color: { argb: 'FFD3D3D3' } },
          right: { style: 'thin', color: { argb: 'FFD3D3D3' } }
        };
      });

      if (rowNumber === 1) {
        row.font = { bold: true };
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE0E0E0' }
        };
      } else {
        const noteId = row.getCell('noteId').value;
        const noteTitle = row.getCell('title').value;
        
        // 标题包含二手或五菱的行添加灰色背景
        if (noteTitle && (noteTitle.includes('二手') || noteTitle.includes('五菱'))) {
          row.getCell('title').font = { 
            name: 'Arial', 
            size: 11, 
            color: { argb: 'FFFF0000' } 
          };
          row.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF0F0F0' }
          };
        }
        
        // 非首次出现的行添加删除线和灰色背景
        if (!allNotes[rowNumber - 2].isFirst) {
          row.eachCell((cell) => {
            cell.font = {
              name: 'Arial',
              size: 11,
              color: { argb: '99999999' },
              strike: true
            };
          });
          row.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF0F0F0' }
          };
        }
        
        const backgroundColor = noteColors.get(noteId);
        if (backgroundColor) {
          row.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: backgroundColor }
          };
        }
      }
    });

    // 添加有效数据到第二个表
    const batchDelay = captureConfig.noteDetailBatchDelay;
    // 修改有效数据筛选逻辑
    // 添加获取项目信息的函数
    async function getProjectName(noteId) {
      let projectName = '无';  // 默认值改为"无"
      try {
        // const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const [tab] = await chrome.tabs.query({ 
          url: "https://ad.xiaohongshu.com/microapp/kbt/*",
          status: "complete"
        });
        console.log(`开始获取笔记 ${noteId} 的项目信息...`);
        

        const projectResult = await fetchProjectInfo(noteId, tab);
      
        
        console.log('项目信息接口返回:', projectResult);
        
        if (projectResult.success && projectResult.data.data && 
            projectResult.data.data.list && projectResult.data.data.list.length > 0) {
          projectName = projectResult.data.data.list
            .map(item => item.projectInfo.projectName)
            .join('、');
        }
      } catch (error) {
        console.error('获取项目信息失败:', error);
      }
      return projectName;
    }
    
    // 修改有效数据筛选逻辑
    const validNotesWithProjects = await Promise.all(
      allNotes.map(async ({note, listType, isFirst, hotWords, keywords}) => {
        const noteId = note.note_info.note_id;
        const noteTitle = note.note_info.note_title || '';
        const types = noteListTypes.get(noteId);
        
        const projectName = await getProjectName(noteId);
        
        // 修改筛选条件：
        // 1. 标题不包含"二手"和"五菱"
        // 2. 如果只出现在一个榜单，直接使用
        // 3. 如果同时出现在两个榜单且项目名称为"无"，则取热度榜的数据
        const isValid = !(noteTitle.includes('二手') || noteTitle.includes('五菱')) && 
               ((types.size === 1) || 
                (types.size > 1 && listType === 1 && isFirst && projectName === '无'));
        
        if (isValid) {
          console.log('有效笔记:', {
            noteId,
            title: noteTitle,
            listType,
            isFirst,
            typesSize: types.size,
            inMultipleLists: types.size > 1,
            hasProject: projectName
          });
          return {note, listType, isFirst, hotWords, keywords, projectName};  // 返回完整的数据
        }
        return null;
      })
    );
    
    const validNotes = validNotesWithProjects.filter(Boolean);
    
    console.log('筛选出的有效数据数量:', validNotes.length);

    // 确保批处理大小有效
    const effectiveBatchSize = Math.max(1, captureConfig.noteDetailBatchSize || 5);
    

    // 声明收集所有有效结果的数组
    let allValidResults = [];

    // 分批处理有效数据
    for (let i = 0; i < validNotes.length; i += effectiveBatchSize) {
      try {
        const batch = validNotes.slice(i, i + effectiveBatchSize);
        const currentBatch = Math.floor(i/effectiveBatchSize) + 1;
        const totalBatches = Math.ceil(validNotes.length/effectiveBatchSize);
        
        // 更新进度显示
        await notifyProgress(`处理第 ${currentBatch}/${totalBatches} 批数据，当前批次 ${batch.length} 条`);
        
        console.log(`处理第 ${currentBatch}/${totalBatches} 批数据，当前批次 ${batch.length} 条`);
        
        
        // 并发处理每一批数据
        // 添加笔记详情获取函数
        async function getNoteDetail(noteUrl, tab) {
          try {
            const delay = Math.floor(Math.random() * 2000) + 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
            
            // 获取当前域名的所有 cookies
            // const cookies = await chrome.cookies.getAll({
            //   domain: '.xiaohongshu.com'
            // });
            
            const headers = {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
              'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
              // 'Cookie': cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ')
            };

            const response = await fetch(noteUrl, { headers });
            
            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const html = await response.text();
            
            // 提取笔记描述和标签
            const descMatches = html.matchAll(/<div[^>]*id="detail-desc"[^>]*>.*?<span[^>]*class="note-text"[^>]*>.*?<\/span><\/div>/gs);
            // 检查 RegExpStringIterator 是否有匹配结果
            const firstMatch = descMatches.next();
            console.log('是否有匹配结果:', descMatches, firstMatch.done);

            if (html.includes('你访问的页面不见了')) {
              console.log('页面不存在，跳过处理:', noteUrl);
              return {
                desc: '',
                tags: '',
                isRelevant: false,
                relevanceScore: 0,
                reason: '页面不存在'
              };
            }

            if (firstMatch.done) {
              const errorMsg = `<span style="color: red">爬虫获取数据失败，请确认笔记链接可以正确在浏览器访问，并且页面加载完整</span> <a href="${noteUrl}" target="_blank">${noteUrl}</a>`;
              await notifyProgress(errorMsg);
              // 终止整个 processExcelData 函数的执行
              throw new Error('PROCESS_TERMINATED');  // 抛出特定错误
            }

            const descTexts = Array.from(firstMatch.value[0].matchAll(/<span>([^<]+)<\/span>/g), match => match[1].trim());
            const desc = descTexts.join('').replace(/\s+/g, '');
            
            
            // 提取所有标签
            const tagMatches = html.matchAll(/<a[^>]*id="hash-tag"[^>]*>(.*?)<\/a>/g);
            const tags = Array.from(tagMatches, match => match[1]).join('、');
            console.log('提取到的笔记描述:', desc);
            console.log('提取到的笔记标签:', tags);

    
            // 只有当成功获取到描述或标签时才进行AI分析
            if (desc || tags) {
              const aiAnalysisResult = await analyzeContent(desc, tags);
              console.log('AI分析结果:', aiAnalysisResult);
              return {
                desc: desc,
                tags: tags || '',
                isRelevant: aiAnalysisResult.isRelevant,
                relevanceScore: aiAnalysisResult.score,
                reason: aiAnalysisResult.reason  // 确保传递 reason
              };
            }
            
            // 如果没有获取到描述和标签，只返回基本信息
            return {
              desc: desc,
              tags: tags || ''
            };
            
          } catch (error) {
            if (error.message === 'PROCESS_TERMINATED') {
              // 重新抛出错误以终止整个函数执行
              throw error;
            }
            console.error('获取笔记详情失败:', error);
            return { 
              desc: '', 
              tags: ''
            };
          }
        }
        
        // 在 batchResults 的处理部分进行修改
        // 在处理批次数据时修改评论相关度的处理逻辑
        const batchResults = await Promise.all(
          batch.map(async ({note, listTypeName, hotWords, keywords, projectName}) => {
            try {
              const noteUrl = `https://www.xiaohongshu.com/explore/${note.note_info.note_id}?xsec_token=${note.note_info.xsec_token}&xsec_source=pc_ad`;
              // 获取当前标签页
                // const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                const [tab] = await chrome.tabs.query({
                  url: "https://www.xiaohongshu.com/*",
                  status: "complete"
                });

                if (!tab) {
                  console.error('未找到小红书标签页');
                  return baseData;
                }
              // 获取笔记详情
              const detail = await getNoteDetail(noteUrl, tab);
              console.log('笔记详情:', detail);
              const baseData = {
                noteId: note.note_info.note_id,
                noteUrl: noteUrl,
                title: note.note_info.note_title || '',
                desc: detail.desc,
                tags: detail.tags,
                type: note.note_info.note_type === 1 ? '图文笔记' : '视频笔记',
                author: note.author_info.author_name,
                fans: note.author_info.fans_count,
                date: formatTimestamp(note.note_create_time),
                status: note.note_status === 1 ? '公开' : note.note_status,
                heat: note.heat_value || '0',
                likes: note.interact || '0',
                comments: note.comment || '0',
                hotWords: hotWords.join('、'),
                keywords: keywords.join('、'),
                listType: listTypeName,
                isRelevant: detail.isRelevant ? '相关' : '不相关',
                relevanceScore: detail.relevanceScore,
                reason: detail.reason || '',
                projectName: projectName,
                commentCount: 0,
                relevantComments: '',
                commentScores: '0',  // 默认设置为"0"
                commentReasons: ''
              };
              console.log('笔记基本数据:', baseData);
              // 只对相关且没有项目的笔记进行评论分析
              // if (detail.isRelevant && projectName === '无' && parseInt(note.comment) > 0) {
              //   console.log(`开始获取评论: ${note.note_info.note_id}`);

                // 通过 background.js 获取评论
                // console.log(`开始获取评论数据，笔记ID: ${note.note_info.note_id}`);
                // const commentResponse = await fetchAllComments(note.note_info.note_id, note.note_info.xsec_token, tab);
                
                // console.log('获取到的评论数据:', note.note_info.note_id, commentResponse);
        
                // if (commentResponse.length > 0) {
                //   // 分析评论
                //   console.log(`正在分析评论: ${note.note_info.note_id}`);
                //   // 由于现在 analyzeComments 返回的是整体分析结果
                  
                //   const result = await analyzeComments(commentResponse); // 获取整体分析结果
                //   console.log('评论分析结果:', note.note_info.note_id,result);
                //   // 添加评论分析结果
                //   baseData.commentCount = result.commentCount;
                //   baseData.relevantComments = result.content;
                //   baseData.commentScores = result.analysis.score;
                //   baseData.commentReasons = result.analysis.reason;
                    
                //   console.log(`正在处理笔记: ${baseData.noteId}, 描述长度: ${baseData.desc.length}, 
                //       标签数量: ${baseData.tags.split('、').length}, 相关性分数: ${baseData.relevanceScore}, 
                //       评论数量: ${baseData.commentCount}`);
                  
                // } else {
                //   console.error(`获取评论失败: ${commentResponse}, ${note.note_info.note_id}`);
                // }
              // } else {
              //   console.log(`跳过评论分析: ${note.note_info.note_id}`);
              // }
        
              return baseData;
            } catch (error) {
              if (error.message === 'PROCESS_TERMINATED') {
                throw error;  // 重新抛出终止错误
              }
              console.error('处理笔记失败:', error);
              return null;
            }
          })
        );

        // 添加这批数据到工作表
        // 收集这批数据
        const validResults = batchResults.filter(Boolean);
        allValidResults = allValidResults.concat(validResults);
        console.log(`当前批次成功处理 ${validResults.length} 条数据`);

        if (i + effectiveBatchSize < validNotes.length) {
          console.log(`等待 ${noteDetailBatchDelay}ms 后处理下一批数据...`);
          await new Promise(resolve => setTimeout(resolve, noteDetailBatchDelay));
        }
        
    } catch (error) {
      if (error.message === 'PROCESS_TERMINATED') {
        console.log('检测到终止信号，停止所有处理');
        break;  // 直接返回当前的 workbook
      }
      throw error;  // 其他错误继续向上传播
    }
  }
  

    // 所有数据收集完成后，进行整体排序
    allValidResults.sort((a, b) => {
      const scoreA = a.relevanceScore || 0;
      const scoreB = b.relevanceScore || 0;
      return scoreB - scoreA;  // 降序排序
    });

    // 将排序后的数据添加到表格
    allValidResults.forEach(result => {
      validDataSheet.addRow(result);
      
      // 更新主工作表中对应的行
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1 && row.getCell('noteId').value === result.noteId) {
          row.getCell('desc').value = result.desc;
          row.getCell('tags').value = result.tags;
        }
      });
      
      console.log(`成功添加笔记: ${result.noteId}`);
    });

    // 设置有效数据表样式
    validDataSheet.eachRow((row, rowNumber) => {
      row.height = 25;
      row.eachCell((cell) => {
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: false };
        cell.font = { name: 'Arial', size: 11 };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD3D3D3' } },
          left: { style: 'thin', color: { argb: 'FFD3D3D3' } },
          bottom: { style: 'thin', color: { argb: 'FFD3D3D3' } },
          right: { style: 'thin', color: { argb: 'FFD3D3D3' } }
        };
      });

      if (rowNumber === 1) {
        row.font = { bold: true };
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE0E0E0' }
        };
      } else {
        // 获取当前行的数据
        const isRelevant = row.getCell('isRelevant').value === '相关';
        const relevanceScore = row.getCell('relevanceScore').value;
        const projectName = row.getCell('projectName').value;
        
        // 如果与MINI不相关或者有项目名称（不为"无"），添加灰色背景和红色文字
        if (!isRelevant || (projectName && projectName !== '无')) {
          // 添加灰色背景
          row.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF0F0F0' }
          };
          
          // 设置相关单元格为红色文字
          ['isRelevant', 'projectName'].forEach(cellKey => {
            row.getCell(cellKey).font = {
              name: 'Arial',
              size: 11,
              color: { argb: 'FFFF0000' }
            };
          });
        }
      }
    });
  }

  return { success: true, data: workbook };
} // 这里是processExcelData函数的结束括号

async function notifyProgress(message) {
  try {
    // 保存最新进度
    currentProgress = message;
    chrome.runtime.sendMessage({
      type: 'processProgress',
      message: message
    }).catch(error => {
      // 忽略接收端不存在的错误
      if (!error.message.includes('Receiving end does not exist')) {
        console.error('发送进度消息失败:', error);
      }
    });
    // 总是在控制台记录进度
    console.log('进度更新:', message);
  } catch (error) {
    console.error('发送通知失败:', error);
  }
}

// 添加AI分析函数
async function analyzeContent(content, tags, type = 'note') {
  try {
    let prompt = '';
    if (type === 'note') {
      prompt = `分析内容是否与宝马MINI相关（车型、配置、使用体验、保养维护、改装等）。
仅返回如下格式的JSON，reason限制50字内：
{"isRelevant":布尔值,"relevanceScore":0到1的数值,"reason":"原因"}

标签：${tags}
描述：${content}`;
    } else if (type === 'comment') {
      prompt = `分析此评论是否表明该笔记适合投放宝马MINI广告。考虑以下因素：
1. 评论者对车辆的了解程度和兴趣
2. 评论的正面性和专业度
3. 评论内容的影响力和传播价值
4. 是否能带动品牌曝光

仅返回如下格式的JSON，reason限制50字内：
{"isRelevant":布尔值,"relevanceScore":0到1的数值,"reason":"原因"}

评论内容：${content}`;
    }

    const options = {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer sk-dpxngruqnxjukqdixlzhkfflihpmipqtvlxhdmogdcinpeeh',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "Qwen/QwQ-32B",
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        stream: false,
        max_tokens: 1024,
        temperature: 0.3,
        top_p: 0.7,
        top_k: 50,
        frequency_penalty: 0.5,
        n: 1,
        response_format: {
          type: "text"
        }
      })
    };

    const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', options);
    const result = await response.json();
    
    try {
      let content = result.choices[0].message.content.trim();
      console.log( type, '原始结果:', content);
    
      // 尝试修复不完整的 JSON
      if (content.startsWith('```json')) {
        content = content.replace(/```json\s*/, '').replace(/```\s*$/, '');
      }
      
      // 检查并修复不完整的 JSON
      if (!content.endsWith('}')) {
        const lastBrace = content.lastIndexOf('}');
        if (lastBrace !== -1) {
          // 只有在确实找不到完整的 JSON 时才进行截断
          const beforeBrace = content.substring(0, lastBrace + 1);
          try {
            // 尝试解析截断前的内容
            JSON.parse(beforeBrace);
            content = beforeBrace;
          } catch (e) {
            // 如果解析失败，保留原始内容
            console.log(type, '保留原始响应内容');
          }
        }
      }

      console.log(type, '处理后的 AI 响应:', content);
      
      const analysis = JSON.parse(content);
      return {
        isRelevant: analysis.isRelevant,
        score: analysis.relevanceScore,
        reason: analysis.reason || ''
      };
    } catch (parseError) {
      console.error(type, '解析AI响应失败:', parseError);
      console.log(type, 'AI原始响应:', result.choices[0].message.content);
      return {
        isRelevant: false,
        score: 0,
        reason: '解析失败'
      };
    }
  } catch (error) {
    console.error(type, 'AI分析失败:', error);
    return {
      isRelevant: false,
      score: 0,
      reason: '分析失败'
    };
  }
}

 
  // 添加评论分析函数
  async function analyzeComments(comments) {
    console.log('开始分析评论:', comments);
    if (!comments || !Array.isArray(comments)) {
      console.error('评论数据格式错误:', comments);
      return {
        comment: '评论分析失败',
        content: '',
        analysis: {
          isRelevant: false,
          score: 0,
          reason: '无有效评论数据'
        },
        commentCount: 0
      };
    }
  
    try {
      // 合并所有评论内容
      const combinedContent = comments.map(comment => {
        return `${comment.text}\n`;
      }).join('');
  
      // 对合并后的评论整体进行分析
      const result = await analyzeContent(combinedContent, '', 'comment');
  
      // 返回整体分析结果
      return {
        comment: '评论整体分析',
        content: combinedContent,
        analysis: result,
        commentCount: comments.length
      };
    } catch (error) {
      console.error('评论分析失败:', error);
      return {};
    }
  }
    