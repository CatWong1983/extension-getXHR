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
    await chrome.storage.local.set({ isCapturing: newState });
    
    if (newState) {
      // 开启捕获时清空容器和存储
      requestContainer.innerHTML = '<div class="empty-message">开始新的捕获...</div>';
      await chrome.storage.local.set({ responses: [] });
    }
    
    chrome.runtime.sendMessage({ 
      type: 'toggleCapture', 
      value: newState 
    });
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
      
      // 创建 Excel 数据
      const excelData = [
        ['笔记ID', '笔记链接', '笔记标题', '笔记类型', '博主昵称', '粉丝数', '笔记发布日期', '笔记状态', '热度值', '赞藏量', '评论量']
      ];

      // 处理所有响应数据
      responses.forEach(response => {
        const data = JSON.parse(response.responseBody);
        if (data && data.data && data.data.note_list) {
          data.data.note_list.forEach(note => {
            const noteUrl = `https://www.xiaohongshu.com/explore/${note.note_info.note_id}?xsec_token=${note.note_info.xsec_token}&xsec_source=pc_ad`;
            const row = [
              note.note_info.note_id,
              noteUrl,
              note.note_info.note_title,
              note.note_info.note_type === 1 ? '图文笔记' : '视频笔记',
              note.author_info.author_name,
              note.author_info.fans_count,
              formatTimestamp(note.note_create_time),
              note.note_status === 1 ? '公开' : note.note_status,
              note.heat_value || '0',
              note.interact || '0',
              note.comment || '0'
            ];
            excelData.push(row);
          });
        }
      });

      // 创建工作表
      const ws = XLSX.utils.aoa_to_sheet(excelData);

      // 设置列宽
      const colWidths = [20, 60, 40, 10, 20, 10, 20, 10, 10, 10, 10];
      ws['!cols'] = colWidths.map(width => ({ width }));

      // 创建工作簿
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '笔记数据');

      // 导出文件
      const fileName = `note_list_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
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

  responses.reverse().forEach(response => {
    const item = document.createElement('div');
    item.className = 'request-item';
    
    const time = new Date(response.timestamp).toLocaleString();
    
    item.innerHTML = `
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