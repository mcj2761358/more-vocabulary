// 弹出页面脚本
let savedWords = [];

// 存储键名
const STORAGE_KEYS = {
  SAVED_WORDS: 'savedWords',
  DATA_VERSION: 'dataVersion',
  BACKUP_DATA: 'backupData',
  LAST_BACKUP: 'lastBackup'
};

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', async () => {
  await loadSavedWords();
  updateUI();
  setupEventListeners();
});

// 加载已保存的单词
async function loadSavedWords() {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEYS.SAVED_WORDS]);
    savedWords = result[STORAGE_KEYS.SAVED_WORDS] || [];
    console.log('弹出页面加载单词:', savedWords.length, '个');
  } catch (error) {
    console.error('加载保存的单词失败:', error);
    savedWords = [];
  }
}

// 更新UI
function updateUI() {
  updateStats();
  updateWordsList();
  updateActionButtons();
}

// 更新统计信息
function updateStats() {
  const totalWordsElement = document.getElementById('totalWords');
  const todayWordsElement = document.getElementById('todayWords');
  
  totalWordsElement.textContent = savedWords.length;
  
  // 简化版本：今日新增设为0，实际应用中可以记录时间戳
  todayWordsElement.textContent = '0';
}

// 更新单词列表
function updateWordsList() {
  const wordsListElement = document.getElementById('wordsList');
  
  if (savedWords.length === 0) {
    wordsListElement.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📖</div>
        <p>还没有收藏任何单词</p>
        <p>选中网页上的英文单词开始学习吧！</p>
      </div>
    `;
    return;
  }
  
  const wordsHTML = savedWords.map(word => `
    <div class="word-item" data-word="${word}">
      <span class="word-text">${word}</span>
      <button class="delete-btn" onclick="deleteWord('${word}')">删除</button>
    </div>
  `).join('');
  
  wordsListElement.innerHTML = wordsHTML;
}

// 更新操作按钮状态
function updateActionButtons() {
  const clearAllBtn = document.getElementById('clearAllBtn');
  const exportBtn = document.getElementById('exportBtn');
  
  clearAllBtn.disabled = savedWords.length === 0;
  exportBtn.disabled = savedWords.length === 0;
}

// 设置事件监听器
function setupEventListeners() {
  const clearAllBtn = document.getElementById('clearAllBtn');
  const exportBtn = document.getElementById('exportBtn');
  const importBtn = document.getElementById('importBtn');
  const fileInput = document.getElementById('fileInput');
  
  clearAllBtn.addEventListener('click', clearAllWords);
  exportBtn.addEventListener('click', exportData);
  importBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', handleFileImport);
  
  // 监听存储变化
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes[STORAGE_KEYS.SAVED_WORDS]) {
      savedWords = changes[STORAGE_KEYS.SAVED_WORDS].newValue || [];
      updateUI();
    }
  });
}

// 删除单个单词
async function deleteWord(word) {
  try {
    const updatedWords = savedWords.filter(w => w !== word);
    await chrome.storage.local.set({ 
      [STORAGE_KEYS.SAVED_WORDS]: updatedWords 
    });
    savedWords = updatedWords;
    updateUI();
    console.log('删除单词成功:', word);
  } catch (error) {
    console.error('删除单词失败:', error);
    alert('删除单词失败，请重试');
  }
}

// 清空所有单词
async function clearAllWords() {
  if (confirm('确定要清空所有收藏的单词吗？此操作不可撤销。')) {
    try {
      await chrome.storage.local.set({ 
        [STORAGE_KEYS.SAVED_WORDS]: [] 
      });
      savedWords = [];
      updateUI();
      console.log('清空所有单词成功');
    } catch (error) {
      console.error('清空单词失败:', error);
      alert('清空单词失败，请重试');
    }
  }
}

// 导出数据
async function exportData() {
  try {
    const data = {
      words: savedWords,
      version: '1.1.0',
      exportTime: new Date().toISOString(),
      count: savedWords.length,
      appName: '多多记单词'
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    // 创建下载链接
    const a = document.createElement('a');
    a.href = url;
    a.download = `多多记单词_备份_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log('数据导出成功:', savedWords.length, '个单词');
    
    // 显示成功提示
    showMessage('数据导出成功！', 'success');
  } catch (error) {
    console.error('数据导出失败:', error);
    showMessage('数据导出失败，请重试', 'error');
  }
}

// 处理文件导入
async function handleFileImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    
    if (!data.words || !Array.isArray(data.words)) {
      throw new Error('无效的数据格式');
    }
    
    // 合并现有数据和导入数据
    const importedWords = data.words.filter(word => typeof word === 'string');
    const mergedWords = [...new Set([...savedWords, ...importedWords])];
    
    await chrome.storage.local.set({ 
      [STORAGE_KEYS.SAVED_WORDS]: mergedWords 
    });
    
    savedWords = mergedWords;
    updateUI();
    
    const importedCount = mergedWords.length - savedWords.length + importedWords.length;
    console.log('数据导入成功:', importedCount, '个新单词');
    
    showMessage(`数据导入成功！新增 ${importedCount} 个单词`, 'success');
  } catch (error) {
    console.error('数据导入失败:', error);
    showMessage('数据导入失败，请检查文件格式', 'error');
  }
  
  // 清空文件输入
  event.target.value = '';
}

// 显示消息提示
function showMessage(message, type = 'info') {
  // 创建消息元素
  const messageEl = document.createElement('div');
  messageEl.className = `message message-${type}`;
  messageEl.textContent = message;
  messageEl.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    padding: 10px 20px;
    border-radius: 6px;
    color: white;
    font-size: 14px;
    z-index: 10000;
    animation: slideDown 0.3s ease;
    background: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#17a2b8'};
  `;
  
  document.body.appendChild(messageEl);
  
  // 3秒后自动移除
  setTimeout(() => {
    if (messageEl.parentNode) {
      messageEl.remove();
    }
  }, 3000);
}

// 将deleteWord函数暴露到全局作用域
window.deleteWord = deleteWord; 