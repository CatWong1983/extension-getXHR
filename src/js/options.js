document.addEventListener('DOMContentLoaded', async () => {
  // 加载已保存的配置
  const { captureConfig = {
    urlPatterns: [],
    requestTypes: [],
    httpMethods: [],
    maxCaptures: 100
  } } = await chrome.storage.local.get('captureConfig');

  console.log('加载的配置:', captureConfig);  // 添加配置日志

  // 初始化 HTTP 方法选择
  const httpMethods = ['GET', 'POST', 'PUT', 'DELETE'];
  httpMethods.forEach(method => {
    const checkbox = document.getElementById(`method${method}`);
    if (!checkbox) {
      console.error(`找不到 ${method} 方法的复选框`);
      return;
    }
    checkbox.checked = captureConfig.httpMethods.includes(method);
    console.log(`设置 ${method} 状态:`, checkbox.checked);
  });

  // 初始化请求类型选择
  const requestTypes = ['xhr', 'script', 'image', 'stylesheet'];
  requestTypes.forEach(type => {
    const checkbox = document.getElementById(`type${type.charAt(0).toUpperCase() + type.slice(1)}`);
    if (!checkbox) {
      console.error(`找不到 ${type} 类型的复选框`);
      return;
    }
    checkbox.checked = captureConfig.requestTypes.includes(type);
    console.log(`设置 ${type} 状态:`, checkbox.checked);
  });

  // 初始化 URL 匹配规则列表
  const urlPatternList = document.getElementById('urlPatternList');
  const renderUrlPatterns = () => {
    urlPatternList.innerHTML = '';
    captureConfig.urlPatterns.forEach((pattern, index) => {
      const div = document.createElement('div');
      div.className = 'pattern-item';
      const span = document.createElement('span');
      span.textContent = pattern;
      const button = document.createElement('button');
      button.textContent = '删除';
      button.addEventListener('click', () => {
        captureConfig.urlPatterns.splice(index, 1);
        renderUrlPatterns();
      });
      div.appendChild(span);
      div.appendChild(button);
      urlPatternList.appendChild(div);
    });
  };
  renderUrlPatterns();

  // 添加 URL 匹配规则
  const urlPatternInput = document.getElementById('urlPattern');
  document.getElementById('addUrlPattern').addEventListener('click', () => {
    const pattern = urlPatternInput.value.trim();
    if (pattern) {
      captureConfig.urlPatterns.push(pattern);
      urlPatternInput.value = '';
      renderUrlPatterns();
    }
  });

  // URL 输入框回车事件
  urlPatternInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const pattern = urlPatternInput.value.trim();
      if (pattern) {
        captureConfig.urlPatterns.push(pattern);
        urlPatternInput.value = '';
        renderUrlPatterns();
      }
    }
  });

  // 初始化最大捕获数量
  const maxCapturesInput = document.getElementById('maxCaptures');
  if (maxCapturesInput) {
    maxCapturesInput.value = captureConfig.maxCaptures;
  }

  // 保存配置
  document.getElementById('saveConfig').addEventListener('click', async () => {
    // 收集 HTTP 方法
    captureConfig.httpMethods = httpMethods
      .filter(method => document.getElementById(`method${method}`).checked)
      .map(method => method.toUpperCase());  // 确保方法名大写

    // 收集请求类型
    captureConfig.requestTypes = requestTypes
      .filter(type => document.getElementById(`type${type.charAt(0).toUpperCase() + type.slice(1)}`).checked)
      .map(type => type.toLowerCase());  // 确保类型名小写

    console.log('保存的配置:', captureConfig);  // 添加保存日志

    // 保存到存储
    await chrome.storage.local.set({ captureConfig });
    showMessage('设置已保存');
  });
});

// 显示消息提示
function showMessage(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}