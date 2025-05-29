// 弹出页面脚本
let savedWords = [];
let savedWordsData = new Map(); // 存储单词详细信息
let currentHighlightColor = '#ffeb3b'; // 默认高亮颜色

// 存储键名
const STORAGE_KEYS = {
  SAVED_WORDS: 'savedWords',
  SAVED_WORDS_DATA: 'savedWordsData', // 新增
  DATA_VERSION: 'dataVersion',
  BACKUP_DATA: 'backupData',
  LAST_BACKUP: 'lastBackup',
  HIGHLIGHT_COLOR: 'highlightColor',
  TRANSLATION_CACHE: 'translationCache'
};

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', async () => {
  await loadSavedWords();
  await loadSavedWordsData();
  await loadHighlightColor();
  updateUI();
  setupEventListeners();
  setupColorSettings();
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

// 加载单词详细数据
async function loadSavedWordsData() {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEYS.SAVED_WORDS_DATA]);
    const rawData = result[STORAGE_KEYS.SAVED_WORDS_DATA] || [];
    
    // 如果是数组格式，转换为Map
    if (Array.isArray(rawData)) {
      savedWordsData = new Map(rawData);
    } else {
      savedWordsData = new Map();
    }
    
    console.log('弹出页面加载单词详细数据:', savedWordsData.size, '个');
  } catch (error) {
    console.error('加载单词详细数据失败:', error);
    savedWordsData = new Map();
  }
}

// 加载高亮颜色
async function loadHighlightColor() {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEYS.HIGHLIGHT_COLOR]);
    currentHighlightColor = result[STORAGE_KEYS.HIGHLIGHT_COLOR] || '#ffeb3b';
    console.log('弹出页面加载高亮颜色:', currentHighlightColor);
  } catch (error) {
    console.error('加载高亮颜色失败:', error);
    currentHighlightColor = '#ffeb3b';
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
  
  // 计算今日新增单词数量
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const todayEnd = todayStart + 24 * 60 * 60 * 1000; // 今天结束时间
  
  let todayCount = 0;
  
  // 如果savedWordsData是Map类型
  if (savedWordsData instanceof Map) {
    for (const [word, data] of savedWordsData) {
      if (data.addedTime >= todayStart && data.addedTime < todayEnd) {
        todayCount++;
      }
    }
  } else if (Array.isArray(savedWordsData)) {
    // 如果是数组格式（从存储中加载的格式）
    savedWordsData.forEach(([word, data]) => {
      if (data.addedTime >= todayStart && data.addedTime < todayEnd) {
        todayCount++;
      }
    });
  }
  
  todayWordsElement.textContent = todayCount.toString();
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
    // 获取所有数据，包括翻译缓存和单词详细数据
    const allData = await chrome.storage.local.get([
      STORAGE_KEYS.SAVED_WORDS,
      STORAGE_KEYS.SAVED_WORDS_DATA,
      STORAGE_KEYS.TRANSLATION_CACHE,
      STORAGE_KEYS.HIGHLIGHT_COLOR
    ]);
    
    const data = {
      words: savedWords,
      wordsData: allData[STORAGE_KEYS.SAVED_WORDS_DATA] || [], // 单词详细数据
      translationCache: allData[STORAGE_KEYS.TRANSLATION_CACHE] || [],
      highlightColor: allData[STORAGE_KEYS.HIGHLIGHT_COLOR] || '#ffeb3b',
      version: '1.5.1',
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
    
    console.log('数据导出成功:', savedWords.length, '个单词，', (allData[STORAGE_KEYS.TRANSLATION_CACHE] || []).length, '个翻译缓存');
    
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
    
    // 准备要保存的数据
    const dataToSave = {
      [STORAGE_KEYS.SAVED_WORDS]: mergedWords
    };
    
    // 导入单词详细数据
    if (data.wordsData && Array.isArray(data.wordsData)) {
      dataToSave[STORAGE_KEYS.SAVED_WORDS_DATA] = data.wordsData;
      // 更新本地Map
      savedWordsData = new Map(data.wordsData);
    }
    
    // 导入翻译缓存
    if (data.translationCache && Array.isArray(data.translationCache)) {
      dataToSave[STORAGE_KEYS.TRANSLATION_CACHE] = data.translationCache;
    }
    
    // 导入高亮颜色
    if (data.highlightColor) {
      dataToSave[STORAGE_KEYS.HIGHLIGHT_COLOR] = data.highlightColor;
      currentHighlightColor = data.highlightColor;
    }
    
    await chrome.storage.local.set(dataToSave);
    
    savedWords = mergedWords;
    updateUI();
    updateColorSelection(); // 更新颜色选择状态
    
    const importedCount = importedWords.length;
    const cacheCount = data.translationCache ? data.translationCache.length : 0;
    console.log('数据导入成功:', importedCount, '个新单词，', cacheCount, '个翻译缓存');
    
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
  const messageElement = document.createElement('div');
  messageElement.className = `message message-${type}`;
  messageElement.textContent = message;
  
  // 添加样式
  messageElement.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    border-radius: 6px;
    color: white;
    font-weight: 500;
    z-index: 10000;
    animation: slideIn 0.3s ease;
  `;
  
  // 根据类型设置背景色
  switch (type) {
    case 'success':
      messageElement.style.backgroundColor = '#28a745';
      break;
    case 'error':
      messageElement.style.backgroundColor = '#dc3545';
      break;
    default:
      messageElement.style.backgroundColor = '#17a2b8';
  }
  
  // 添加到页面
  document.body.appendChild(messageElement);
  
  // 3秒后自动移除
  setTimeout(() => {
    if (messageElement.parentNode) {
      messageElement.remove();
    }
  }, 3000);
}

// 将deleteWord函数暴露到全局作用域
window.deleteWord = deleteWord;

// 设置颜色选择功能
function setupColorSettings() {
  const colorOptions = document.querySelectorAll('.color-option');
  const customColorInput = document.getElementById('customColor');
  
  // 初始化颜色选择状态
  updateColorSelection();
  
  // 预设颜色选择事件
  colorOptions.forEach(option => {
    option.addEventListener('click', async () => {
      const color = option.dataset.color;
      await setHighlightColor(color);
      updateColorSelection();
    });
  });
  
  // 自定义颜色选择事件
  customColorInput.addEventListener('change', async (e) => {
    const color = e.target.value;
    await setHighlightColor(color);
    updateColorSelection();
  });
}

// 设置高亮颜色
async function setHighlightColor(color) {
  try {
    currentHighlightColor = color;
    await chrome.storage.local.set({
      [STORAGE_KEYS.HIGHLIGHT_COLOR]: color
    });
    
    // 通知内容脚本更新颜色
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, {
        type: 'updateHighlightColor',
        color: color
      }).catch(() => {
        // 忽略错误，可能是页面还没有加载内容脚本
      });
    }
    
    console.log('高亮颜色设置成功:', color);
    showMessage('高亮颜色已更新', 'success');
  } catch (error) {
    console.error('设置高亮颜色失败:', error);
    showMessage('设置颜色失败，请重试', 'error');
  }
}

// 更新颜色选择状态
function updateColorSelection() {
  const colorOptions = document.querySelectorAll('.color-option');
  const customColorInput = document.getElementById('customColor');
  
  // 更新自定义颜色输入框的值
  customColorInput.value = currentHighlightColor;
  
  // 更新预设颜色选择状态
  colorOptions.forEach(option => {
    option.classList.remove('active');
    if (option.dataset.color === currentHighlightColor) {
      option.classList.add('active');
    }
  });
  
  // 如果当前颜色不在预设中，清除所有预设的选中状态
  const isPresetColor = Array.from(colorOptions).some(option => 
    option.dataset.color === currentHighlightColor
  );
  
  if (!isPresetColor) {
    colorOptions.forEach(option => option.classList.remove('active'));
  }
} 