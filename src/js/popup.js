document.addEventListener('DOMContentLoaded', async () => {
  const captureToggle = document.getElementById('captureToggle');
  const requestContainer = document.getElementById('requestContainer');
  const clearBtn = document.getElementById('clearBtn');
  const exportBtn = document.getElementById('exportBtn');
  const processDataBtn = document.getElementById('processDataBtn');
  const exportExcelBtn = document.getElementById('exportExcelBtn');
  const settingsBtn = document.getElementById('settingsBtn');

  // 用于存储处理后的数据
  let processedWorkbook = null;

  // 初始化开关状态
  const { isCapturing = false } = await chrome.storage.local.get('isCapturing');
  captureToggle.checked = isCapturing;

  // 加载并显示已捕获的请求
  await loadRequests();

  // 监听开关变化
  captureToggle.addEventListener('change', async (e) => {
    const newState = e.target.checked;
    
    try {
      const response = await chrome.runtime.sendMessage({ 
        type: 'toggleCapture', 
        value: newState 
      });
      
      if (response && response.success) {
        if (newState) {
          requestContainer.innerHTML = '<div class="empty-message">开始新的捕获...</div>';
          await chrome.storage.local.set({ responses: [] });
        }
        await chrome.storage.local.set({ isCapturing: newState });
      }
    } catch (error) {
      console.error('切换捕获状态失败:', error);
      captureToggle.checked = !newState;
    }
  });

  // 清除所有数据
  clearBtn.addEventListener('click', async () => {
    if (confirm('确定要清除所有捕获的请求吗？')) {
      await chrome.storage.local.set({ responses: [] });
      await loadRequests();
    }
  });

  // 导出JSON数据
  exportBtn.addEventListener('click', async () => {
    try {
      const { responses = [] } = await chrome.storage.local.get('responses');
      const blob = new Blob([JSON.stringify(responses, null, 2)], {
        type: 'application/json'
      });
      const url = URL.createObjectURL(blob);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      
      await chrome.downloads.download({
        url: url,
        filename: `captured-responses-${timestamp}.json`,
        saveAs: true
      });
      
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('导出失败:', error);
      alert('导出失败: ' + error.message);
    }
  });

  // 处理数据
  processDataBtn.addEventListener('click', async () => {
    try {
      const { responses = [] } = await chrome.storage.local.get('responses');
      if (responses.length === 0) {
        alert('没有可处理的数据');
        return;
      }

      console.log('开始处理数据:', responses.length, '条');
      processedWorkbook = await processExcelData(responses, true);
      alert('数据处理完成，可以点击导出Excel按钮导出文件');

    } catch (error) {
      console.error('数据处理失败:', error);
      alert('数据处理失败: ' + error.message);
    }
  });

  // 导出Excel
  exportExcelBtn.addEventListener('click', async () => {
    try {
      const { responses = [] } = await chrome.storage.local.get('responses');
      if (responses.length === 0) {
        alert('没有可导出的数据');
        return;
      }

      const workbook = processedWorkbook || await processExcelData(responses, false);
      const fileName = `note_list_${new Date().toISOString().split('T')[0]}.xlsx`;
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
      }, 0);

    } catch (error) {
      console.error('导出失败:', error);
      alert('导出失败: ' + error.message);
    }
  });

  // 打开设置页面
  settingsBtn.addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL('src/html/options.html'));
    }
  });

  // 监听存储变化，实时更新列表
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.responses) {
      loadRequests();
    }
  });
});

// 加载请求列表
async function loadRequests() {
  const { responses = [] } = await chrome.storage.local.get('responses');
  const requestContainer = document.getElementById('requestContainer');
  requestContainer.innerHTML = '';

  if (responses.length === 0) {
    requestContainer.innerHTML = '<div class="empty-message">暂无捕获的请求</div>';
    return;
  }

  const totalCount = document.createElement('div');
  totalCount.className = 'total-count';
  totalCount.innerHTML = `共计 ${responses.length} 条请求数据`;
  requestContainer.appendChild(totalCount);

  responses.reverse().forEach((response, index) => {
    const item = document.createElement('div');
    item.className = 'request-item';
    
    const time = new Date(response.timestamp).toLocaleString();
    
    item.innerHTML = `
      <span>#${responses.length - index}</span>
      <span>${time}</span>
      <span class="url-cell" title="${response.url}">${response.url}</span>
      <span>${response.type || 'unknown'}</span>
      <span>
        <button class="view-btn">查看</button>
      </span>
    `;
    
    const viewBtn = item.querySelector('.view-btn');
    viewBtn.addEventListener('click', () => {
      chrome.windows.create({
        url: chrome.runtime.getURL(`src/html/response-viewer.html?timestamp=${response.timestamp}`),
        type: 'popup',
        width: 800,
        height: 600
      });
    });
    
    requestContainer.appendChild(item);
  });
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

// 处理Excel数据
async function processExcelData(responses, needProcess = false) {
  const { captureConfig = { noteDetailBatchSize: 5, noteDetailBatchDelay: 1000 } } = 
    await chrome.storage.local.get('captureConfig');

  // 创建工作簿和工作表
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('笔记数据');
  const validDataSheet = workbook.addWorksheet('有效数据');

  // 设置列
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
    { header: '榜单类型', key: 'listType', width: 15 }
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
              listType: listType === 1 ? '热度榜' : listType === 2 ? '黑马榜' : '未知'
            });
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
        
        // 标题包含二手或五菱宏光的行添加灰色背景
        if (noteTitle && (noteTitle.includes('二手') || noteTitle.includes('五菱宏光'))) {
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
    const validNotes = allNotes.filter(({note, listType, isFirst, responseIndex}) => {
      const noteId = note.note_info.note_id;
      const noteTitle = note.note_info.note_title || '';
      const types = noteListTypes.get(noteId);
      
      // 检查条件：
      // 1. 是该类型榜单中的第一次出现
      // 2. 不是跨榜单出现的笔记（types.size === 1）
      // 3. 标题不同时包含"二手"和"五菱宏光"
      const isValid = isFirst && 
             types.size === 1 && 
             !(noteTitle.includes('二手') || noteTitle.includes('五菱宏光'));
      
      if (isValid) {
        console.log('有效笔记:', {
          noteId,
          title: noteTitle,
          listType,
          isFirst,
          typesSize: types.size
        });
      }
      
      return isValid;
    });

    console.log('筛选出的有效数据数量:', validNotes.length);

    // 确保批处理大小有效
    const effectiveBatchSize = Math.max(1, captureConfig.noteDetailBatchSize || 5);
    // 在开始处理数据前显示进度容器
    const progressContainer = document.getElementById('progress-container');
    const progressText = progressContainer.querySelector('.progress-text');
    progressContainer.style.display = 'block';

    // 分批处理有效数据
    for (let i = 0; i < validNotes.length; i += effectiveBatchSize) {
      const batch = validNotes.slice(i, i + effectiveBatchSize);
      const currentBatch = Math.floor(i/effectiveBatchSize) + 1;
      const totalBatches = Math.ceil(validNotes.length/effectiveBatchSize);
      
      // 更新进度显示
      progressText.textContent = `处理第 ${currentBatch}/${totalBatches} 批数据，当前批次 ${batch.length} 条`;
      
      console.log(`处理第 ${currentBatch}/${totalBatches} 批数据，当前批次 ${batch.length} 条`);
      
      // 并发处理每一批数据
      // 添加笔记详情获取函数
      async function getNoteDetail(noteUrl) {
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
          
          // 提取笔记描述
          const descMatches = html.matchAll(/<span[^>]*class="note-text"[^>]*>.*?<span>(.*?)<\/span>.*?<\/span>/gs);
          const descTexts = Array.from(descMatches, match => match[1].trim());
          const desc = descTexts.join('').replace(/\s+/g, '');
          
          // 提取所有标签
          const tagMatches = html.matchAll(/<a[^>]*id="hash-tag"[^>]*>(.*?)<\/a>/g);
          const tags = Array.from(tagMatches, match => match[1]).join('、');
          
          return {
            desc: desc,
            tags: tags || ''
          };
        } catch (error) {
          console.error('获取笔记详情失败:', error);
          return { desc: '', tags: '' };
        }
      }
      
      // 在处理批次数据时修改调用方式
      const batchResults = await Promise.all(
        batch.map(async ({note, listTypeName, hotWords, keywords}) => {
          try {
            const noteUrl = `https://www.xiaohongshu.com/explore/${note.note_info.note_id}?xsec_token=${note.note_info.xsec_token}&xsec_source=pc_ad`;
            
            // 获取笔记详情
            const detail = await getNoteDetail(noteUrl);
            
            const baseData = {
              noteId: note.note_info.note_id,
              noteUrl: noteUrl,
              title: note.note_info.note_title || '',
              desc: detail.desc,  // 使用获取到的描述
              tags: detail.tags,  // 使用获取到的标签
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
            };

            console.log(`正在处理笔记: ${baseData.noteId}, 描述长度: ${baseData.desc.length}, 标签数量: ${baseData.tags.split('、').length}`);
            return baseData;
          } catch (error) {
            console.error('处理笔记失败:', error);
            return null;
          }
        })
      );

      // 添加这批数据到工作表
      const validResults = batchResults.filter(Boolean);
      console.log(`当前批次成功处理 ${validResults.length} 条数据`);
      
      validResults.forEach(result => {
        // 添加到有效数据表
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

      // 修复这里：使用 effectiveBatchSize 替代 batchSize
      if (i + effectiveBatchSize < validNotes.length) {
        console.log(`等待 ${batchDelay}ms 后处理下一批数据...`);
        await new Promise(resolve => setTimeout(resolve, batchDelay));
      }
    }

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
      }
    });
  }

  return workbook;
}