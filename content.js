// 全局变量
let savedWords = new Set();
let savedWordsData = new Map(); // 存储单词的详细信息，包括时间戳
let translationButton = null;
let tooltipElement = null;
let isProcessing = false;
let currentHighlightColor = '#ffeb3b'; // 默认高亮颜色
let translationCache = new Map(); // 翻译缓存

// 数据版本控制
const DATA_VERSION = '1.11.0';
const STORAGE_KEYS = {
  SAVED_WORDS: 'savedWords',
  SAVED_WORDS_DATA: 'savedWordsData', // 新增：存储单词详细信息
  DATA_VERSION: 'dataVersion',
  BACKUP_DATA: 'backupData',
  LAST_BACKUP: 'lastBackup',
  HIGHLIGHT_COLOR: 'highlightColor',
  TRANSLATION_CACHE: 'translationCache'
};

// 检查扩展上下文是否有效
function isExtensionContextValid() {
  try {
    // 尝试访问chrome.runtime，如果扩展上下文失效会抛出错误
    return chrome.runtime && chrome.runtime.id;
  } catch (error) {
    console.warn('扩展上下文已失效:', error);
    return false;
  }
}

// 安全的存储操作包装器
async function safeStorageOperation(operation, fallbackAction = null) {
  try {
    if (!isExtensionContextValid()) {
      console.warn('扩展上下文失效，跳过存储操作');
      if (fallbackAction) {
        fallbackAction();
      }
      return false;
    }
    
    await operation();
    return true;
  } catch (error) {
    if (error.message.includes('Extension context invalidated')) {
      console.warn('扩展上下文失效，存储操作失败:', error);
      if (fallbackAction) {
        fallbackAction();
      }
      return false;
    } else {
      console.error('存储操作失败:', error);
      throw error;
    }
  }
}

// 初始化
async function init() {
  try {
    console.log('多多记单词扩展开始初始化...');
    
    await loadSavedWords();
    await loadSavedWordsData();
    await loadHighlightColor();
    await loadTranslationCache();
    await migrateDataIfNeeded();
    await createBackup();
    
    // 分别处理各个功能，避免一个失败影响其他
    try {
      highlightSavedWords();
    } catch (error) {
      console.error('高亮单词初始化失败:', error);
    }
    
    try {
      setupTextSelection();
    } catch (error) {
      console.error('文本选择功能初始化失败:', error);
    }
    
    try {
      setupWordHover();
    } catch (error) {
      console.error('单词悬停功能初始化失败:', error);
    }
    
    try {
      setupMessageListener();
    } catch (error) {
      console.error('消息监听器初始化失败:', error);
    }
    
    // 设置扩展上下文恢复检测
    try {
      setupExtensionContextRecovery();
    } catch (error) {
      console.error('扩展上下文恢复检测初始化失败:', error);
    }
    
    console.log('多多记单词扩展初始化完成');
  } catch (error) {
    console.error('多多记单词扩展初始化失败:', error);
  }
}

// 加载已保存的单词
async function loadSavedWords() {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEYS.SAVED_WORDS]);
    savedWords = new Set(result[STORAGE_KEYS.SAVED_WORDS] || []);
    console.log('加载保存的单词:', savedWords.size, '个');
  } catch (error) {
    console.error('加载保存的单词失败:', error);
    // 尝试从备份恢复
    await restoreFromBackup();
  }
}

// 加载单词详细数据
async function loadSavedWordsData() {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEYS.SAVED_WORDS_DATA]);
    savedWordsData = new Map(result[STORAGE_KEYS.SAVED_WORDS_DATA] || []);
    console.log('加载保存的单词详细数据:', savedWordsData.size, '个');
  } catch (error) {
    console.error('加载保存的单词详细数据失败:', error);
  }
}

// 加载高亮颜色设置
async function loadHighlightColor() {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEYS.HIGHLIGHT_COLOR]);
    currentHighlightColor = result[STORAGE_KEYS.HIGHLIGHT_COLOR] || '#ffeb3b';
    console.log('加载高亮颜色:', currentHighlightColor);
  } catch (error) {
    console.error('加载高亮颜色失败:', error);
    currentHighlightColor = '#ffeb3b';
  }
}

// 加载翻译缓存
async function loadTranslationCache() {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEYS.TRANSLATION_CACHE]);
    translationCache = new Map(result[STORAGE_KEYS.TRANSLATION_CACHE] || []);
    console.log('加载翻译缓存:', translationCache.size, '个单词');
  } catch (error) {
    console.error('加载翻译缓存失败:', error);
  }
}

// 保存单词到存储
async function saveWord(word, translationData = null) {
  const wordLower = word.toLowerCase();
  const timestamp = Date.now();
  
  // 先保存到内存
  savedWords.add(wordLower);
  
  // 保存单词详细信息
  savedWordsData.set(wordLower, {
    word: word, // 保留原始大小写
    addedTime: timestamp,
    translationData: translationData
  });
  
  // 如果提供了翻译数据，保存到缓存
  if (translationData) {
    translationCache.set(wordLower, translationData);
  }
  
  // 尝试保存到存储，如果失败也不影响内存中的数据
  try {
    await saveWordsToStorage();
    await saveWordsDataToStorage();
    await saveTranslationCache();
    console.log('保存单词成功:', word);
  } catch (error) {
    // 检查是否是扩展上下文失效错误
    if (error.message && error.message.includes('Extension context invalidated')) {
      console.log('扩展上下文失效，单词已保存到内存:', word);
    } else {
      console.error('保存单词失败:', error);
      // 只有在非扩展上下文失效的错误时才从内存中移除
      savedWords.delete(wordLower);
      savedWordsData.delete(wordLower);
      if (translationData) {
        translationCache.delete(wordLower);
      }
      throw error; // 重新抛出错误
    }
  }
  
  // 无论存储是否成功，都更新页面高亮
  try {
    highlightSavedWords();
  } catch (error) {
    console.error('更新高亮失败:', error);
  }
}

// 删除保存的单词
async function removeWord(word) {
  const wordLower = word.toLowerCase();
  
  // 先从内存中删除
  savedWords.delete(wordLower);
  savedWordsData.delete(wordLower); // 同时删除详细数据
  translationCache.delete(wordLower); // 同时删除翻译缓存
  
  // 尝试从存储中删除
  try {
    await saveWordsToStorage();
    await saveWordsDataToStorage();
    await saveTranslationCache();
    console.log('删除单词成功:', word);
  } catch (error) {
    // 检查是否是扩展上下文失效错误
    if (error.message && error.message.includes('Extension context invalidated')) {
      console.log('扩展上下文失效，单词已从内存中删除:', word);
    } else {
      console.error('删除单词失败:', error);
      // 只有在非扩展上下文失效的错误时才重新添加到内存
      savedWords.add(wordLower);
      throw error; // 重新抛出错误
    }
  }
  
  // 无论存储是否成功，都更新页面高亮
  try {
    highlightSavedWords();
  } catch (error) {
    console.error('更新高亮失败:', error);
  }
}

// 保存单词到存储（带备份）
async function saveWordsToStorage() {
  const wordsArray = Array.from(savedWords);
  const dataToSave = {
    [STORAGE_KEYS.SAVED_WORDS]: wordsArray,
    [STORAGE_KEYS.DATA_VERSION]: DATA_VERSION,
    [STORAGE_KEYS.LAST_BACKUP]: Date.now()
  };
  
  const success = await safeStorageOperation(async () => {
    await chrome.storage.local.set(dataToSave);
    
    // 每10个单词创建一次备份
    if (wordsArray.length % 10 === 0) {
      await createBackup();
    }
  }, () => {
    console.log('扩展上下文失效，单词已保存到内存中，等待扩展恢复后同步');
  });
  
  if (!success) {
    // 扩展上下文失效时，数据仍保存在内存中
    console.log('单词已保存到内存，等待扩展上下文恢复');
  }
}

// 保存翻译缓存
async function saveTranslationCache() {
  const cacheArray = Array.from(translationCache.entries());
  
  const success = await safeStorageOperation(async () => {
    await chrome.storage.local.set({
      [STORAGE_KEYS.TRANSLATION_CACHE]: cacheArray
    });
    console.log('翻译缓存保存成功:', translationCache.size, '个单词');
  }, () => {
    console.log('扩展上下文失效，翻译缓存已保存到内存中');
  });
  
  if (!success) {
    console.log('翻译缓存已保存到内存，等待扩展上下文恢复');
  }
}

// 保存单词详细数据
async function saveWordsDataToStorage() {
  const wordsDataArray = Array.from(savedWordsData.entries());
  
  const success = await safeStorageOperation(async () => {
    await chrome.storage.local.set({
      [STORAGE_KEYS.SAVED_WORDS_DATA]: wordsDataArray
    });
    console.log('单词详细数据保存成功:', savedWordsData.size, '个单词');
  }, () => {
    console.log('扩展上下文失效，单词详细数据已保存到内存中');
  });
  
  if (!success) {
    console.log('单词详细数据已保存到内存，等待扩展上下文恢复');
  }
}

// 创建数据备份
async function createBackup() {
  try {
    const currentData = await chrome.storage.local.get([STORAGE_KEYS.SAVED_WORDS]);
    const backupData = {
      words: currentData[STORAGE_KEYS.SAVED_WORDS] || [],
      version: DATA_VERSION,
      timestamp: Date.now(),
      count: (currentData[STORAGE_KEYS.SAVED_WORDS] || []).length
    };
    
    await chrome.storage.local.set({
      [STORAGE_KEYS.BACKUP_DATA]: backupData
    });
    
    console.log('数据备份成功:', backupData.count, '个单词');
  } catch (error) {
    console.error('创建备份失败:', error);
  }
}

// 从备份恢复数据
async function restoreFromBackup() {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEYS.BACKUP_DATA]);
    const backupData = result[STORAGE_KEYS.BACKUP_DATA];
    
    if (backupData && backupData.words) {
      savedWords = new Set(backupData.words);
      await saveWordsToStorage();
      console.log('从备份恢复数据成功:', backupData.count, '个单词');
      return true;
    }
  } catch (error) {
    console.error('从备份恢复失败:', error);
  }
  return false;
}

// 数据迁移（处理版本升级）
async function migrateDataIfNeeded() {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEYS.DATA_VERSION]);
    const currentVersion = result[STORAGE_KEYS.DATA_VERSION];
    
    if (!currentVersion) {
      // 首次安装或从旧版本升级
      console.log('检测到首次安装或版本升级，进行数据迁移...');
      
      // 检查是否有旧格式的数据
      const oldData = await chrome.storage.local.get(['savedWords']);
      if (oldData.savedWords && Array.isArray(oldData.savedWords)) {
        savedWords = new Set(oldData.savedWords);
        await saveWordsToStorage();
        console.log('数据迁移完成:', savedWords.size, '个单词');
      }
      
      // 设置当前版本
      await chrome.storage.local.set({
        [STORAGE_KEYS.DATA_VERSION]: DATA_VERSION
      });
    }
  } catch (error) {
    console.error('数据迁移失败:', error);
  }
}

// 导出数据（用于用户手动备份）
async function exportData() {
  try {
    const data = {
      words: Array.from(savedWords),
      wordsData: Array.from(savedWordsData.entries()), // 包含时间戳等详细信息
      translationCache: Array.from(translationCache.entries()),
      version: DATA_VERSION,
      exportTime: new Date().toISOString(),
      count: savedWords.size
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `多多记单词_备份_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log('数据导出成功');
  } catch (error) {
    console.error('数据导出失败:', error);
  }
}

// 导入数据（用于用户手动恢复）
async function importData(jsonData) {
  try {
    const data = JSON.parse(jsonData);
    
    if (!data.words || !Array.isArray(data.words)) {
      throw new Error('无效的数据格式');
    }
    
    // 合并现有数据和导入数据
    const importedWords = new Set(data.words);
    const mergedWords = new Set([...savedWords, ...importedWords]);
    savedWords = mergedWords;
    
    // 导入单词详细数据
    if (data.wordsData && Array.isArray(data.wordsData)) {
      const importedWordsData = new Map(data.wordsData);
      // 合并详细数据
      for (const [key, value] of importedWordsData) {
        savedWordsData.set(key, value);
      }
    }
    
    // 导入翻译缓存
    if (data.translationCache && Array.isArray(data.translationCache)) {
      const importedCache = new Map(data.translationCache);
      // 合并缓存数据
      for (const [key, value] of importedCache) {
        translationCache.set(key, value);
      }
    }
    
    await saveWordsToStorage();
    await saveWordsDataToStorage();
    await saveTranslationCache();
    highlightSavedWords();
    
    console.log('数据导入成功:', data.count, '个单词');
    return true;
  } catch (error) {
    console.error('数据导入失败:', error);
  }
  return false;
}

// 设置文本选择监听
function setupTextSelection() {
  document.addEventListener('mouseup', handleTextSelection);
  document.addEventListener('keyup', handleTextSelection);
}

// 处理文本选择
function handleTextSelection(event) {
  setTimeout(() => {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    
    // 移除之前的翻译按钮
    removeTranslationButton();
    
    if (selectedText) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      
      if (isEnglishWord(selectedText)) {
        // 单个英文单词
        showTranslationButton(selectedText, rect);
      } else if (isEnglishText(selectedText)) {
        // 包含英文的长文本
        showTextTranslationButton(selectedText, rect);
      }
    }
  }, 10);
}

// 判断是否为英文单词
function isEnglishWord(text) {
  return /^[a-zA-Z]+$/.test(text) && text.length > 1;
}

// 判断是否为包含英文的文本（用于长文本翻译）
function isEnglishText(text) {
  // 检查是否包含英文字母，且不是单个单词
  const hasEnglish = /[a-zA-Z]/.test(text);
  const isNotSingleWord = !/^[a-zA-Z]+$/.test(text);
  const hasMinLength = text.length > 3;
  
  return hasEnglish && isNotSingleWord && hasMinLength;
}

// 显示翻译按钮
function showTranslationButton(word, rect) {
  removeTranslationButton();
  
  translationButton = document.createElement('div');
  translationButton.className = 'lv-translation-button';
  translationButton.innerHTML = '📖';
  translationButton.title = '翻译单词';
  
  // 定位按钮
  translationButton.style.left = `${rect.left + window.scrollX + rect.width / 2}px`;
  translationButton.style.top = `${rect.top + window.scrollY - 35}px`;
  
  translationButton.addEventListener('click', (e) => {
    e.stopPropagation();
    showTranslation(word, rect);
  });
  
  document.body.appendChild(translationButton);
  
  // 3秒后自动隐藏
  setTimeout(() => {
    removeTranslationButton();
  }, 3000);
}

// 显示长文本翻译按钮
function showTextTranslationButton(text, rect) {
  removeTranslationButton();
  
  translationButton = document.createElement('div');
  translationButton.className = 'lv-translation-button lv-text-translation-button';
  translationButton.innerHTML = '🌐';
  translationButton.title = '翻译文本';
  
  // 定位按钮
  translationButton.style.left = `${rect.left + window.scrollX + rect.width / 2}px`;
  translationButton.style.top = `${rect.top + window.scrollY - 35}px`;
  
  translationButton.addEventListener('click', (e) => {
    e.stopPropagation();
    showTextTranslation(text, rect);
  });
  
  document.body.appendChild(translationButton);
  
  // 3秒后自动隐藏
  setTimeout(() => {
    removeTranslationButton();
  }, 3000);
}

// 移除翻译按钮
function removeTranslationButton() {
  if (translationButton) {
    translationButton.remove();
    translationButton = null;
  }
}

// 显示翻译结果
async function showTranslation(word, rect) {
  if (isProcessing) return;
  isProcessing = true;
  
  removeTranslationButton();
  removeTooltip();
  
  // 创建加载提示
  const loadingContent = `
    <div class="lv-loading-content">
      <div class="lv-loading-spinner"></div>
      <div class="lv-loading-text">正在翻译 "${word}"...</div>
    </div>
  `;
  const loadingTooltip = createTooltip(loadingContent, rect);
  
  try {
    const translationData = await translateWord(word);
    removeTooltip();
    
    const isSaved = savedWords.has(word.toLowerCase());
    const tooltipContent = createTranslationContent(word, translationData, isSaved);
    
    const tooltip = createTooltip(tooltipContent, rect);
    tooltip.innerHTML = tooltipContent;
    
    // 添加收藏按钮事件，传递翻译数据
    const favoriteBtn = tooltip.querySelector('.lv-favorite-btn');
    if (favoriteBtn) {
      favoriteBtn.addEventListener('click', () => {
        toggleFavorite(word, favoriteBtn, translationData);
      });
    }
    
    // 添加音频播放事件
    const audioButtons = tooltip.querySelectorAll('.lv-audio-btn');
    audioButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        playAudio(btn.dataset.audio);
      });
    });
    
    // 添加发音按钮事件
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
    
  } catch (error) {
    removeTooltip();
    const errorContent = `
      <div class="lv-error-content">
        <div class="lv-error-icon">⚠️</div>
        <div class="lv-error-text">翻译失败，请稍后重试</div>
      </div>
    `;
    createTooltip(errorContent, rect);
    console.error('翻译失败:', error);
  }
  
  isProcessing = false;
}

// 显示长文本翻译结果
async function showTextTranslation(text, rect) {
  if (isProcessing) return;
  isProcessing = true;
  
  removeTranslationButton();
  removeTooltip();
  
  // 创建加载提示
  const loadingContent = `
    <div class="lv-loading-content">
      <div class="lv-loading-spinner"></div>
      <div class="lv-loading-text">正在翻译文本...</div>
    </div>
  `;
  const loadingTooltip = createTooltip(loadingContent, rect);
  
  try {
    const translationResult = await translateText(text);
    removeTooltip();
    
    const tooltipContent = createTextTranslationContent(text, translationResult);
    
    const tooltip = createTooltip(tooltipContent, rect);
    tooltip.innerHTML = tooltipContent;
    
  } catch (error) {
    removeTooltip();
    const errorContent = `
      <div class="lv-error-content">
        <div class="lv-error-icon">⚠️</div>
        <div class="lv-error-text">翻译失败，请稍后重试</div>
      </div>
    `;
    createTooltip(errorContent, rect);
    console.error('文本翻译失败:', error);
  }
  
  isProcessing = false;
}

// 创建翻译内容HTML
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
  `;
  
  contentHTML += `</div>`;
  
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

// 创建长文本翻译内容HTML
function createTextTranslationContent(originalText, translationResult) {
  // 截断显示的原文，如果太长的话
  const maxDisplayLength = 100;
  const displayText = originalText.length > maxDisplayLength 
    ? originalText.substring(0, maxDisplayLength) + '...' 
    : originalText;
  
  const contentHTML = `
    <div class="lv-text-translation-content">
      <div class="lv-text-header">
        <div class="lv-text-title">
          <span class="lv-text-icon">🌐</span>
          <span class="lv-text-label">文本翻译</span>
        </div>
      </div>
      
      <div class="lv-text-body">
        <div class="lv-original-text">
          <div class="lv-text-section-title">原文:</div>
          <div class="lv-text-content">${displayText}</div>
        </div>
        
        <div class="lv-translation-divider">↓</div>
        
        <div class="lv-translated-text">
          <div class="lv-text-section-title">译文:</div>
          <div class="lv-text-content">${translationResult.translatedText}</div>
        </div>
      </div>
    </div>
  `;
  
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

// 播放音频
function playAudio(audioUrl) {
  if (!audioUrl) return;
  
  console.log('尝试播放音频:', audioUrl);
  
  try {
    const audio = new Audio(audioUrl);
    
    // 添加音频事件监听
    audio.addEventListener('loadstart', () => {
      console.log('音频开始加载');
    });
    
    audio.addEventListener('canplay', () => {
      console.log('音频可以播放');
    });
    
    audio.addEventListener('error', (e) => {
      console.error('音频加载错误:', e);
      console.error('错误详情:', audio.error);
    });
    
    // 尝试播放
    audio.play().then(() => {
      console.log('音频播放成功');
    }).catch(error => {
      console.error('音频播放失败:', error);
      
      // 如果是HTTPS音频URL在HTTP页面的问题，尝试替换协议
      if (audioUrl.startsWith('https://') && window.location.protocol === 'http:') {
        const httpUrl = audioUrl.replace('https://', 'http://');
        console.log('尝试HTTP版本音频:', httpUrl);
        const httpAudio = new Audio(httpUrl);
        httpAudio.play().catch(err => {
          console.error('HTTP音频也播放失败:', err);
        });
      }
    });
  } catch (error) {
    console.error('音频创建失败:', error);
  }
}

// 使用TTS服务播放单词发音
async function playWordPronunciation(word, accent = 'us') {
  console.log(`播放${accent === 'us' ? '美式' : '英式'}发音:`, word);
  
  try {
    // 方法1: 使用Google TTS (免费)
    const googleTTSUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=en&client=tw-ob&q=${encodeURIComponent(word)}&tk=1`;
    
    // 方法2: 使用ResponsiveVoice (备用)
    const responsiveVoiceUrl = accent === 'us' 
      ? `https://responsivevoice.org/responsivevoice/getvoice.php?t=${encodeURIComponent(word)}&tl=en-US&sv=g1&vn=&pitch=0.5&rate=0.5&vol=1`
      : `https://responsivevoice.org/responsivevoice/getvoice.php?t=${encodeURIComponent(word)}&tl=en-GB&sv=g1&vn=&pitch=0.5&rate=0.5&vol=1`;
    
    // 方法3: 使用浏览器内置TTS (最可靠)
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(word);
      utterance.lang = accent === 'us' ? 'en-US' : 'en-GB';
      utterance.rate = 0.8;
      utterance.pitch = 1;
      utterance.volume = 1;
      
      // 尝试选择合适的语音
      const voices = speechSynthesis.getVoices();
      const targetVoice = voices.find(voice => 
        voice.lang.startsWith(accent === 'us' ? 'en-US' : 'en-GB')
      ) || voices.find(voice => voice.lang.startsWith('en'));
      
      if (targetVoice) {
        utterance.voice = targetVoice;
        console.log('使用语音:', targetVoice.name, targetVoice.lang);
      }
      
      utterance.onstart = () => {
        console.log('TTS开始播放');
      };
      
      utterance.onend = () => {
        console.log('TTS播放完成');
      };
      
      utterance.onerror = (error) => {
        console.error('TTS播放错误:', error);
        // 如果TTS失败，尝试在线音频
        fallbackToOnlineAudio(word, googleTTSUrl);
      };
      
      speechSynthesis.speak(utterance);
      return;
    }
    
    // 如果不支持TTS，直接使用在线音频
    fallbackToOnlineAudio(word, googleTTSUrl);
    
  } catch (error) {
    console.error('播放发音失败:', error);
  }
}

// 备用在线音频播放
function fallbackToOnlineAudio(word, audioUrl) {
  console.log('使用在线音频播放:', audioUrl);
  
  try {
    const audio = new Audio(audioUrl);
    audio.play().catch(error => {
      console.error('在线音频播放失败:', error);
      // 最后的备用方案：显示提示
      showAudioError(word);
    });
  } catch (error) {
    console.error('在线音频创建失败:', error);
    showAudioError(word);
  }
}

// 显示音频播放错误提示
function showAudioError(word) {
  console.log('音频播放失败，显示提示');
  
  // 创建临时提示
  const errorTip = document.createElement('div');
  errorTip.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #ff6b6b;
    color: white;
    padding: 10px 15px;
    border-radius: 6px;
    font-size: 14px;
    z-index: 10000;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
  `;
  errorTip.textContent = `无法播放 "${word}" 的发音`;
  
  document.body.appendChild(errorTip);
  
  // 3秒后自动移除
  setTimeout(() => {
    if (errorTip.parentNode) {
      errorTip.remove();
    }
  }, 3000);
}

// 切换收藏状态
async function toggleFavorite(word, button, translationData = null) {
  const isSaved = button.dataset.saved === 'true';
  
  try {
    if (isSaved) {
      await removeWord(word);
      // 更新UI
      button.dataset.saved = 'false';
      button.querySelector('.lv-favorite-icon').textContent = '🤍';
      button.querySelector('.lv-favorite-text').textContent = '收藏';
    } else {
      await saveWord(word, translationData);
      // 更新UI
      button.dataset.saved = 'true';
      button.querySelector('.lv-favorite-icon').textContent = '❤️';
      button.querySelector('.lv-favorite-text').textContent = '取消收藏';
    }
  } catch (error) {
    // 如果是扩展上下文失效，仍然更新UI，因为数据已保存到内存
    if (error.message && error.message.includes('Extension context invalidated')) {
      console.log('扩展上下文失效，但操作已在内存中完成');
      if (!isSaved) {
        // 如果是添加收藏，更新UI为已收藏状态
        button.dataset.saved = 'true';
        button.querySelector('.lv-favorite-icon').textContent = '❤️';
        button.querySelector('.lv-favorite-text').textContent = '取消收藏';
      }
    } else {
      console.error('收藏操作失败:', error);
      // 显示错误提示
      showErrorMessage('收藏操作失败，请稍后重试');
    }
  }
}

// 创建提示框
function createTooltip(content, rect) {
  try {
    // 安全检查：确保参数有效
    if (!content || !rect) {
      console.warn('createTooltip: 无效的参数');
      return null;
    }
    
    removeTooltip();
    
    tooltipElement = document.createElement('div');
    tooltipElement.className = 'lv-tooltip';
    tooltipElement.innerHTML = content;
    
    // 安全检查：确保document.body存在
    if (!document.body) {
      console.warn('createTooltip: document.body不存在');
      return null;
    }
    
    // 先添加到页面以获取尺寸
    tooltipElement.style.position = 'absolute';
    tooltipElement.style.visibility = 'hidden';
    document.body.appendChild(tooltipElement);
    
    // 获取弹窗和窗口尺寸
    const tooltipRect = tooltipElement.getBoundingClientRect();
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    
    // 计算最佳位置
    let left = rect.left + window.scrollX;
    let top = rect.bottom + window.scrollY + 5;
    
    // 水平位置调整
    if (left + tooltipRect.width > windowWidth - 20) {
      left = windowWidth - tooltipRect.width - 20 + window.scrollX;
    }
    if (left < 20 + window.scrollX) {
      left = 20 + window.scrollX;
    }
    
    // 垂直位置调整
    const tooltipBottom = top - window.scrollY + tooltipRect.height;
    if (tooltipBottom > windowHeight - 20) {
      // 如果下方空间不够，尝试放在上方
      const topPosition = rect.top + window.scrollY - tooltipRect.height - 5;
      if (topPosition - window.scrollY > 20) {
        top = topPosition;
      } else {
        // 如果上下都不够，限制高度并启用滚动
        top = 20 + window.scrollY;
        const maxHeight = windowHeight - 40;
        tooltipElement.style.maxHeight = `${maxHeight}px`;
      }
    }
    
    // 应用最终位置
    tooltipElement.style.left = `${left}px`;
    tooltipElement.style.top = `${top}px`;
    tooltipElement.style.visibility = 'visible';
    
    // 添加提示框的鼠标事件监听器
    tooltipElement.addEventListener('mouseenter', () => {
      // 鼠标进入提示框时，确保不会被隐藏
      if (tooltipElement) {
        tooltipElement.setAttribute('data-hover', 'true');
      }
    });
    
    tooltipElement.addEventListener('mouseleave', () => {
      // 鼠标离开提示框时，延迟隐藏
      if (tooltipElement) {
        tooltipElement.removeAttribute('data-hover');
        setTimeout(() => {
          // 检查是否还在悬停状态
          if (!tooltipElement || !tooltipElement.hasAttribute('data-hover')) {
            removeTooltip();
          }
        }, 200);
      }
    });
    
    return tooltipElement;
  } catch (error) {
    console.error('createTooltip错误:', error);
    return null;
  }
}

// 移除提示框
function removeTooltip() {
  try {
    if (tooltipElement && tooltipElement.parentNode) {
      tooltipElement.remove();
      tooltipElement = null;
    }
  } catch (error) {
    console.error('removeTooltip错误:', error);
    // 强制重置tooltipElement
    tooltipElement = null;
  }
}

// 翻译单词 - 获取丰富的翻译结果
async function translateWord(word) {
  try {
    const wordLower = word.toLowerCase();
    
    // 首先检查缓存
    if (translationCache.has(wordLower)) {
      console.log('从缓存获取翻译:', word);
      return translationCache.get(wordLower);
    }
    
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
      const fallback = await fallbackTranslation(word);
      translations.push({
        type: 'translation',
        text: fallback,
        source: 'Fallback'
      });
    }

    const translationData = {
      word: word,
      translations: translations,
      hasMultiple: translations.length > 1,
      timestamp: Date.now() // 添加时间戳
    };

    return translationData;

  } catch (error) {
    console.error('翻译失败:', error);
    const fallback = await fallbackTranslation(word);
    return {
      word: word,
      translations: [{
        type: 'translation',
        text: fallback,
        source: 'Fallback'
      }],
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

// 微软翻译API (使用Edge浏览器免费接口)
async function getMicrosoftTranslation(word) {
  try {
    // 方法1：尝试使用Edge翻译接口
    const authResponse = await fetch('https://edge.microsoft.com/translate/auth');
    if (!authResponse.ok) {
      throw new Error('获取微软翻译授权失败');
    }
    const authToken = await authResponse.text();
    
    // 使用授权token进行翻译，同时请求词典信息
    const translateResponse = await fetch(
      'https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=en&to=zh-Hans&includeSentenceLength=true',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify([{ text: word }])
      }
    );
    
    if (!translateResponse.ok) {
      // 如果标准翻译失败，尝试词典查询
      return await getMicrosoftDictionary(word, authToken);
    }
    
    const data = await translateResponse.json();
    
    if (data && data.length > 0 && data[0].translations && data[0].translations.length > 0) {
      const mainTranslation = data[0].translations[0].text;
      
      // 尝试获取更多翻译选项
      try {
        const dictResult = await getMicrosoftDictionary(word, authToken);
        if (dictResult && dictResult !== mainTranslation) {
          return `${mainTranslation}，${dictResult}`;
        }
      } catch (dictError) {
        console.log('微软词典查询失败:', dictError);
      }
      
      return mainTranslation;
    }
    
    return null;
  } catch (error) {
    console.error('微软翻译失败:', error);
    return null;
  }
}

// 微软词典查询
async function getMicrosoftDictionary(word, authToken) {
  try {
    const dictResponse = await fetch(
      'https://api.cognitive.microsofttranslator.com/dictionary/lookup?api-version=3.0&from=en&to=zh-Hans',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify([{ text: word }])
      }
    );
    
    if (!dictResponse.ok) {
      return null;
    }
    
    const dictData = await dictResponse.json();
    
    if (dictData && dictData.length > 0 && dictData[0].translations) {
      const translations = dictData[0].translations
        .slice(0, 3) // 取前3个翻译
        .map(t => t.displayTarget)
        .filter(t => t && t.trim());
      
      if (translations.length > 0) {
        return translations.join('，');
      }
    }
    
    return null;
  } catch (error) {
    console.error('微软词典查询失败:', error);
    return null;
  }
}

// 备用翻译方案 - 完全移除本地词典
async function fallbackTranslation(word) {
  return `${word} (翻译失败)`;
}

// 高亮已保存的单词
function highlightSavedWords() {
  // 移除之前的高亮
  const existingHighlights = document.querySelectorAll('.lv-highlighted-word');
  existingHighlights.forEach(el => {
    const parent = el.parentNode;
    parent.replaceChild(document.createTextNode(el.textContent), el);
    parent.normalize();
  });
  
  if (savedWords.size === 0) return;
  
  // 创建词根匹配的正则表达式
  const regex = createWordMatchingRegex(Array.from(savedWords));
  
  // 遍历文本节点并高亮
  highlightTextNodes(document.body, regex);
}

// 创建词根匹配的正则表达式
function createWordMatchingRegex(savedWordsArray) {
  const patterns = [];
  
  savedWordsArray.forEach(word => {
    // 转义特殊字符
    const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // 添加精确匹配
    patterns.push(escapedWord);
    
    // 添加词根匹配模式
    const stemPatterns = generateStemPatterns(word);
    patterns.push(...stemPatterns);
  });
  
  // 去重并创建正则表达式
  const uniquePatterns = [...new Set(patterns)];
  const combinedPattern = uniquePatterns.join('|');
  
  return new RegExp(`\\b(${combinedPattern})\\b`, 'gi');
}

// 生成词根匹配模式
function generateStemPatterns(word) {
  const patterns = [];
  const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // 常见英语词尾变化规则
  const suffixes = [
    // 动词变化
    's', 'es', 'ed', 'ing', 'd',
    // 名词复数
    'es', 's',
    // 形容词比较级
    'er', 'est',
    // 副词
    'ly',
    // 其他常见后缀
    'tion', 'sion', 'ness', 'ment', 'able', 'ible', 'ful', 'less'
  ];
  
  suffixes.forEach(suffix => {
    // 为每个后缀创建匹配模式
    patterns.push(`${escapedWord}${suffix}`);
    
    // 处理一些特殊变化规则
    if (word.length > 3) {
      // 双写辅音字母的情况 (如 run -> running)
      const lastChar = word.slice(-1);
      const secondLastChar = word.slice(-2, -1);
      if (isConsonant(lastChar) && isVowel(secondLastChar) && word.length > 3) {
        patterns.push(`${escapedWord}${lastChar}${suffix}`);
      }
      
      // 去e加后缀的情况 (如 make -> making)
      if (word.endsWith('e') && (suffix === 'ing' || suffix === 'ed' || suffix === 'er' || suffix === 'est')) {
        const wordWithoutE = word.slice(0, -1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        patterns.push(`${wordWithoutE}${suffix}`);
      }
      
      // 变y为i的情况 (如 happy -> happier)
      if (word.endsWith('y') && word.length > 3) {
        const wordWithI = word.slice(0, -1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + 'i';
        patterns.push(`${wordWithI}${suffix}`);
        if (suffix === 'es') {
          patterns.push(`${wordWithI}es`);
        }
      }
    }
  });
  
  return patterns;
}

// 判断是否为辅音字母
function isConsonant(char) {
  return char && /^[bcdfghjklmnpqrstvwxyzBCDFGHJKLMNPQRSTVWXYZ]$/.test(char);
}

// 判断是否为元音字母
function isVowel(char) {
  return char && /^[aeiouAEIOU]$/.test(char);
}

// 查找匹配的词根
function findMatchingRoot(word) {
  const wordLower = word.toLowerCase();
  
  // 首先检查是否有精确匹配
  if (savedWords.has(wordLower)) {
    return wordLower;
  }
  
  // 检查是否有词根匹配
  for (const savedWord of savedWords) {
    if (isWordVariant(wordLower, savedWord)) {
      return savedWord;
    }
  }
  
  return null;
}

// 判断是否为单词的变形
function isWordVariant(word, rootWord) {
  // 如果单词就是词根，直接返回true
  if (word === rootWord) {
    return true;
  }
  
  // 检查是否以词根开头
  if (!word.startsWith(rootWord)) {
    return false;
  }
  
  // 获取后缀部分
  const suffix = word.substring(rootWord.length);
  
  // 常见的有效后缀
  const validSuffixes = [
    's', 'es', 'ed', 'ing', 'd', 'er', 'est', 'ly',
    'tion', 'sion', 'ness', 'ment', 'able', 'ible', 'ful', 'less'
  ];
  
  // 检查是否为有效后缀
  if (validSuffixes.includes(suffix)) {
    return true;
  }
  
  // 检查双写辅音的情况
  if (suffix.length > 1 && suffix[0] === rootWord.slice(-1)) {
    const remainingSuffix = suffix.substring(1);
    if (validSuffixes.includes(remainingSuffix)) {
      return true;
    }
  }
  
  // 检查去e加后缀的情况
  if (rootWord.endsWith('e')) {
    const wordWithoutE = rootWord.slice(0, -1);
    if (word.startsWith(wordWithoutE)) {
      const suffixFromE = word.substring(wordWithoutE.length);
      if (['ing', 'ed', 'er', 'est'].includes(suffixFromE)) {
        return true;
      }
    }
  }
  
  // 检查变y为i的情况
  if (rootWord.endsWith('y') && rootWord.length > 3) {
    const wordWithI = rootWord.slice(0, -1) + 'i';
    if (word.startsWith(wordWithI)) {
      const suffixFromI = word.substring(wordWithI.length);
      if (validSuffixes.includes(suffixFromI)) {
        return true;
      }
    }
  }
  
  return false;
}

// 高亮文本节点中的单词
function highlightTextNodes(node, regex) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent;
    if (regex.test(text)) {
      const highlightedHTML = text.replace(regex, (match) => {
        // 查找匹配的词根
        const matchingRoot = findMatchingRoot(match);
        const dataWord = matchingRoot || match.toLowerCase();
        
        // 如果找到了词根且不是精确匹配，则只高亮词根部分
        if (matchingRoot && matchingRoot !== match.toLowerCase()) {
          return highlightWordRoot(match, matchingRoot);
        } else {
          // 精确匹配或没有找到词根，高亮整个单词
          return `<span class="lv-highlighted-word" data-word="${dataWord}" style="background-color: ${currentHighlightColor}">${match}</span>`;
        }
      });
      
      const wrapper = document.createElement('div');
      wrapper.innerHTML = highlightedHTML;
      
      const fragment = document.createDocumentFragment();
      while (wrapper.firstChild) {
        fragment.appendChild(wrapper.firstChild);
      }
      
      node.parentNode.replaceChild(fragment, node);
    }
  } else if (node.nodeType === Node.ELEMENT_NODE) {
    // 跳过已经处理过的元素和特殊元素
    if (node.classList && (
      node.classList.contains('lv-highlighted-word') ||
      node.classList.contains('lv-tooltip') ||
      node.classList.contains('lv-translation-button')
    )) {
      return;
    }
    
    // 跳过脚本、样式等元素
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'OBJECT'].includes(node.tagName)) {
      return;
    }
    
    // 递归处理子节点
    const children = Array.from(node.childNodes);
    children.forEach(child => highlightTextNodes(child, regex));
  }
}

// 高亮单词中的词根部分
function highlightWordRoot(fullWord, rootWord) {
  const fullWordLower = fullWord.toLowerCase();
  const rootWordLower = rootWord.toLowerCase();
  
  // 查找词根在单词中的位置
  let rootStartIndex = -1;
  let rootEndIndex = -1;
  
  // 直接匹配词根
  if (fullWordLower.startsWith(rootWordLower)) {
    rootStartIndex = 0;
    rootEndIndex = rootWordLower.length;
  } else {
    // 处理特殊变化情况
    
    // 1. 去e加后缀的情况 (如 make -> making)
    if (rootWordLower.endsWith('e')) {
      const rootWithoutE = rootWordLower.slice(0, -1);
      if (fullWordLower.startsWith(rootWithoutE)) {
        rootStartIndex = 0;
        rootEndIndex = rootWithoutE.length;
      }
    }
    
    // 2. 变y为i的情况 (如 happy -> happier)
    if (rootWordLower.endsWith('y') && rootWordLower.length > 3) {
      const rootWithI = rootWordLower.slice(0, -1) + 'i';
      if (fullWordLower.startsWith(rootWithI)) {
        rootStartIndex = 0;
        rootEndIndex = rootWordLower.length; // 保持原始词根长度
      }
    }
    
    // 3. 双写辅音的情况 (如 run -> running)
    const lastChar = rootWordLower.slice(-1);
    const doubleConsonant = rootWordLower + lastChar;
    if (fullWordLower.startsWith(doubleConsonant)) {
      rootStartIndex = 0;
      rootEndIndex = rootWordLower.length; // 只高亮原始词根，不包括双写的字母
    }
  }
  
  // 如果找不到词根位置，回退到高亮整个单词
  if (rootStartIndex === -1) {
    return `<span class="lv-highlighted-word" data-word="${rootWordLower}" style="background-color: ${currentHighlightColor}">${fullWord}</span>`;
  }
  
  // 分割单词：前缀 + 词根 + 后缀
  const prefix = fullWord.substring(0, rootStartIndex);
  const root = fullWord.substring(rootStartIndex, rootEndIndex);
  const suffix = fullWord.substring(rootEndIndex);
  
  // 只高亮词根部分，但整个单词都可以点击
  return `<span class="lv-highlighted-word" data-word="${rootWordLower}" style="cursor: pointer;" title="点击查看翻译">${prefix}<span class="lv-root-highlight" style="background-color: ${currentHighlightColor}">${root}</span>${suffix}</span>`;
}

// 设置单词悬停事件
function setupWordHover() {
  document.addEventListener('mouseover', handleWordHover);
  document.addEventListener('click', handleWordClick);
}

// 处理单词悬停
function handleWordHover(event) {
  try {
    const target = event.target;
    
    // 安全检查：确保target存在且有效
    if (!target || !target.classList || !target.dataset) {
      return;
    }
    
    if (target.classList.contains('lv-highlighted-word')) {
      const word = target.dataset.word;
      if (word && !tooltipElement) {
        showWordTooltip(word, target);
      }
    }
  } catch (error) {
    console.error('handleWordHover错误:', error);
  }
}

// 处理单词点击
function handleWordClick(event) {
  try {
    const target = event.target;
    
    // 安全检查：确保target存在且有效
    if (!target || !target.classList || !target.dataset) {
      return;
    }
    
    if (target.classList.contains('lv-highlighted-word')) {
      event.preventDefault();
      const word = target.dataset.word;
      if (word) {
        const rect = target.getBoundingClientRect();
        showTranslation(word, rect);
      }
    }
  } catch (error) {
    console.error('handleWordClick错误:', error);
  }
}

// 显示单词提示框
async function showWordTooltip(word, element) {
  try {
    // 安全检查：确保element存在且有效
    if (!element || !element.textContent || !element.getBoundingClientRect) {
      console.warn('showWordTooltip: 无效的element参数');
      return;
    }
    
    // word 是词根，element.textContent 是实际显示的单词
    const actualWord = element.textContent.toLowerCase();
    const rootWord = word.toLowerCase();
    
    let translationData;
    
    // 优先从缓存获取实际单词的翻译数据
    if (translationCache.has(actualWord)) {
      console.log('从缓存获取悬停翻译:', actualWord);
      translationData = translationCache.get(actualWord);
    } else if (translationCache.has(rootWord)) {
      console.log('从缓存获取词根翻译:', rootWord);
      translationData = translationCache.get(rootWord);
    } else {
      // 如果缓存中没有，则翻译实际单词
      translationData = await translateWord(actualWord);
    }
    
    // 再次检查element是否仍然有效（可能在异步操作期间被移除）
    if (!element.isConnected || !document.contains(element)) {
      console.warn('showWordTooltip: element已从DOM中移除');
      return;
    }
    
    const rect = element.getBoundingClientRect();
    
    // 收藏状态基于词根判断
    const isSaved = savedWords.has(rootWord);
    const tooltipContent = createTranslationContent(actualWord, translationData, isSaved);
    const tooltip = createTooltip(tooltipContent, rect);
    
    // 安全检查：确保tooltip创建成功
    if (!tooltip) {
      console.warn('showWordTooltip: tooltip创建失败');
      return;
    }
    
    tooltip.innerHTML = tooltipContent;
    
    // 添加收藏按钮事件
    const favoriteBtn = tooltip.querySelector('.lv-favorite-btn');
    if (favoriteBtn) {
      favoriteBtn.addEventListener('click', () => {
        // 收藏操作基于实际单词，但会影响词根的收藏状态
        toggleFavorite(actualWord, favoriteBtn, translationData);
      });
    }
    
    // 添加音频播放事件
    const audioButtons = tooltip.querySelectorAll('.lv-audio-btn');
    audioButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        playAudio(btn.dataset.audio);
      });
    });
    
    // 添加发音按钮事件
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
    
    // 鼠标离开时隐藏提示框
    element.addEventListener('mouseleave', () => {
      setTimeout(() => {
        if (tooltipElement && !tooltipElement.hasAttribute('data-hover')) {
          removeTooltip();
        }
      }, 200);
    });
    
  } catch (error) {
    console.error('显示单词提示失败:', error);
  }
}

// 监听存储变化
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    let shouldUpdateHighlight = false;
    
    if (changes.savedWords) {
      savedWords = new Set(changes.savedWords.newValue || []);
      shouldUpdateHighlight = true;
      console.log('存储变化：单词列表已更新，数量:', savedWords.size);
    }
    
    if (changes.savedWordsData) {
      const rawData = changes.savedWordsData.newValue || [];
      savedWordsData = new Map(rawData);
      console.log('存储变化：单词详细数据已更新，数量:', savedWordsData.size);
    }
    
    if (changes.translationCache) {
      const rawCache = changes.translationCache.newValue || [];
      translationCache = new Map(rawCache);
      console.log('存储变化：翻译缓存已更新，数量:', translationCache.size);
    }
    
    if (shouldUpdateHighlight) {
      highlightSavedWords();
    }
  }
});

// 设置消息监听器
function setupMessageListener() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'updateHighlightColor') {
      updateHighlightColor(message.color);
      sendResponse({ success: true });
    } else if (message.type === 'wordDeleted') {
      // 处理单词删除消息
      const wordLower = message.word;
      console.log('收到删除单词消息:', wordLower);
      
      // 从内存中删除
      savedWords.delete(wordLower);
      savedWordsData.delete(wordLower);
      translationCache.delete(wordLower);
      
      // 重新高亮单词
      highlightSavedWords();
      
      console.log('content script已同步删除单词:', wordLower);
      sendResponse({ success: true });
    } else if (message.type === 'wordMarkedAsKnown') {
      // 处理单词标记为已认识消息
      const wordLower = message.word;
      console.log('收到单词标记为已认识消息:', wordLower);
      
      // 从收藏列表中删除（因为已经认识了）
      savedWords.delete(wordLower);
      savedWordsData.delete(wordLower);
      
      // 重新高亮单词（移除高亮）
      highlightSavedWords();
      
      console.log('content script已同步处理单词标记为已认识:', wordLower);
      sendResponse({ success: true });
    } else if (message.action === 'translateSelectedWord') {
      // 处理右键菜单翻译请求
      const word = message.word;
      console.log('收到右键菜单翻译请求:', word);
      
      if (word && isEnglishWord(word)) {
        // 获取当前选中文本的位置
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          
          // 显示翻译
          showTranslation(word, rect);
          sendResponse({ success: true });
        } else {
          // 如果没有选中文本，在页面中心显示翻译
          const rect = {
            left: window.innerWidth / 2 - 200,
            top: window.innerHeight / 2 - 100,
            width: 0,
            height: 0
          };
          showTranslation(word, rect);
          sendResponse({ success: true });
        }
      } else {
        console.log('无效的单词:', word);
        sendResponse({ success: false, error: '无效的单词' });
      }
    }
  });
}

// 更新高亮颜色
async function updateHighlightColor(newColor) {
  currentHighlightColor = newColor;
  
  // 重新高亮所有已保存的单词
  highlightSavedWords();
  
  console.log('高亮颜色已更新:', newColor);
}

// 翻译长文本
async function translateText(text) {
  try {
    // 优先使用微软翻译
    let translation = await getMicrosoftTextTranslation(text);
    
    // 如果微软翻译失败，使用MyMemory作为备用
    if (!translation) {
      translation = await getMyMemoryTextTranslation(text);
    }
    
    // 如果都失败了，返回错误信息
    if (!translation) {
      throw new Error('所有翻译服务都不可用');
    }
    
    return {
      originalText: text,
      translatedText: translation,
      timestamp: Date.now()
    };
    
  } catch (error) {
    console.error('文本翻译失败:', error);
    throw error;
  }
}

// 微软文本翻译
async function getMicrosoftTextTranslation(text) {
  try {
    // 获取授权token
    const authResponse = await fetch('https://edge.microsoft.com/translate/auth');
    if (!authResponse.ok) {
      throw new Error('获取微软翻译授权失败');
    }
    const authToken = await authResponse.text();
    
    // 进行翻译
    const translateResponse = await fetch(
      'https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=en&to=zh-Hans',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify([{ text: text }])
      }
    );
    
    if (!translateResponse.ok) {
      throw new Error('微软翻译请求失败');
    }
    
    const data = await translateResponse.json();
    
    if (data && data.length > 0 && data[0].translations && data[0].translations.length > 0) {
      return data[0].translations[0].text;
    }
    
    return null;
  } catch (error) {
    console.error('微软文本翻译失败:', error);
    return null;
  }
}

// MyMemory文本翻译
async function getMyMemoryTextTranslation(text) {
  try {
    const response = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|zh`
    );
    
    if (!response.ok) {
      throw new Error('MyMemory API请求失败');
    }
    
    const data = await response.json();
    
    if (data.responseStatus === 200 && data.responseData) {
      return data.responseData.translatedText;
    }
    
    return null;
  } catch (error) {
    console.error('MyMemory文本翻译失败:', error);
    return null;
  }
}

// 页面加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
} 

// 显示错误消息
function showErrorMessage(message) {
  try {
    // 创建错误提示元素
    const errorTip = document.createElement('div');
    errorTip.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #ff6b6b;
      color: white;
      padding: 12px 16px;
      border-radius: 6px;
      font-size: 14px;
      z-index: 10001;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      max-width: 300px;
      word-wrap: break-word;
    `;
    errorTip.textContent = message;
    
    document.body.appendChild(errorTip);
    
    // 3秒后自动移除
    setTimeout(() => {
      if (errorTip.parentNode) {
        errorTip.remove();
      }
    }, 3000);
  } catch (error) {
    console.error('显示错误消息失败:', error);
  }
}

// 创建提示框

// 设置扩展上下文恢复检测
function setupExtensionContextRecovery() {
  let hasTriedSync = false; // 标记是否已经尝试过同步
  
  // 页面可见性变化时检查并同步
  function handleVisibilityChange() {
    // 只有当页面变为可见且还没有尝试过同步时才执行
    if (!document.hidden && !hasTriedSync && !isExtensionContextValid()) {
      console.log('页面激活，检查扩展上下文...');
      trySync();
    }
  }
  
  // 页面焦点变化时检查并同步
  function handleFocusChange() {
    // 只有当页面获得焦点且还没有尝试过同步时才执行
    if (!hasTriedSync && !isExtensionContextValid()) {
      console.log('页面获得焦点，检查扩展上下文...');
      trySync();
    }
  }
  
  // 尝试同步数据
  async function trySync() {
    if (hasTriedSync) return; // 避免重复同步
    
    try {
      if (isExtensionContextValid()) {
        console.log('扩展上下文已恢复，尝试同步数据...');
        hasTriedSync = true; // 标记已尝试同步
        
        // 尝试同步内存中的数据到存储
        await saveWordsToStorage();
        await saveWordsDataToStorage();
        await saveTranslationCache();
        console.log('数据同步成功');
        
        // 移除事件监听器，避免后续不必要的检查
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('focus', handleFocusChange);
      }
    } catch (error) {
      console.log('数据同步失败:', error);
      hasTriedSync = false; // 重置标记，允许下次尝试
    }
  }
  
  // 监听页面可见性变化
  document.addEventListener('visibilitychange', handleVisibilityChange);
  
  // 监听窗口焦点变化
  window.addEventListener('focus', handleFocusChange);
  
  // 页面加载时立即检查一次（如果扩展上下文无效）
  if (!isExtensionContextValid()) {
    console.log('页面加载时检测到扩展上下文无效，等待页面激活时同步');
  }
}

// 加载已保存的单词