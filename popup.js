// 弹出页面脚本
let savedWords = [];
let savedWordsData = new Map(); // 存储单词详细信息
let knownWords = []; // 已认识的单词
let knownWordsData = new Map(); // 已认识单词的详细信息
let currentHighlightColor = '#ffeb3b'; // 默认高亮颜色

// 存储键名
const STORAGE_KEYS = {
  SAVED_WORDS: 'savedWords',
  SAVED_WORDS_DATA: 'savedWordsData', // 新增
  KNOWN_WORDS: 'knownWords', // 已认识的单词
  KNOWN_WORDS_DATA: 'knownWordsData', // 已认识单词的详细信息
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
  await loadKnownWords();
  await loadKnownWordsData();
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

// 加载已认识的单词
async function loadKnownWords() {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEYS.KNOWN_WORDS]);
    knownWords = result[STORAGE_KEYS.KNOWN_WORDS] || [];
    console.log('弹出页面加载已认识的单词:', knownWords.length, '个');
  } catch (error) {
    console.error('加载已认识的单词失败:', error);
    knownWords = [];
  }
}

// 加载已认识单词的详细数据
async function loadKnownWordsData() {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEYS.KNOWN_WORDS_DATA]);
    const rawData = result[STORAGE_KEYS.KNOWN_WORDS_DATA] || [];
    
    // 如果是数组格式，转换为Map
    if (Array.isArray(rawData)) {
      knownWordsData = new Map(rawData);
    } else {
      knownWordsData = new Map();
    }
    
    console.log('弹出页面加载已认识单词的详细数据:', knownWordsData.size, '个');
  } catch (error) {
    console.error('加载已认识单词的详细数据失败:', error);
    knownWordsData = new Map();
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
  updateKnownWordsCount();
  updateActionButtons();
}

// 更新统计信息
function updateStats() {
  const totalWordsElement = document.getElementById('totalWords');
  const todayWordsElement = document.getElementById('todayWords');
  const knownWordsElement = document.getElementById('knownWords');
  
  totalWordsElement.textContent = savedWords.length;
  knownWordsElement.textContent = knownWords.length;
  
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

// 更新已认识单词数量显示
function updateKnownWordsCount() {
  const knownWordsCountElement = document.getElementById('knownWordsCount');
  if (knownWordsCountElement) {
    knownWordsCountElement.textContent = knownWords.length;
  }
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
      <span class="word-text" data-word="${word}">${word}</span>
      <div class="word-actions">
        <button class="know-btn" data-word="${word}">认识</button>
        <button class="delete-btn" data-word="${word}">删除</button>
      </div>
    </div>
  `).join('');
  
  wordsListElement.innerHTML = wordsHTML;
  
  // 为单词文本添加鼠标悬停事件监听器
  const wordTexts = wordsListElement.querySelectorAll('.word-text');
  wordTexts.forEach(wordElement => {
    // 鼠标进入时显示详情
    wordElement.addEventListener('mouseenter', (e) => {
      const word = wordElement.getAttribute('data-word');
      if (word) {
        showWordDetails(word, wordElement);
      }
    });
    
    // 鼠标离开时延迟隐藏（给用户时间移动到提示框上）
    wordElement.addEventListener('mouseleave', (e) => {
      setTimeout(() => {
        // 检查鼠标是否在提示框上
        if (window.currentWordTooltip && !window.currentWordTooltip.hasAttribute('data-hover')) {
          removeWordTooltip();
        }
      }, 200); // 200ms延迟，给用户时间移动到提示框
    });
  });
  
  // 为删除按钮添加事件监听器
  const deleteButtons = wordsListElement.querySelectorAll('.delete-btn');
  console.log('找到删除按钮数量:', deleteButtons.length);
  
  deleteButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      console.log('删除按钮被点击');
      e.preventDefault();
      e.stopPropagation();
      const word = button.getAttribute('data-word');
      console.log('要删除的单词:', word);
      if (word) {
        deleteWord(word);
      } else {
        console.error('未找到要删除的单词');
      }
    });
  });

  // 为认识按钮添加事件监听器
  const knowButtons = wordsListElement.querySelectorAll('.know-btn');
  console.log('找到认识按钮数量:', knowButtons.length);
  
  knowButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      console.log('认识按钮被点击');
      e.preventDefault();
      e.stopPropagation();
      const word = button.getAttribute('data-word');
      console.log('要标记为认识的单词:', word);
      if (word) {
        markWordAsKnown(word);
      } else {
        console.error('未找到要标记为认识的单词');
      }
    });
  });
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
  const openKnownWordsBtn = document.getElementById('openKnownWordsBtn');
  
  clearAllBtn.addEventListener('click', clearAllWords);
  exportBtn.addEventListener('click', exportData);
  importBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', handleFileImport);
  
  // 打开已认识单词管理页面
  if (openKnownWordsBtn) {
    openKnownWordsBtn.addEventListener('click', openKnownWordsManager);
  }
  
  // 监听存储变化
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
      let shouldUpdate = false;
      
      if (changes[STORAGE_KEYS.SAVED_WORDS]) {
        savedWords = changes[STORAGE_KEYS.SAVED_WORDS].newValue || [];
        shouldUpdate = true;
      }
      
      if (changes[STORAGE_KEYS.SAVED_WORDS_DATA]) {
        const rawData = changes[STORAGE_KEYS.SAVED_WORDS_DATA].newValue || [];
        savedWordsData = new Map(rawData);
        shouldUpdate = true;
      }
      
      if (changes[STORAGE_KEYS.KNOWN_WORDS]) {
        knownWords = changes[STORAGE_KEYS.KNOWN_WORDS].newValue || [];
        shouldUpdate = true;
      }
      
      if (changes[STORAGE_KEYS.KNOWN_WORDS_DATA]) {
        const rawData = changes[STORAGE_KEYS.KNOWN_WORDS_DATA].newValue || [];
        knownWordsData = new Map(rawData);
        shouldUpdate = true;
      }
      
      if (shouldUpdate) {
        updateUI();
      }
    }
  });
}

// 删除单个单词
async function deleteWord(word) {
  console.log('deleteWord函数被调用，单词:', word);
  
  try {
    const wordLower = word.toLowerCase();
    console.log('准备删除单词:', wordLower);
    
    // 从数组中移除单词
    const updatedWords = savedWords.filter(w => w.toLowerCase() !== wordLower);
    console.log('更新后的单词列表:', updatedWords);
    
    // 从详细数据Map中移除
    savedWordsData.delete(wordLower);
    
    // 获取当前所有存储数据
    const currentData = await chrome.storage.local.get([
      STORAGE_KEYS.SAVED_WORDS,
      STORAGE_KEYS.SAVED_WORDS_DATA,
      STORAGE_KEYS.TRANSLATION_CACHE
    ]);
    
    // 准备要保存的数据
    const dataToSave = {
      [STORAGE_KEYS.SAVED_WORDS]: updatedWords,
      [STORAGE_KEYS.SAVED_WORDS_DATA]: Array.from(savedWordsData.entries())
    };
    
    // 同时删除翻译缓存
    const cacheArray = currentData[STORAGE_KEYS.TRANSLATION_CACHE] || [];
    const updatedCache = cacheArray.filter(([key, value]) => key !== wordLower);
    dataToSave[STORAGE_KEYS.TRANSLATION_CACHE] = updatedCache;
    
    console.log('准备保存的数据:', dataToSave);
    
    // 保存到存储
    await chrome.storage.local.set(dataToSave);
    
    // 更新本地状态
    savedWords = updatedWords;
    
    // 通知所有标签页的content script更新
    try {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'wordDeleted',
          word: wordLower
        }).catch(() => {
          // 忽略错误，可能是页面没有加载content script
        });
      }
    } catch (error) {
      console.log('通知content script失败:', error);
    }
    
    updateUI();
    console.log('删除单词成功:', word);
    showMessage(`已删除单词: ${word}`, 'success');
  } catch (error) {
    console.error('删除单词失败:', error);
    showMessage('删除单词失败，请重试', 'error');
  }
}

// 将单词标记为已认识
async function markWordAsKnown(word) {
  console.log('markWordAsKnown函数被调用，单词:', word);
  
  try {
    const wordLower = word.toLowerCase();
    console.log('准备将单词标记为已认识:', wordLower);
    
    // 检查单词是否已经在已认识列表中
    if (knownWords.some(w => w.toLowerCase() === wordLower)) {
      showMessage('该单词已经在已认识列表中', 'info');
      return;
    }
    
    // 从收藏列表中获取单词的详细数据
    let wordData = null;
    if (savedWordsData.has(wordLower)) {
      wordData = savedWordsData.get(wordLower);
    }
    
    // 从收藏列表中移除单词
    const updatedSavedWords = savedWords.filter(w => w.toLowerCase() !== wordLower);
    savedWordsData.delete(wordLower);
    
    // 添加到已认识列表
    const updatedKnownWords = [...knownWords, word];
    
    // 如果有详细数据，添加到已认识单词的详细数据中，并标记认识时间
    if (wordData) {
      wordData.knownTime = Date.now(); // 添加认识时间
      knownWordsData.set(wordLower, wordData);
    } else {
      // 如果没有详细数据，创建基本数据
      knownWordsData.set(wordLower, {
        word: word,
        knownTime: Date.now(),
        addedTime: Date.now() // 如果没有原始添加时间，使用当前时间
      });
    }
    
    // 准备要保存的数据
    const dataToSave = {
      [STORAGE_KEYS.SAVED_WORDS]: updatedSavedWords,
      [STORAGE_KEYS.SAVED_WORDS_DATA]: Array.from(savedWordsData.entries()),
      [STORAGE_KEYS.KNOWN_WORDS]: updatedKnownWords,
      [STORAGE_KEYS.KNOWN_WORDS_DATA]: Array.from(knownWordsData.entries())
    };
    
    console.log('准备保存的数据:', dataToSave);
    
    // 保存到存储
    await chrome.storage.local.set(dataToSave);
    
    // 更新本地状态
    savedWords = updatedSavedWords;
    knownWords = updatedKnownWords;
    
    // 通知所有标签页的content script更新
    try {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'wordMarkedAsKnown',
          word: wordLower
        }).catch(() => {
          // 忽略错误，可能是页面没有加载content script
        });
      }
    } catch (error) {
      console.log('通知content script失败:', error);
    }
    
    updateUI();
    console.log('单词标记为已认识成功:', word);
    showMessage(`已将"${word}"标记为认识`, 'success');
  } catch (error) {
    console.error('标记单词为已认识失败:', error);
    showMessage('标记单词失败，请重试', 'error');
  }
}

// 清空所有单词
async function clearAllWords() {
  if (confirm('确定要清空所有收藏的单词吗？此操作不可撤销。')) {
    try {
      // 清空所有数据
      const dataToSave = {
        [STORAGE_KEYS.SAVED_WORDS]: [],
        [STORAGE_KEYS.SAVED_WORDS_DATA]: [],
        [STORAGE_KEYS.TRANSLATION_CACHE]: []
      };
      
      await chrome.storage.local.set(dataToSave);
      
      savedWords = [];
      savedWordsData = new Map();
      updateUI();
      console.log('清空所有单词成功');
      showMessage('已清空所有收藏的单词', 'success');
    } catch (error) {
      console.error('清空单词失败:', error);
      showMessage('清空单词失败，请重试', 'error');
    }
  }
}

// 打开已认识单词管理页面
function openKnownWordsManager() {
  try {
    // 创建新窗口显示已认识单词管理页面
    chrome.windows.create({
      url: chrome.runtime.getURL('known-words.html'),
      type: 'popup',
      width: 650,
      height: 750,
      focused: true
    });
  } catch (error) {
    console.error('打开已认识单词管理页面失败:', error);
    showMessage('打开管理页面失败，请重试', 'error');
  }
}

// 导出数据
async function exportData() {
  try {
    // 获取所有数据，包括翻译缓存和单词详细数据
    const allData = await chrome.storage.local.get([
      STORAGE_KEYS.SAVED_WORDS,
      STORAGE_KEYS.SAVED_WORDS_DATA,
      STORAGE_KEYS.KNOWN_WORDS,
      STORAGE_KEYS.KNOWN_WORDS_DATA,
      STORAGE_KEYS.TRANSLATION_CACHE,
      STORAGE_KEYS.HIGHLIGHT_COLOR
    ]);
    
    const data = {
      words: savedWords,
      wordsData: allData[STORAGE_KEYS.SAVED_WORDS_DATA] || [], // 单词详细数据
      knownWords: knownWords,
      knownWordsData: allData[STORAGE_KEYS.KNOWN_WORDS_DATA] || [], // 已认识单词详细数据
      translationCache: allData[STORAGE_KEYS.TRANSLATION_CACHE] || [],
      highlightColor: allData[STORAGE_KEYS.HIGHLIGHT_COLOR] || '#ffeb3b',
      version: '1.9.0',
      exportTime: new Date().toISOString(),
      count: savedWords.length,
      knownCount: knownWords.length,
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
    
    // 处理已认识单词数据
    let importedKnownWords = [];
    if (data.knownWords && Array.isArray(data.knownWords)) {
      importedKnownWords = data.knownWords.filter(word => typeof word === 'string');
    }
    const mergedKnownWords = [...new Set([...knownWords, ...importedKnownWords])];
    
    // 准备要保存的数据
    const dataToSave = {
      [STORAGE_KEYS.SAVED_WORDS]: mergedWords,
      [STORAGE_KEYS.KNOWN_WORDS]: mergedKnownWords
    };
    
    // 导入单词详细数据
    if (data.wordsData && Array.isArray(data.wordsData)) {
      dataToSave[STORAGE_KEYS.SAVED_WORDS_DATA] = data.wordsData;
      // 更新本地Map
      savedWordsData = new Map(data.wordsData);
    }
    
    // 导入已认识单词详细数据
    if (data.knownWordsData && Array.isArray(data.knownWordsData)) {
      dataToSave[STORAGE_KEYS.KNOWN_WORDS_DATA] = data.knownWordsData;
      // 更新本地Map
      knownWordsData = new Map(data.knownWordsData);
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
    knownWords = mergedKnownWords;
    updateUI();
    updateColorSelection(); // 更新颜色选择状态
    
    const importedCount = importedWords.length;
    const importedKnownCount = importedKnownWords.length;
    const cacheCount = data.translationCache ? data.translationCache.length : 0;
    console.log('数据导入成功:', importedCount, '个新单词，', importedKnownCount, '个已认识单词，', cacheCount, '个翻译缓存');
    
    let message = `数据导入成功！新增 ${importedCount} 个收藏单词`;
    if (importedKnownCount > 0) {
      message += `，${importedKnownCount} 个已认识单词`;
    }
    showMessage(message, 'success');
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

// 显示单词详细信息
async function showWordDetails(word, element) {
  try {
    const wordLower = word.toLowerCase();
    
    // 从保存的数据中获取翻译信息
    let translationData = null;
    if (savedWordsData.has(wordLower)) {
      const wordData = savedWordsData.get(wordLower);
      translationData = wordData.translationData;
    }
    
    // 如果没有翻译数据，尝试获取
    if (!translationData) {
      // 显示加载状态
      showWordTooltip(word, element, createLoadingContent(word));
      
      // 获取翻译数据
      translationData = await translateWord(word);
      
      // 更新保存的数据
      if (savedWordsData.has(wordLower)) {
        const wordData = savedWordsData.get(wordLower);
        wordData.translationData = translationData;
        await saveWordsDataToStorage();
      }
    }
    
    if (translationData) {
      const tooltipContent = createTranslationContent(word, translationData, true);
      showWordTooltip(word, element, tooltipContent);
    } else {
      showWordTooltip(word, element, createErrorContent(word));
    }
  } catch (error) {
    console.error('显示单词详情失败:', error);
    showWordTooltip(word, element, createErrorContent(word));
  }
}

// 显示单词提示框
function showWordTooltip(word, element, content) {
  // 移除现有的提示框
  removeWordTooltip();
  
  const tooltip = document.createElement('div');
  tooltip.className = 'lv-tooltip';
  tooltip.innerHTML = content;
  
  // 先添加到页面以获取尺寸
  tooltip.style.position = 'fixed';
  tooltip.style.visibility = 'hidden';
  document.body.appendChild(tooltip);
  
  // 获取元素和窗口尺寸
  const rect = element.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;
  
  // 计算最佳位置
  let left = rect.left;
  let top = rect.bottom + 5;
  
  // 水平位置调整
  if (left + tooltipRect.width > windowWidth - 20) {
    left = windowWidth - tooltipRect.width - 20;
  }
  if (left < 20) {
    left = 20;
  }
  
  // 垂直位置调整
  if (top + tooltipRect.height > windowHeight - 20) {
    // 如果下方空间不够，尝试放在上方
    const topPosition = rect.top - tooltipRect.height - 5;
    if (topPosition > 20) {
      top = topPosition;
    } else {
      // 如果上下都不够，放在屏幕中央并限制高度
      top = 20;
      tooltip.style.maxHeight = `${windowHeight - 40}px`;
    }
  }
  
  // 应用最终位置
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
  tooltip.style.visibility = 'visible';
  tooltip.style.zIndex = '10000';
  
  // 添加提示框的鼠标事件监听器
  tooltip.addEventListener('mouseenter', () => {
    // 鼠标进入提示框时，确保不会被隐藏
    tooltip.setAttribute('data-hover', 'true');
  });
  
  tooltip.addEventListener('mouseleave', () => {
    // 鼠标离开提示框时，延迟隐藏
    tooltip.removeAttribute('data-hover');
    setTimeout(() => {
      // 检查是否还在悬停状态
      if (!tooltip.hasAttribute('data-hover')) {
        removeWordTooltip();
      }
    }, 200);
  });
  
  // 添加事件监听器
  setupTooltipEventListeners(tooltip, word);
  
  // 保存引用
  window.currentWordTooltip = tooltip;
}

// 移除单词提示框
function removeWordTooltip() {
  if (window.currentWordTooltip) {
    window.currentWordTooltip.remove();
    window.currentWordTooltip = null;
  }
}

// 设置提示框事件监听器
function setupTooltipEventListeners(tooltip, word) {
  // 收藏按钮事件
  const favoriteBtn = tooltip.querySelector('.lv-favorite-btn');
  if (favoriteBtn) {
    favoriteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      // 在popup中，单词已经是收藏状态，点击应该是取消收藏
      await deleteWord(word);
      removeWordTooltip();
    });
  }
  
  // 发音按钮事件
  const pronunciationButtons = tooltip.querySelectorAll('.lv-pronunciation-btn');
  pronunciationButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const word = btn.dataset.word;
      const accent = btn.dataset.accent;
      
      // 添加点击效果
      btn.style.transform = 'scale(0.95)';
      setTimeout(() => {
        btn.style.transform = 'scale(1)';
      }, 150);
      
      playWordPronunciation(word, accent);
    });
  });
}

// 创建加载内容
function createLoadingContent(word) {
  return `
    <div class="lv-loading-content">
      <div class="lv-loading-spinner"></div>
      <div class="lv-loading-text">正在加载 "${word}" 的详细信息...</div>
    </div>
  `;
}

// 创建错误内容
function createErrorContent(word) {
  return `
    <div class="lv-error-content">
      <div class="lv-error-icon">❌</div>
      <div class="lv-error-text">无法加载 "${word}" 的详细信息</div>
    </div>
  `;
}

// 翻译单词 - 获取丰富的翻译结果，复用content.js的逻辑
async function translateWord(word) {
  try {
    const wordLower = word.toLowerCase();
    
    // 并行调用词典API
    const dictionaryResult = await Promise.allSettled([
      getDictionaryTranslation(word)
    ]);

    // 整合翻译结果
    const translations = [];
    
    // 优先尝试微软翻译
    let primaryTranslation = null;
    try {
      primaryTranslation = await getMicrosoftTranslation(word);
      if (primaryTranslation) {
        translations.push({
          type: 'translation',
          text: primaryTranslation,
          source: 'Microsoft'
        });
      }
    } catch (error) {
      console.log('微软翻译失败，尝试MyMemory:', error);
    }
    
    // 如果微软翻译失败，使用MyMemory作为备用
    if (!primaryTranslation) {
      try {
        const myMemoryResult = await getMyMemoryTranslation(word);
        if (myMemoryResult) {
          translations.push({
            type: 'translation',
            text: myMemoryResult,
            source: 'MyMemory'
          });
        }
      } catch (error) {
        console.log('MyMemory翻译也失败:', error);
      }
    }

    // 词典翻译结果
    if (dictionaryResult[0].status === 'fulfilled' && dictionaryResult[0].value) {
      translations.push(...dictionaryResult[0].value);
    }

    // 如果没有获取到任何翻译，使用备用方案
    if (translations.filter(t => t.type === 'translation').length === 0) {
      translations.push({
        type: 'translation',
        text: '翻译获取失败',
        source: 'Fallback'
      });
    }

    // 如果没有音标，添加默认音标
    if (!translations.find(t => t.type === 'phonetic')) {
      translations.push({
        type: 'phonetic',
        text: `/${word}/`
      });
    }

    const translationData = {
      word: word,
      translations: translations,
      hasMultiple: translations.length > 1,
      timestamp: Date.now()
    };

    return translationData;

  } catch (error) {
    console.error('翻译失败:', error);
    return {
      word: word,
      translations: [
        {
          type: 'translation',
          text: '翻译获取失败',
          source: 'Error'
        },
        {
          type: 'phonetic',
          text: `/${word}/`
        }
      ],
      hasMultiple: false,
      timestamp: Date.now()
    };
  }
}

// MyMemory翻译API
async function getMyMemoryTranslation(word) {
  try {
    const response = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|zh`
    );
    
    if (!response.ok) {
      throw new Error('MyMemory API请求失败');
    }
    
    const data = await response.json();
    
    if (data.responseStatus === 200 && data.responseData) {
      const mainTranslation = data.responseData.translatedText;
      const translations = [mainTranslation];
      
      // 尝试从matches中获取更多高质量翻译
      if (data.matches && Array.isArray(data.matches)) {
        const additionalTranslations = data.matches
          .filter(match => match.quality >= 80) // 只取高质量翻译
          .map(match => match.translation)
          .filter(translation => 
            translation && 
            translation.trim() && 
            translation !== mainTranslation &&
            translation.length < 20 // 避免过长的翻译
          )
          .slice(0, 2); // 最多取2个额外翻译
        
        translations.push(...additionalTranslations);
      }
      
      // 去重并返回
      const uniqueTranslations = [...new Set(translations)];
      return uniqueTranslations.length > 1 ? uniqueTranslations.join('，') : uniqueTranslations[0];
    }
    
    return null;
  } catch (error) {
    console.error('MyMemory翻译失败:', error);
    return null;
  }
}

// 免费词典API翻译
async function getDictionaryTranslation(word) {
  try {
    const response = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`
    );
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    const translations = [];
    
    if (Array.isArray(data) && data.length > 0) {
      const entry = data[0];
      
      // 处理音标
      if (entry.phonetics && entry.phonetics.length > 0) {
        const phonetic = entry.phonetics.find(p => p.text) || entry.phonetics[0];
        if (phonetic.text) {
          translations.push({
            type: 'phonetic',
            text: phonetic.text,
            audio: phonetic.audio || null
          });
        }
      }
      
      // 处理词义
      if (entry.meanings && entry.meanings.length > 0) {
        entry.meanings.forEach((meaning, index) => {
          if (index < 3) { // 限制显示前3个词性
            const partOfSpeech = meaning.partOfSpeech;
            
            meaning.definitions.forEach((def, defIndex) => {
              if (defIndex < 2) { // 每个词性最多显示2个定义
                translations.push({
                  type: 'definition',
                  partOfSpeech: partOfSpeech,
                  text: def.definition,
                  example: def.example || null,
                  synonyms: def.synonyms && def.synonyms.length > 0 ? def.synonyms.slice(0, 3) : null
                });
              }
            });
          }
        });
      }
    }
    
    return translations;
  } catch (error) {
    console.error('词典API调用失败:', error);
    return null;
  }
}

// 微软翻译API (简化版本，适用于popup)
async function getMicrosoftTranslation(word) {
  try {
    // 由于popup环境的限制，这里使用简化的翻译逻辑
    // 实际项目中可以根据需要调整
    return null; // 暂时返回null，让MyMemory作为主要翻译源
  } catch (error) {
    console.error('微软翻译失败:', error);
    return null;
  }
}

// 创建翻译内容HTML - 完全复用content.js的逻辑
function createTranslationContent(word, translationData, isSaved) {
  const favoriteIcon = isSaved ? '❤️' : '🤍';
  const favoriteText = isSaved ? '取消收藏' : '收藏';
  
  // 查找音标信息
  const phoneticItem = translationData.translations.find(t => t.type === 'phonetic');
  const phoneticText = phoneticItem ? phoneticItem.text : `/${word}/`;
  
  // 为美式和英式音标提供不同的显示（如果有的话）
  const usPhonetic = phoneticText;
  const ukPhonetic = phoneticText;
  
  let contentHTML = `
    <div class="lv-translation-content">
      <div class="lv-word-header">
        <div class="lv-word-title">
          <div class="lv-word">${word}</div>
          <button class="lv-favorite-btn" data-saved="${isSaved}">
            <span class="lv-favorite-icon">${favoriteIcon}</span>
            <span class="lv-favorite-text">${favoriteText}</span>
          </button>
        </div>
        
        <!-- 发音按钮区域 -->
        <div class="lv-pronunciation-section">
          <div class="lv-pronunciation-row">
            <span class="lv-pronunciation-phonetic">🇺🇸 ${usPhonetic}</span>
            <button class="lv-pronunciation-btn lv-pronunciation-us" data-word="${word}" data-accent="us" title="美式发音">
              <span class="lv-pronunciation-icon">🔊</span>
              <span class="lv-pronunciation-label">美式</span>
            </button>
          </div>
          <div class="lv-pronunciation-row">
            <span class="lv-pronunciation-phonetic">🇬🇧 ${ukPhonetic}</span>
            <button class="lv-pronunciation-btn lv-pronunciation-uk" data-word="${word}" data-accent="uk" title="英式发音">
              <span class="lv-pronunciation-icon">🔊</span>
              <span class="lv-pronunciation-label">英式</span>
            </button>
          </div>
        </div>
      </div>
  `;
  
  // 显示翻译结果
  const translations = translationData.translations.filter(t => t.type === 'translation');
  if (translations.length > 0) {
    contentHTML += `<div class="lv-translations-section">`;
    contentHTML += `<div class="lv-section-title">翻译</div>`;
    translations.forEach(translation => {
      contentHTML += `
        <div class="lv-translation-item">
          <span class="lv-translation-text">${translation.text}</span>
          <span class="lv-translation-source">${translation.source}</span>
        </div>
      `;
    });
    contentHTML += `</div>`;
  }
  
  // 显示词典定义
  const definitions = translationData.translations.filter(t => t.type === 'definition');
  if (definitions.length > 0) {
    contentHTML += `<div class="lv-definitions-section">`;
    contentHTML += `<div class="lv-section-title">词典释义</div>`;
    
    // 按词性分组
    const definitionsByPart = {};
    definitions.forEach(def => {
      if (!definitionsByPart[def.partOfSpeech]) {
        definitionsByPart[def.partOfSpeech] = [];
      }
      definitionsByPart[def.partOfSpeech].push(def);
    });
    
    Object.entries(definitionsByPart).forEach(([partOfSpeech, defs]) => {
      contentHTML += `
        <div class="lv-part-of-speech">
          <div class="lv-pos-label">${getPartOfSpeechChinese(partOfSpeech)}</div>
      `;
      
      defs.forEach((def, index) => {
        contentHTML += `
          <div class="lv-definition-item">
            <div class="lv-definition-text">${def.text}</div>
        `;
        
        if (def.example) {
          contentHTML += `
            <div class="lv-example">
              <span class="lv-example-label">例句:</span>
              <span class="lv-example-text">${def.example}</span>
            </div>
          `;
        }
        
        if (def.synonyms && def.synonyms.length > 0) {
          contentHTML += `
            <div class="lv-synonyms">
              <span class="lv-synonyms-label">同义词:</span>
              <span class="lv-synonyms-text">${def.synonyms.join(', ')}</span>
            </div>
          `;
        }
        
        contentHTML += `</div>`;
      });
      
      contentHTML += `</div>`;
    });
    
    contentHTML += `</div>`;
  }
  
  contentHTML += `</div>`;
  
  return contentHTML;
}

// 词性中文映射
function getPartOfSpeechChinese(partOfSpeech) {
  const posMap = {
    'noun': '名词',
    'verb': '动词',
    'adjective': '形容词',
    'adverb': '副词',
    'pronoun': '代词',
    'preposition': '介词',
    'conjunction': '连词',
    'interjection': '感叹词',
    'determiner': '限定词',
    'exclamation': '感叹词'
  };
  
  return posMap[partOfSpeech] || partOfSpeech;
}

// 播放单词发音
function playWordPronunciation(word, accent = 'us') {
  try {
    // 使用浏览器的语音合成API
    if ('speechSynthesis' in window) {
      // 停止当前播放
      speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(word);
      
      // 设置语音参数
      if (accent === 'uk') {
        utterance.lang = 'en-GB';
      } else {
        utterance.lang = 'en-US';
      }
      
      utterance.rate = 0.8;
      utterance.pitch = 1;
      utterance.volume = 1;
      
      speechSynthesis.speak(utterance);
    } else {
      console.log('浏览器不支持语音合成');
    }
  } catch (error) {
    console.error('播放发音失败:', error);
  }
}

// 保存单词详细数据到存储
async function saveWordsDataToStorage() {
  try {
    const wordsDataArray = Array.from(savedWordsData.entries());
    await chrome.storage.local.set({
      [STORAGE_KEYS.SAVED_WORDS_DATA]: wordsDataArray
    });
    console.log('单词详细数据保存成功:', savedWordsData.size, '个单词');
  } catch (error) {
    console.error('保存单词详细数据失败:', error);
    throw error;
  }
} 