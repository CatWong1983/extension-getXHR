document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const timestamp = urlParams.get('timestamp');

  if (!timestamp) {
    showError('未找到请求数据');
    return;
  }

  const { responses = [] } = await chrome.storage.local.get('responses');
  const response = responses.find(r => r.timestamp === parseInt(timestamp));

  if (!response) {
    showError('未找到对应的响应数据');
    return;
  }

  // 显示请求信息
  document.getElementById('requestUrl').textContent = response.url;
  document.getElementById('requestMethod').textContent = response.method;
  document.getElementById('requestType').textContent = response.type;
  document.getElementById('timestamp').textContent = new Date(response.timestamp).toLocaleString();

  // 初始化视图模式切换
  const viewMode = document.getElementById('viewMode');
  viewMode.addEventListener('change', () => updateView(response.responseBody));
  
  // 复制按钮
  document.getElementById('copyBtn').addEventListener('click', () => {
    const content = document.getElementById('responseContent').textContent;
    navigator.clipboard.writeText(content)
      .then(() => showMessage('已复制到剪贴板'))
      .catch(err => showError('复制失败：' + err.message));
  });

  // 下载按钮
  document.getElementById('downloadBtn').addEventListener('click', () => {
    const blob = new Blob([response.responseBody], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `response-${timestamp}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // 初始显示响应内容
  updateView(response.responseBody);
});

function updateView(responseBody) {
  const viewMode = document.getElementById('viewMode').value;
  const responseContent = document.getElementById('responseContent');
  const previewContent = document.getElementById('previewContent');

  responseContent.style.display = 'none';
  previewContent.style.display = 'none';

  try {
    switch (viewMode) {
      case 'formatted':
        responseContent.style.display = 'block';
        try {
          // 尝试格式化 JSON
          const parsed = JSON.parse(responseBody);
          responseContent.textContent = JSON.stringify(parsed, null, 2);
        } catch {
          // 如果不是 JSON，直接显示文本
          responseContent.textContent = responseBody;
        }
        break;

      case 'raw':
        responseContent.style.display = 'block';
        responseContent.textContent = responseBody;
        break;

      case 'preview':
        previewContent.style.display = 'block';
        // 尝试检测内容类型并预览
        if (isImageData(responseBody)) {
          const img = document.createElement('img');
          img.src = URL.createObjectURL(new Blob([responseBody]));
          previewContent.innerHTML = '';
          previewContent.appendChild(img);
        } else if (isHTMLContent(responseBody)) {
          previewContent.innerHTML = responseBody;
        } else {
          previewContent.innerHTML = '<p>无法预览此类型的内容</p>';
        }
        break;
    }
  } catch (error) {
    showError('显示内容时出错：' + error.message);
  }
}

function isImageData(data) {
  // 简单检查是否为图片数据
  const signature = new Uint8Array(data.slice(0, 4));
  const signatures = {
    jpeg: [0xFF, 0xD8, 0xFF],
    png: [0x89, 0x50, 0x4E, 0x47],
    gif: [0x47, 0x49, 0x46, 0x38]
  };

  return Object.values(signatures).some(sig =>
    sig.every((byte, i) => signature[i] === byte)
  );
}

function isHTMLContent(content) {
  return typeof content === 'string' && 
         content.trim().toLowerCase().startsWith('<!doctype html') ||
         content.trim().toLowerCase().startsWith('<html');
}

function showMessage(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
}

function showError(message) {
  const content = document.getElementById('responseContent');
  content.textContent = `错误：${message}`;
  content.style.color = 'red';
}