// 全局变量
let savedWords = new Set();
let savedWordsData = new Map(); // 存储单词的详细信息，包括时间戳
let translationButton = null;
let tooltipElement = null;
let isProcessing = false;
let currentHighlightColor = '#ffeb3b'; // 默认高亮颜色
let translationCache = new Map(); // 翻译缓存

// 数据版本控制
const DATA_VERSION = '1.5.1';
const STORAGE_KEYS = {
  SAVED_WORDS: 'savedWords',
  SAVED_WORDS_DATA: 'savedWordsData', // 新增：存储单词详细信息
  DATA_VERSION: 'dataVersion',
  BACKUP_DATA: 'backupData',
  LAST_BACKUP: 'lastBackup',
  HIGHLIGHT_COLOR: 'highlightColor',
  TRANSLATION_CACHE: 'translationCache'
};

// 初始化
async function init() {
  await loadSavedWords();
  await loadSavedWordsData();
  await loadHighlightColor();
  await loadTranslationCache();
  await migrateDataIfNeeded();
  await createBackup();
  highlightSavedWords();
  setupTextSelection();
  setupWordHover();
  setupMessageListener();
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
  
  try {
    await saveWordsToStorage();
    await saveWordsDataToStorage();
    await saveTranslationCache();
    highlightSavedWords();
    console.log('保存单词成功:', word);
  } catch (error) {
    console.error('保存单词失败:', error);
    // 从内存中移除，保持一致性
    savedWords.delete(wordLower);
    savedWordsData.delete(wordLower);
    if (translationData) {
      translationCache.delete(wordLower);
    }
  }
}

// 删除保存的单词
async function removeWord(word) {
  const wordLower = word.toLowerCase();
  savedWords.delete(wordLower);
  savedWordsData.delete(wordLower); // 同时删除详细数据
  translationCache.delete(wordLower); // 同时删除翻译缓存
  
  try {
    await saveWordsToStorage();
    await saveWordsDataToStorage();
    await saveTranslationCache();
    highlightSavedWords();
    console.log('删除单词成功:', word);
  } catch (error) {
    console.error('删除单词失败:', error);
    // 重新添加到内存，保持一致性
    savedWords.add(wordLower);
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
  
  try {
    await chrome.storage.local.set(dataToSave);
    
    // 每10个单词创建一次备份
    if (wordsArray.length % 10 === 0) {
      await createBackup();
    }
  } catch (error) {
    console.error('保存到存储失败:', error);
    throw error;
  }
}

// 保存翻译缓存
async function saveTranslationCache() {
  try {
    const cacheArray = Array.from(translationCache.entries());
    await chrome.storage.local.set({
      [STORAGE_KEYS.TRANSLATION_CACHE]: cacheArray
    });
    console.log('翻译缓存保存成功:', translationCache.size, '个单词');
  } catch (error) {
    console.error('保存翻译缓存失败:', error);
    throw error;
  }
}

// 保存单词详细数据
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
    
    if (selectedText && isEnglishWord(selectedText)) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      showTranslationButton(selectedText, rect);
    }
  }, 10);
}

// 判断是否为英文单词
function isEnglishWord(text) {
  return /^[a-zA-Z]+$/.test(text) && text.length > 1;
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

// 创建翻译内容HTML
function createTranslationContent(word, translationData, isSaved) {
  const favoriteIcon = isSaved ? '❤️' : '🤍';
  const favoriteText = isSaved ? '取消收藏' : '收藏';
  
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
  `;
  
  // 查找并显示音标
  const phoneticItem = translationData.translations.find(t => t.type === 'phonetic');
  if (phoneticItem) {
    contentHTML += `
      <div class="lv-phonetic">
        <span class="lv-phonetic-text">${phoneticItem.text}</span>
        ${phoneticItem.audio ? `<button class="lv-audio-btn" data-audio="${phoneticItem.audio}" title="播放发音">🔊</button>` : ''}
      </div>
    `;
  }
  
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
  
  try {
    const audio = new Audio(audioUrl);
    audio.play().catch(error => {
      console.error('音频播放失败:', error);
    });
  } catch (error) {
    console.error('音频创建失败:', error);
  }
}

// 切换收藏状态
async function toggleFavorite(word, button, translationData = null) {
  const isSaved = button.dataset.saved === 'true';
  
  if (isSaved) {
    await removeWord(word);
    button.dataset.saved = 'false';
    button.querySelector('.lv-favorite-icon').textContent = '🤍';
    button.querySelector('.lv-favorite-text').textContent = '收藏';
  } else {
    await saveWord(word, translationData);
    button.dataset.saved = 'true';
    button.querySelector('.lv-favorite-icon').textContent = '❤️';
    button.querySelector('.lv-favorite-text').textContent = '取消收藏';
  }
}

// 创建提示框
function createTooltip(content, rect) {
  removeTooltip();
  
  tooltipElement = document.createElement('div');
  tooltipElement.className = 'lv-tooltip';
  tooltipElement.innerHTML = content;
  
  // 定位提示框
  tooltipElement.style.left = `${rect.left + window.scrollX}px`;
  tooltipElement.style.top = `${rect.bottom + window.scrollY + 5}px`;
  
  document.body.appendChild(tooltipElement);
  
  // 点击其他地方关闭提示框
  setTimeout(() => {
    document.addEventListener('click', handleClickOutside);
  }, 100);
  
  return tooltipElement;
}

// 处理点击外部关闭提示框
function handleClickOutside(event) {
  if (tooltipElement && !tooltipElement.contains(event.target)) {
    removeTooltip();
    document.removeEventListener('click', handleClickOutside);
  }
}

// 移除提示框
function removeTooltip() {
  if (tooltipElement) {
    tooltipElement.remove();
    tooltipElement = null;
    document.removeEventListener('click', handleClickOutside);
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
  
  // 创建正则表达式匹配已保存的单词
  const wordsPattern = Array.from(savedWords)
    .map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  
  const regex = new RegExp(`\\b(${wordsPattern})\\b`, 'gi');
  
  // 遍历文本节点并高亮
  highlightTextNodes(document.body, regex);
}

// 高亮文本节点中的单词
function highlightTextNodes(node, regex) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent;
    if (regex.test(text)) {
      const highlightedHTML = text.replace(regex, (match) => {
        return `<span class="lv-highlighted-word" data-word="${match.toLowerCase()}" style="background-color: ${currentHighlightColor}">${match}</span>`;
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

// 设置单词悬停事件
function setupWordHover() {
  document.addEventListener('mouseover', handleWordHover);
  document.addEventListener('click', handleWordClick);
}

// 处理单词悬停
function handleWordHover(event) {
  const target = event.target;
  if (target.classList && target.classList.contains('lv-highlighted-word')) {
    const word = target.dataset.word;
    if (word && !tooltipElement) {
      showWordTooltip(word, target);
    }
  }
}

// 处理单词点击
function handleWordClick(event) {
  const target = event.target;
  if (target.classList && target.classList.contains('lv-highlighted-word')) {
    event.preventDefault();
    const word = target.dataset.word;
    if (word) {
      const rect = target.getBoundingClientRect();
      showTranslation(word, rect);
    }
  }
}

// 显示单词提示框
async function showWordTooltip(word, element) {
  try {
    const wordLower = word.toLowerCase();
    let translationData;
    
    // 优先从缓存获取翻译数据
    if (translationCache.has(wordLower)) {
      console.log('从缓存获取悬停翻译:', word);
      translationData = translationCache.get(wordLower);
    } else {
      // 如果缓存中没有，则重新翻译
      translationData = await translateWord(word);
    }
    
    const rect = element.getBoundingClientRect();
    
    const tooltipContent = createTranslationContent(word, translationData, true);
    const tooltip = createTooltip(tooltipContent, rect);
    tooltip.innerHTML = tooltipContent;
    
    // 添加收藏按钮事件
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
    
    // 鼠标离开时隐藏提示框
    element.addEventListener('mouseleave', () => {
      setTimeout(() => {
        if (tooltipElement && !tooltipElement.matches(':hover')) {
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
  if (namespace === 'local' && changes.savedWords) {
    savedWords = new Set(changes.savedWords.newValue || []);
    highlightSavedWords();
  }
});

// 设置消息监听器
function setupMessageListener() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'updateHighlightColor') {
      updateHighlightColor(message.color);
      sendResponse({ success: true });
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

// 页面加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
} 