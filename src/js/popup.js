document.addEventListener('DOMContentLoaded', async () => {
  const captureToggle = document.getElementById('captureToggle');
  const requestContainer = document.getElementById('requestContainer');
  const clearBtn = document.getElementById('clearBtn');
  const exportBtn = document.getElementById('exportBtn');
  const exportExcelBtn = document.getElementById('exportExcelBtn');
  const settingsBtn = document.getElementById('settingsBtn');

  // 初始化开关状态
  const { isCapturing = false } = await chrome.storage.local.get('isCapturing');
  captureToggle.checked = isCapturing;

  // 加载并显示已捕获的请求
  await loadRequests();

  // 监听开关变化
  captureToggle.addEventListener('change', async (e) => {
    const newState = e.target.checked;
    
    try {
      // 先发送消息给后台并等待响应
      const response = await chrome.runtime.sendMessage({ 
        type: 'toggleCapture', 
        value: newState 
      });
      
      if (response && response.success) {
        if (newState) {
          // 开启捕获时清空容器和存储
          requestContainer.innerHTML = '<div class="empty-message">开始新的捕获...</div>';
          await chrome.storage.local.set({ responses: [] });
        }
        // 更新存储状态
        await chrome.storage.local.set({ isCapturing: newState });
      }
    } catch (error) {
      console.error('切换捕获状态失败:', error);
      // 恢复开关状态
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

  // 导出Excel
  exportExcelBtn.addEventListener('click', async () => {
    try {
      const { responses = [] } = await chrome.storage.local.get('responses');
      console.log('获取到响应数据:', responses.length, '条');
      
      // 创建工作簿和工作表
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('笔记数据');
      const validDataSheet = workbook.addWorksheet('有效数据');

      // 设置列（两个工作表使用相同的列设置）
      const columns = [
        { header: '笔记ID', key: 'noteId' },
        { header: '笔记链接', key: 'noteUrl' },
        { header: '笔记标题', key: 'title' },
        { header: '笔记类型', key: 'type' },
        { header: '博主昵称', key: 'author' },
        { header: '粉丝数', key: 'fans' },
        { header: '笔记发布日期', key: 'date' },
        { header: '笔记状态', key: 'status' },
        { header: '热度值', key: 'heat' },
        { header: '赞藏量', key: 'likes' },
        { header: '评论量', key: 'comments' },
        { header: '近30天Top10热点词', key: 'hotWords' },
        { header: '关键词表达', key: 'keywords' },
        { header: '榜单类型', key: 'listType' }
      ];
      
      worksheet.columns = columns;
      validDataSheet.columns = columns;

      // 统计笔记在不同榜单中的出现情况
      const noteListTypes = new Map(); // 记录每个笔记出现在哪些榜单中
      const allNotes = []; // 用于存储所有笔记数据
      const noteOccurrences = new Map(); // 记录每个笔记在每个榜单中的出现次数
      const firstOccurrence = new Map(); // 记录每个笔记在每个榜单中第一次出现的索引

      // 第一次遍历：收集所有笔记数据并统计榜单出现情况
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
              if (!noteListTypes.has(noteId)) {
                noteListTypes.set(noteId, new Set());
                noteOccurrences.set(noteId, { 1: 0, 2: 0 }); // 初始化计数
                firstOccurrence.set(noteId, { 1: -1, 2: -1 }); // 初始化第一次出现的索引
              }
              
              const occurrences = noteOccurrences.get(noteId);
              occurrences[listType]++; // 增加计数
              
              // 只有在当前榜单第一次出现时才标记为第一次
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
                isFirst: isFirstInCurrentList // 只有真正第一次出现的才标记为 true
              });
            });
          }
        } catch (error) {
          console.error('处理响应数据时出错:', error);
        }
      });

      // 按笔记ID排序
      allNotes.sort((a, b) => a.note.note_info.note_id.localeCompare(b.note.note_info.note_id));

      // 添加排序后的数据
      allNotes.forEach(({note, listTypeName, hotWords, keywords}) => {
        const noteId = note.note_info.note_id;
        const noteTitle = note.note_info.note_title || '';
        const noteUrl = `https://www.xiaohongshu.com/explore/${noteId}?xsec_token=${note.note_info.xsec_token}&xsec_source=pc_ad`;
        
        worksheet.addRow({
          noteId,
          noteUrl,
          title: noteTitle,
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

      // 定义一组背景色
      const backgroundColors = [
        'FFE6FFE6', // 淡绿色
        'FFFFE6E6', // 淡红色
        'FFE6E6FF', // 淡蓝色
        'FFFFF0E6', // 淡橙色
        'FFE6FFFF', // 淡青色
        'FFFFE6FF'  // 淡紫色
      ];

      // 为重复笔记分配颜色
      const noteColors = new Map();
      let currentColorIndex = 0;

      noteListTypes.forEach((types, noteId) => {
        if (types.size > 1) {
          noteColors.set(noteId, backgroundColors[currentColorIndex % backgroundColors.length]);
          currentColorIndex++;
        }
      });

      // 设置样式
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
          const listType = row.getCell('listType').value === '热度榜' ? 1 : 2;
          
          // 设置包含"二手车"的单元格字体颜色
          if (noteTitle && noteTitle.includes('二手车')) {
            row.getCell('title').font = { 
              name: 'Arial', 
              size: 11, 
              color: { argb: 'FFFF0000' } 
            };
            
            // 如果是二手车且没有在其他榜单重复出现
            if (!noteColors.has(noteId)) {
              row.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFE0E0E0' } // 改为深灰色背景
              };
            }
          }
          
          // 设置重复笔记的样式（非第一次出现）
          if (!allNotes[rowNumber - 2].isFirst) {
            row.eachCell((cell) => {
              cell.font = {
                name: 'Arial',
                size: 11,
                color: { argb: '99999999' }, // 灰色
                strike: true // 删除线
              };
            });
            
            // 如果没有彩色背景，则添加深灰色背景
            if (!noteColors.has(noteId)) {
              row.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFE0E0E0' } // 深灰色背景
              };
            }
          }
          
          // 设置重复笔记的背景色
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

      // 根据内容自动调整列宽
      worksheet.columns.forEach((column, index) => {
        if (index < 3) {
          column.width = 30; // 前三列固定宽度为30
        } else {
          column.width = 15; // 其余列固定宽度为15
        }
      });

      // 移除 FILTER 函数相关代码，直接使用下面的数据添加方式
      
      // 添加有效数据到第二个表（没有跨榜单重复且是第一次出现的数据，排除二手车）
      allNotes.forEach(({note, listTypeName, hotWords, keywords, isFirst}) => {
        const noteId = note.note_info.note_id;
        const noteTitle = note.note_info.note_title || '';
        // 只添加没有跨榜单重复、是第一次出现且不是二手车的数据
        if (isFirst && !noteColors.has(noteId) && !noteTitle.includes('二手车')) {
          validDataSheet.addRow({
            noteId,
            noteUrl: `https://www.xiaohongshu.com/explore/${noteId}?xsec_token=${note.note_info.xsec_token}&xsec_source=pc_ad`,
            title: noteTitle,
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
        }
      });

      // 设置有效数据表的样式
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

      // 设置有效数据表的列宽
      validDataSheet.columns.forEach((column, index) => {
        if (index < 3) {
          column.width = 30;
        } else {
          column.width = 15;
        }
      });

      // 导出文件
      const fileName = `note_list_${new Date().toISOString().split('T')[0]}.xlsx`;
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      
      // 创建下载链接
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      
      // 清理
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
