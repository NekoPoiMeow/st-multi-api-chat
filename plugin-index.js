/**
 * Multi-API Group Chat Extension for SillyTavern
 * Allows different characters in group chats to use different API endpoints
 */

import { extension_settings, getContext, loadExtensionSettings, saveExtensionSettings } from "../../../extensions.js";
import { callPopup, eventSource, event_types, generateQuietPrompt, getCurrentChatId, getRequestHeaders, is_group_generating, selected_group } from "../../../../script.js";
import { groups, group_generation_mode, generateGroupWrapper } from "../../../group-chats.js";
import { registerSlashCommand } from "../../../slash-commands.js";
import { SECRET_KEYS, secret_state, writeSecret } from "../../../secrets.js";

const extensionName = "multi-api-chat";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const defaultSettings = {
    enabled: false,
    configs: {},
    characterMappings: {},
    defaultConfig: null,
    autoAssign: true,
    showDebugInfo: false
};

// API源类型映射
const API_SOURCES = {
    "chat": {
        "openai": "OpenAI (Chat Completion)",
        "openrouter": "OpenRouter", 
        "claude": "Claude",
        "windowai": "Window AI",
        "openai_custom": "Custom (OpenAI-compatible)",
        "mistralai": "MistralAI",
        "custom": "Custom (Generic)",
        "cohere": "Cohere",
        "perplexity": "Perplexity",
        "groq": "Groq",
        "01ai": "01.AI",
        "infermaticai": "InfermaticAI",
        "dreamgen": "DreamGen"
    },
    "text": {
        "kobold": "KoboldAI",
        "koboldhorde": "KoboldAI Horde", 
        "textgenerationwebui": "Text Generation WebUI (oobabooga)",
        "novel": "NovelAI",
        "ooba": "Default (oobabooga)",
        "tabby": "TabbyAPI",
        "aphrodite": "Aphrodite",
        "llamacpp": "llama.cpp"
    }
};

let extensionSettings = {};
let originalApiSettings = null;

// 创建设置面板HTML
function getSettingsHtml() {
    const configs = extensionSettings.configs || {};
    const mappings = extensionSettings.characterMappings || {};
    
    return `
    <div class="multi-api-settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>Multi-API Group Chat</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <!-- 主开关 -->
                <div class="multi-api-toggle-block">
                    <label class="checkbox_label">
                        <input id="multi_api_enabled" type="checkbox" ${extensionSettings.enabled ? 'checked' : ''} />
                        <span>Enable Multi-API Mode</span>
                    </label>
                    <div class="toggle-description">When enabled, different characters in group chats can use different APIs</div>
                </div>

                <!-- 自动分配开关 -->
                <div class="multi-api-toggle-block">
                    <label class="checkbox_label">
                        <input id="multi_api_auto_assign" type="checkbox" ${extensionSettings.autoAssign ? 'checked' : ''} />
                        <span>Auto-assign APIs to unmapped characters</span>
                    </label>
                </div>

                <!-- API配置管理 -->
                <div class="multi-api-section">
                    <h4>API Configurations <button id="add_api_config" class="menu_button">+ Add New</button></h4>
                    <div id="api_config_list" class="api-config-container">
                        ${Object.entries(configs).map(([id, config]) => getConfigItemHtml(id, config)).join('')}
                    </div>
                </div>

                <!-- 角色映射 -->
                <div class="multi-api-section">
                    <h4>Character API Mappings</h4>
                    <div id="character_mappings" class="character-mapping-container">
                        ${getCharacterMappingHtml()}
                    </div>
                </div>

                <!-- 调试信息 -->
                <div class="multi-api-section">
                    <label class="checkbox_label">
                        <input id="multi_api_debug" type="checkbox" ${extensionSettings.showDebugInfo ? 'checked' : ''} />
                        <span>Show debug information in console</span>
                    </label>
                </div>

                <!-- 快速操作 -->
                <div class="multi-api-actions">
                    <button id="test_current_config" class="menu_button">Test Current API</button>
                    <button id="import_config" class="menu_button">Import Config</button>
                    <button id="export_config" class="menu_button">Export Config</button>
                </div>
            </div>
        </div>
    </div>`;
}

// 获取单个API配置项的HTML
function getConfigItemHtml(id, config) {
    const isDefault = extensionSettings.defaultConfig === id;
    return `
    <div class="api-config-item" data-id="${id}">
        <div class="config-header">
            <span class="config-name">${config.name}</span>
            <span class="config-type">${config.type}/${config.source}</span>
            ${isDefault ? '<span class="default-badge">DEFAULT</span>' : ''}
        </div>
        <div class="config-details">
            <div>Model: ${config.model || 'Not set'}</div>
            <div>Endpoint: ${config.endpoint || 'Default'}</div>
        </div>
        <div class="config-actions">
            <button class="edit_config menu_button" data-id="${id}">Edit</button>
            ${!isDefault ? `<button class="set_default menu_button" data-id="${id}">Set Default</button>` : ''}
            <button class="delete_config menu_button" data-id="${id}">Delete</button>
        </div>
    </div>`;
}

// 获取角色映射HTML
function getCharacterMappingHtml() {
    if (!selected_group) {
        return '<div class="no-group-selected">Please select a group chat to configure character mappings</div>';
    }
    
    const group = groups.find(g => g.id === selected_group);
    if (!group) return '';
    
    const mappings = extensionSettings.characterMappings || {};
    const configs = extensionSettings.configs || {};
    
    return group.members.map(member => {
        const charId = member.replace('.png', '');
        const currentMapping = mappings[charId] || '';
        
        return `
        <div class="character-mapping-item">
            <span class="character-name">${charId}</span>
            <select class="character_api_mapping" data-character="${charId}">
                <option value="">Use Default</option>
                ${Object.entries(configs).map(([id, config]) => 
                    `<option value="${id}" ${currentMapping === id ? 'selected' : ''}>${config.name}</option>`
                ).join('')}
            </select>
        </div>`;
    }).join('');
}

// 创建API配置编辑对话框
function showConfigEditDialog(configId = null) {
    const config = configId ? extensionSettings.configs[configId] : {
        name: '',
        type: 'chat',
        source: 'openai',
        endpoint: '',
        model: '',
        key: '',
        temperature: 0.7,
        max_tokens: 2048,
        headers: {}
    };

    const html = `
    <div class="api-config-editor">
        <h3>${configId ? 'Edit' : 'Add'} API Configuration</h3>
        
        <div class="config-field">
            <label>Configuration Name:</label>
            <input type="text" id="config_name" value="${config.name}" placeholder="e.g., GPT-4 API">
        </div>

        <div class="config-field">
            <label>API Type:</label>
            <select id="config_type">
                <option value="chat" ${config.type === 'chat' ? 'selected' : ''}>Chat Completion</option>
                <option value="text" ${config.type === 'text' ? 'selected' : ''}>Text Completion</option>
            </select>
        </div>

        <div class="config-field">
            <label>API Source:</label>
            <select id="config_source">
                ${Object.entries(API_SOURCES[config.type || 'chat']).map(([value, label]) =>
                    `<option value="${value}" ${config.source === value ? 'selected' : ''}>${label}</option>`
                ).join('')}
            </select>
        </div>

        <div class="config-field">
            <label>API Endpoint (leave empty for default):</label>
            <input type="text" id="config_endpoint" value="${config.endpoint}" placeholder="https://api.openai.com/v1">
        </div>

        <div class="config-field">
            <label>Model:</label>
            <input type="text" id="config_model" value="${config.model}" placeholder="gpt-3.5-turbo">
        </div>

        <div class="config-field">
            <label>API Key (optional, uses main key if empty):</label>
            <input type="password" id="config_key" value="${config.key}" placeholder="sk-...">
        </div>

        <div class="config-field">
            <label>Temperature:</label>
            <input type="number" id="config_temperature" value="${config.temperature}" min="0" max="2" step="0.1">
        </div>

        <div class="config-field">
            <label>Max Tokens:</label>
            <input type="number" id="config_max_tokens" value="${config.max_tokens}" min="100" max="32000">
        </div>

        <div class="config-actions">
            <button id="save_config" class="menu_button">Save</button>
            <button id="cancel_config" class="menu_button">Cancel</button>
        </div>
    </div>`;

    callPopup(html, 'text', '', { wide: true });

    // 绑定事件
    $('#config_type').on('change', function() {
        const type = $(this).val();
        const sourceSelect = $('#config_source');
        sourceSelect.empty();
        Object.entries(API_SOURCES[type]).forEach(([value, label]) => {
            sourceSelect.append(`<option value="${value}">${label}</option>`);
        });
    });

    $('#save_config').on('click', async function() {
        const newConfig = {
            name: $('#config_name').val() || 'Unnamed Config',
            type: $('#config_type').val(),
            source: $('#config_source').val(),
            endpoint: $('#config_endpoint').val(),
            model: $('#config_model').val(),
            key: $('#config_key').val(),
            temperature: parseFloat($('#config_temperature').val()),
            max_tokens: parseInt($('#config_max_tokens').val())
        };

        const id = configId || Date.now().toString();
        extensionSettings.configs[id] = newConfig;

        // 如果是第一个配置，设为默认
        if (Object.keys(extensionSettings.configs).length === 1) {
            extensionSettings.defaultConfig = id;
        }

        await saveSettings();
        callPopup('', 'clear');
        updateSettingsUI();
    });

    $('#cancel_config').on('click', () => callPopup('', 'clear'));
}

// 保存原始API设置
function saveOriginalApiSettings() {
    const context = getContext();
    originalApiSettings = {
        main_api: context.main_api,
        api_server: context.api_server,
        api_server_textgenerationwebui: context.api_server_textgenerationwebui,
        online_status: context.online_status,
        // 保存所有可能的API设置
        settings: JSON.parse(JSON.stringify(context.settings))
    };
}

// 切换到指定API配置
async function switchToApiConfig(configId) {
    const config = extensionSettings.configs[configId];
    if (!config) {
        console.error(`[Multi-API] Config not found: ${configId}`);
        return;
    }

    if (extensionSettings.showDebugInfo) {
        console.log(`[Multi-API] Switching to: ${config.name} (${config.type}/${config.source})`);
    }

    const context = getContext();
    
    // 根据API类型切换
    if (config.type === 'chat') {
        context.main_api = 'openai';
        
        // 设置聊天补全源
        if (context.settings.openai) {
            context.settings.openai.chat_completion_source = config.source;
            context.settings.openai.openai_model = config.model;
            context.settings.openai.reverse_proxy = config.endpoint;
            context.settings.openai.temp_openai = config.temperature;
            context.settings.openai.openai_max_tokens = config.max_tokens;
            
            // 如果有自定义key，设置它
            if (config.key) {
                await writeSecret(SECRET_KEYS.OPENAI, config.key);
            }
        }
    } else if (config.type === 'text') {
        // 文本补全API
        context.main_api = config.source;
        
        if (config.endpoint) {
            context.api_server_textgenerationwebui = config.endpoint;
        }
    }

    // 触发API变更事件
    eventSource.emit(event_types.SETTINGS_UPDATED);
}

// 恢复原始API设置
async function restoreOriginalApiSettings() {
    if (!originalApiSettings) return;

    const context = getContext();
    context.main_api = originalApiSettings.main_api;
    context.api_server = originalApiSettings.api_server;
    context.api_server_textgenerationwebui = originalApiSettings.api_server_textgenerationwebui;
    
    // 恢复设置
    Object.assign(context.settings, originalApiSettings.settings);
    
    eventSource.emit(event_types.SETTINGS_UPDATED);
}

// 拦截群聊生成
async function interceptGroupGeneration(args, original) {
    if (!extensionSettings.enabled || !selected_group) {
        return original(args);
    }

    // 获取当前要发言的角色
    const group = groups.find(g => g.id === selected_group);
    if (!group) return original(args);

    // 获取下一个发言者
    const activatedMembers = args.activatedMembers || [];
    const nextSpeaker = activatedMembers[0];
    
    if (nextSpeaker) {
        const charId = nextSpeaker.replace('.png', '');
        const mappedConfig = extensionSettings.characterMappings[charId];
        
        if (mappedConfig && extensionSettings.configs[mappedConfig]) {
            await switchToApiConfig(mappedConfig);
        } else if (extensionSettings.autoAssign && extensionSettings.defaultConfig) {
            await switchToApiConfig(extensionSettings.defaultConfig);
        }
    }

    const result = await original(args);
    
    // 可选：生成后恢复设置
    // await restoreOriginalApiSettings();
    
    return result;
}

// 更新设置UI
function updateSettingsUI() {
    $('#api_config_list').html(
        Object.entries(extensionSettings.configs || {})
            .map(([id, config]) => getConfigItemHtml(id, config))
            .join('')
    );
    
    $('#character_mappings').html(getCharacterMappingHtml());
    attachSettingsListeners();
}

// 绑定设置面板事件
function attachSettingsListeners() {
    $('#multi_api_enabled').off('change').on('change', async function() {
        extensionSettings.enabled = $(this).prop('checked');
        if (extensionSettings.enabled) {
            saveOriginalApiSettings();
        } else {
            await restoreOriginalApiSettings();
        }
        await saveSettings();
    });

    $('#multi_api_auto_assign').off('change').on('change', async function() {
        extensionSettings.autoAssign = $(this).prop('checked');
        await saveSettings();
    });

    $('#multi_api_debug').off('change').on('change', async function() {
        extensionSettings.showDebugInfo = $(this).prop('checked');
        await saveSettings();
    });

    $('#add_api_config').off('click').on('click', () => showConfigEditDialog());

    $('.edit_config').off('click').on('click', function() {
        showConfigEditDialog($(this).data('id'));
    });

    $('.delete_config').off('click').on('click', async function() {
        const id = $(this).data('id');
        if (confirm(`Delete configuration "${extensionSettings.configs[id].name}"?`)) {
            delete extensionSettings.configs[id];
            // 如果删除的是默认配置，重新设置默认
            if (extensionSettings.defaultConfig === id) {
                const remaining = Object.keys(extensionSettings.configs);
                extensionSettings.defaultConfig = remaining.length > 0 ? remaining[0] : null;
            }
            await saveSettings();
            updateSettingsUI();
        }
    });

    $('.set_default').off('click').on('click', async function() {
        extensionSettings.defaultConfig = $(this).data('id');
        await saveSettings();
        updateSettingsUI();
    });

    $('.character_api_mapping').off('change').on('change', async function() {
        const character = $(this).data('character');
        const configId = $(this).val();
        
        if (configId) {
            extensionSettings.characterMappings[character] = configId;
        } else {
            delete extensionSettings.characterMappings[character];
        }
        
        await saveSettings();
    });

    $('#test_current_config').off('click').on('click', async function() {
        const testPrompt = "Say 'Hello' and identify yourself briefly.";
        const response = await generateQuietPrompt(testPrompt);
        if (response) {
            callPopup(`<div><h3>API Test Result</h3><p>${response}</p></div>`, 'text');
        }
    });

    $('#import_config').off('click').on('click', function() {
        $('#multi_api_import_file').trigger('click');
    });

    $('#export_config').off('click').on('click', function() {
        const data = JSON.stringify(extensionSettings, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'multi-api-config.json';
        a.click();
        URL.revokeObjectURL(url);
    });
}

// 保存设置
async function saveSettings() {
    saveExtensionSettings(extensionName, extensionSettings);
}

// 加载设置
async function loadSettings() {
    extensionSettings = extension_settings[extensionName] || {};
    
    // 合并默认设置
    Object.keys(defaultSettings).forEach(key => {
        if (extensionSettings[key] === undefined) {
            extensionSettings[key] = defaultSettings[key];
        }
    });
    
    // 初始化空对象
    if (!extensionSettings.configs) extensionSettings.configs = {};
    if (!extensionSettings.characterMappings) extensionSettings.characterMappings = {};
}

// jQuery入口
jQuery(async () => {
    // 加载设置
    await loadExtensionSettings(extensionName);
    await loadSettings();

    // 添加设置面板
    const settingsHtml = getSettingsHtml();
    $('#extensions_settings').append(settingsHtml);
    
    // 添加导入文件输入
    $('body').append('<input type="file" id="multi_api_import_file" style="display:none" accept=".json">');
    
    $('#multi_api_import_file').on('change', async function(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                const imported = JSON.parse(e.target.result);
                extensionSettings = { ...extensionSettings, ...imported };
                await saveSettings();
                updateSettingsUI();
                toastr.success('Configuration imported successfully');
            } catch (err) {
                toastr.error('Failed to import configuration');
            }
        };
        reader.readAsText(file);
    });

    // 绑定事件
    attachSettingsListeners();

    // 监听群聊切换
    eventSource.on(event_types.GROUP_CHAT_SELECTED, updateSettingsUI);

    // 拦截群聊生成
    const originalGroupGenerate = window.generateGroupWrapper;
    if (originalGroupGenerate) {
        window.generateGroupWrapper = function(...args) {
            return interceptGroupGeneration(args, originalGroupGenerate);
        };
    }

    console.log('[Multi-API Chat] Extension loaded');
});