// 全局变量
let savedWords = new Set();
let translationButton = null;
let tooltipElement = null;
let isProcessing = false;

// 数据版本控制
const DATA_VERSION = '1.0.0';
const STORAGE_KEYS = {
  SAVED_WORDS: 'savedWords',
  DATA_VERSION: 'dataVersion',
  BACKUP_DATA: 'backupData',
  LAST_BACKUP: 'lastBackup'
};

// 初始化
async function init() {
  await loadSavedWords();
  await migrateDataIfNeeded();
  await createBackup();
  highlightSavedWords();
  setupTextSelection();
  setupWordHover();
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

// 保存单词到存储
async function saveWord(word) {
  savedWords.add(word.toLowerCase());
  try {
    await saveWordsToStorage();
    highlightSavedWords();
    console.log('保存单词成功:', word);
  } catch (error) {
    console.error('保存单词失败:', error);
    // 从内存中移除，保持一致性
    savedWords.delete(word.toLowerCase());
  }
}

// 删除保存的单词
async function removeWord(word) {
  savedWords.delete(word.toLowerCase());
  try {
    await saveWordsToStorage();
    highlightSavedWords();
    console.log('删除单词成功:', word);
  } catch (error) {
    console.error('删除单词失败:', error);
    // 重新添加到内存，保持一致性
    savedWords.add(word.toLowerCase());
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
    
    if (data.words && Array.isArray(data.words)) {
      const importedWords = new Set(data.words);
      
      // 合并现有数据和导入数据
      const mergedWords = new Set([...savedWords, ...importedWords]);
      savedWords = mergedWords;
      
      await saveWordsToStorage();
      highlightSavedWords();
      
      console.log('数据导入成功:', data.count, '个单词');
      return true;
    }
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
  const loadingTooltip = createTooltip('正在翻译...', rect);
  
  try {
    const translationData = await translateWord(word);
    removeTooltip();
    
    const isSaved = savedWords.has(word.toLowerCase());
    const tooltipContent = createTranslationContent(word, translationData, isSaved);
    
    const tooltip = createTooltip(tooltipContent, rect);
    tooltip.innerHTML = tooltipContent;
    
    // 添加收藏按钮事件
    const favoriteBtn = tooltip.querySelector('.lv-favorite-btn');
    if (favoriteBtn) {
      favoriteBtn.addEventListener('click', () => {
        toggleFavorite(word, favoriteBtn);
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
    createTooltip('翻译失败，请稍后重试', rect);
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
        <div class="lv-word">${word}</div>
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
  
  // 收藏按钮
  contentHTML += `
      <button class="lv-favorite-btn" data-saved="${isSaved}">
        <span class="lv-favorite-icon">${favoriteIcon}</span>
        <span class="lv-favorite-text">${favoriteText}</span>
      </button>
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
async function toggleFavorite(word, button) {
  const isSaved = button.dataset.saved === 'true';
  
  if (isSaved) {
    await removeWord(word);
    button.dataset.saved = 'false';
    button.querySelector('.lv-favorite-icon').textContent = '🤍';
    button.querySelector('.lv-favorite-text').textContent = '收藏';
  } else {
    await saveWord(word);
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
    // 并行调用多个翻译源
    const [myMemoryResult, dictionaryResult, baiduResult] = await Promise.allSettled([
      getMyMemoryTranslation(word),
      getDictionaryTranslation(word),
      getBaiduTranslation(word)
    ]);

    // 整合翻译结果
    const translations = [];
    
    // MyMemory翻译结果
    if (myMemoryResult.status === 'fulfilled' && myMemoryResult.value) {
      translations.push({
        type: 'translation',
        text: myMemoryResult.value,
        source: 'MyMemory'
      });
    }

    // 百度翻译结果
    if (baiduResult.status === 'fulfilled' && baiduResult.value) {
      translations.push({
        type: 'translation',
        text: baiduResult.value,
        source: 'Baidu'
      });
    }

    // 从本地词典获取更多翻译
    const localTranslations = getLocalTranslations(word);
    if (localTranslations.length > 0) {
      localTranslations.forEach(trans => {
        translations.push({
          type: 'translation',
          text: trans,
          source: 'Local'
        });
      });
    }

    // 词典翻译结果
    if (dictionaryResult.status === 'fulfilled' && dictionaryResult.value) {
      translations.push(...dictionaryResult.value);
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

    return {
      word: word,
      translations: translations,
      hasMultiple: translations.length > 1
    };

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
      hasMultiple: false
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
      return data.responseData.translatedText;
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

// 百度翻译API (使用免费接口)
async function getBaiduTranslation(word) {
  try {
    // 使用百度翻译的免费接口
    const response = await fetch(
      `https://fanyi-api.baidu.com/api/trans/vip/translate?q=${encodeURIComponent(word)}&from=en&to=zh&appid=20151113000005349&salt=1435660288&sign=f89f9594663708c1605f3d736d01d2d4`
    );
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    
    if (data.trans_result && data.trans_result.length > 0) {
      return data.trans_result[0].dst;
    }
    
    return null;
  } catch (error) {
    console.error('百度翻译失败:', error);
    return null;
  }
}

// 获取本地多重翻译
function getLocalTranslations(word) {
  const multiTranslations = {
    'memorize': ['记忆', '背诵', '熟记', '记住'],
    'remember': ['记住', '回忆', '想起', '纪念'],
    'converse': ['交谈', '反转', '谈话', '相反的'],
    'study': ['学习', '研究', '书房', '调查'],
    'learn': ['学习', '了解', '得知', '掌握'],
    'understand': ['理解', '明白', '懂得', '领会'],
    'know': ['知道', '了解', '认识', '熟悉'],
    'think': ['想', '认为', '思考', '考虑'],
    'speak': ['说话', '讲', '演讲', '表达'],
    'talk': ['谈话', '交谈', '讲话', '商谈'],
    'say': ['说', '讲', '表达', '声称'],
    'tell': ['告诉', '说', '讲述', '辨别'],
    'read': ['读', '阅读', '朗读', '理解'],
    'write': ['写', '书写', '创作', '编写'],
    'listen': ['听', '倾听', '听从', '注意听'],
    'hear': ['听见', '听说', '审理', '倾听'],
    'see': ['看见', '明白', '理解', '会见'],
    'look': ['看', '外观', '寻找', '注视'],
    'watch': ['观看', '手表', '监视', '注意'],
    'work': ['工作', '劳动', '运转', '起作用'],
    'job': ['工作', '职业', '任务', '活儿'],
    'play': ['玩', '播放', '演奏', '比赛'],
    'game': ['游戏', '比赛', '猎物', '策略'],
    'run': ['跑', '运行', '经营', '流淌'],
    'walk': ['走', '步行', '散步', '行走'],
    'go': ['去', '走', '进行', '变成'],
    'come': ['来', '到达', '出现', '发生'],
    'get': ['得到', '获得', '变得', '到达'],
    'take': ['拿', '取', '带走', '花费'],
    'give': ['给', '给予', '提供', '赠送'],
    'put': ['放', '置', '安装', '表达'],
    'make': ['制作', '使', '做', '创造'],
    'do': ['做', '进行', '完成', '处理'],
    'have': ['有', '拥有', '吃', '经历'],
    'be': ['是', '存在', '成为', '位于'],
    'good': ['好的', '良好的', '善良的', '有益的'],
    'bad': ['坏的', '糟糕的', '有害的', '严重的'],
    'big': ['大的', '巨大的', '重要的', '年长的'],
    'small': ['小的', '微小的', '少量的', '细小的'],
    'new': ['新的', '最新的', '崭新的', '现代的'],
    'old': ['老的', '旧的', '古老的', '年长的'],
    'long': ['长的', '长时间的', '久远的', '冗长的'],
    'short': ['短的', '矮的', '简短的', '不足的'],
    'high': ['高的', '高度的', '高级的', '昂贵的'],
    'low': ['低的', '矮的', '少量的', '沮丧的'],
    'fast': ['快的', '迅速的', '紧的', '牢固的'],
    'slow': ['慢的', '缓慢的', '迟钝的', '不活跃的'],
    'hot': ['热的', '炎热的', '辣的', '流行的'],
    'cold': ['冷的', '寒冷的', '冷淡的', '感冒'],
    'warm': ['温暖的', '暖和的', '热情的', '温和的'],
    'cool': ['凉爽的', '酷的', '冷静的', '很棒的'],
    'happy': ['快乐的', '高兴的', '幸福的', '满意的'],
    'sad': ['悲伤的', '难过的', '可悲的', '令人遗憾的'],
    'love': ['爱', '喜欢', '热爱', '恋爱'],
    'like': ['喜欢', '类似', '像', '想要'],
    'want': ['想要', '需要', '缺乏', '希望'],
    'need': ['需要', '必要', '贫困', '困难'],
    'help': ['帮助', '援助', '有助于', '避免'],
    'time': ['时间', '次数', '时代', '倍数'],
    'day': ['天', '日子', '白天', '时代'],
    'night': ['夜晚', '晚上', '黑夜', '夜生活'],
    'morning': ['早晨', '上午', '黎明', '早期'],
    'afternoon': ['下午', '午后'],
    'evening': ['傍晚', '晚上', '黄昏'],
    'week': ['星期', '周', '一周'],
    'month': ['月', '月份', '一个月'],
    'year': ['年', '年份', '岁', '学年'],
    'today': ['今天', '现在', '当今'],
    'tomorrow': ['明天', '未来'],
    'yesterday': ['昨天', '过去'],
    'house': ['房子', '住宅', '家', '议院'],
    'home': ['家', '家乡', '住所', '本国的'],
    'school': ['学校', '学院', '流派', '鱼群'],
    'book': ['书', '书籍', '预订', '记录'],
    'car': ['汽车', '车辆', '车厢'],
    'food': ['食物', '食品', '养料', '粮食'],
    'water': ['水', '浇水', '海域', '水位'],
    'money': ['钱', '金钱', '货币', '财富'],
    'people': ['人们', '民族', '人民', '人类'],
    'person': ['人', '个人', '人物', '身体'],
    'man': ['男人', '人', '人类', '丈夫'],
    'woman': ['女人', '妇女', '女性'],
    'child': ['孩子', '儿童', '子女', '产物'],
    'friend': ['朋友', '友人', '支持者'],
    'family': ['家庭', '家族', '亲属', '家人']
  };
  
  const wordLower = word.toLowerCase();
  return multiTranslations[wordLower] || [];
}

// 备用翻译方案 - 扩展词典
async function fallbackTranslation(word) {
  const basicDict = {
    // 常用词汇
    'hello': '你好，问候',
    'world': '世界，全球',
    'good': '好的，良好的',
    'bad': '坏的，糟糕的',
    'yes': '是的，同意',
    'no': '不，否定',
    'thank': '感谢，谢谢',
    'please': '请，拜托',
    'sorry': '对不起，抱歉',
    'welcome': '欢迎，不客气',
    'love': '爱，喜欢',
    'like': '喜欢，类似',
    'time': '时间，次数',
    'day': '天，日子',
    'night': '夜晚，晚上',
    'morning': '早晨，上午',
    'afternoon': '下午',
    'evening': '傍晚，晚上',
    'today': '今天',
    'tomorrow': '明天',
    'yesterday': '昨天',
    'week': '星期，周',
    'month': '月，月份',
    'year': '年，年份',
    'hour': '小时，钟头',
    'minute': '分钟，微小的',
    'second': '秒，第二',
    'work': '工作，劳动',
    'study': '学习，研究',
    'learn': '学习，了解',
    'teach': '教，教授',
    'read': '读，阅读',
    'write': '写，书写',
    'speak': '说话，讲',
    'listen': '听，倾听',
    'see': '看见，明白',
    'look': '看，外观',
    'watch': '观看，手表',
    'hear': '听见，听说',
    'think': '想，认为',
    'know': '知道，了解',
    'understand': '理解，明白',
    'remember': '记住，回忆',
    'forget': '忘记，遗忘',
    'help': '帮助，援助',
    'need': '需要，必要',
    'want': '想要，缺乏',
    'give': '给，给予',
    'take': '拿，取',
    'get': '得到，获得',
    'put': '放，置',
    'make': '制作，使',
    'do': '做，进行',
    'go': '去，走',
    'come': '来，到达',
    'run': '跑，运行',
    'walk': '走，步行',
    'sit': '坐，就座',
    'stand': '站，站立',
    'sleep': '睡觉，睡眠',
    'eat': '吃，进食',
    'drink': '喝，饮用',
    'play': '玩，播放',
    'sing': '唱，歌唱',
    'dance': '跳舞，舞蹈',
    'smile': '微笑，笑容',
    'laugh': '笑，大笑',
    'cry': '哭，叫喊',
    'happy': '快乐的，高兴的',
    'sad': '悲伤的，难过的',
    'angry': '生气的，愤怒的',
    'excited': '兴奋的，激动的',
    'tired': '疲倦的，累的',
    'hungry': '饥饿的',
    'thirsty': '口渴的',
    'hot': '热的，炎热的',
    'cold': '冷的，寒冷的',
    'warm': '温暖的，暖和的',
    'cool': '凉爽的，酷的',
    'big': '大的，巨大的',
    'small': '小的，微小的',
    'large': '大的，广阔的',
    'little': '小的，少的',
    'long': '长的，长时间的',
    'short': '短的，矮的',
    'tall': '高的，身材高的',
    'high': '高的，高度的',
    'low': '低的，矮的',
    'fast': '快的，迅速的',
    'slow': '慢的，缓慢的',
    'new': '新的，最新的',
    'old': '老的，旧的',
    'young': '年轻的，幼小的',
    'beautiful': '美丽的，漂亮的',
    'ugly': '丑陋的，难看的',
    'nice': '好的，美好的',
    'great': '伟大的，极好的',
    'wonderful': '精彩的，极好的',
    'amazing': '令人惊奇的，了不起的',
    'interesting': '有趣的，有意思的',
    'boring': '无聊的，乏味的',
    'easy': '容易的，简单的',
    'difficult': '困难的，艰难的',
    'hard': '困难的，坚硬的',
    'simple': '简单的，朴素的',
    'complex': '复杂的，综合的',
    'important': '重要的，重大的',
    'necessary': '必要的，必需的',
    'possible': '可能的，可行的',
    'impossible': '不可能的',
    'right': '正确的，右边的',
    'wrong': '错误的，不对的',
    'true': '真实的，正确的',
    'false': '错误的，虚假的',
    'real': '真实的，实际的',
    'fake': '假的，伪造的'
  };
  
  const translation = basicDict[word.toLowerCase()];
  return translation || `${word} (暂无翻译)`;
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
        return `<span class="lv-highlighted-word" data-word="${match.toLowerCase()}">${match}</span>`;
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
    const translationData = await translateWord(word);
    const rect = element.getBoundingClientRect();
    
    const tooltipContent = createTranslationContent(word, translationData, true);
    const tooltip = createTooltip(tooltipContent, rect);
    tooltip.innerHTML = tooltipContent;
    
    // 添加收藏按钮事件
    const favoriteBtn = tooltip.querySelector('.lv-favorite-btn');
    if (favoriteBtn) {
      favoriteBtn.addEventListener('click', () => {
        toggleFavorite(word, favoriteBtn);
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

// 页面加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
} 